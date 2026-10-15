"use server";

import { revalidatePath } from "next/cache";
import { calcularAumento, pctTexto, type Ajuste } from "@/lib/aumento";
import { primerNombre } from "@/lib/crm";
import { correoConfigurado, enviarCorreos, plantilla } from "@/lib/correo";
import { formatoFecha, pesos } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";
import { origen } from "@/lib/util";
import { enviarPlantilla, telefonoValido, whatsappConfigurado } from "@/lib/whatsapp";

export type EstadoRenovar = { ok: boolean; mensaje: string; aviso?: string; telefono?: string | null; textoWA?: string } | null;
const txt = (f: FormData, k: string, max = 60) => String(f.get(k) ?? "").trim().slice(0, max);
const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const valido = (e?: string | null) => !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const hoyMX = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());

type Contrato = Ajuste & {
  id: string;
  inicio: string;
  fin: string;
  renta: number;
  inquilino_id: string;
  inquilinos: { nombre: string; email: string | null; telefono: string | null } | null;
  propiedades: { nombre: string } | null;
};

// Renueva el contrato y, si cambia la renta, la programa desde la fecha nueva, guarda el cálculo y avisa al inquilino.
export async function renovar(_: EstadoRenovar, f: FormData): Promise<EstadoRenovar> {
  const { supabase, org, user } = await sesionConOrg();
  const id = txt(f, "id", 40);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, mensaje: "Contrato no válido." };
  const { data } = await supabase
    .from("contratos")
    .select("id, inicio, fin, renta, inquilino_id, ajuste_tipo, ajuste_pct, ajuste_tope, inquilinos(nombre, email, telefono), propiedades(nombre)")
    .eq("id", id)
    .maybeSingle();
  const c = data as unknown as Contrato | null;
  if (!c) return { ok: false, mensaje: "No encontramos el contrato." };
  const fin = txt(f, "fin", 10);
  const desde = txt(f, "desde", 10);
  const renta = Math.round(Number(txt(f, "renta", 20).replace(/[^0-9.]/g, "")) * 100) / 100;
  if (!esFecha(fin) || fin <= c.fin) return { ok: false, mensaje: "La nueva fecha de fin debe ser después de la actual." };
  if (!esFecha(desde) || desde <= c.inicio || desde > fin) return { ok: false, mensaje: "La renta nueva debe empezar dentro del nuevo periodo." };
  if (!(renta > 0)) return { ok: false, mensaje: "Pon la renta." };

  const anterior = Number(c.renta);
  const cambia = renta !== anterior;
  const calc = await calcularAumento(supabase, anterior, { ajuste_tipo: c.ajuste_tipo, ajuste_pct: c.ajuste_pct, ajuste_tope: c.ajuste_tope }, desde);
  const metodo = !cambia ? null : calc.metodo !== "ninguno" && renta === calc.rentaNueva ? calc.metodo : "manual";
  // Con INPC o % fijo se guarda el % calculado (la renta se redondea al peso); a mano, el % que resulta.
  const pct = metodo === "inpc" || metodo === "fijo" ? calc.pct : Math.round((renta / anterior - 1) * 100_000) / 1000;
  const mesDesde = `${desde.slice(0, 7)}-01`;
  const mesHoy = `${hoyMX().slice(0, 7)}-01`;

  if (cambia && mesDesde <= mesHoy) {
    await supabase.from("contratos").update({ fin, activo: true, renta, renta_programada: null, renta_desde: null }).eq("id", c.id);
  } else if (cambia) {
    await supabase.from("contratos").update({ fin, activo: true, renta_programada: renta, renta_desde: desde }).eq("id", c.id);
  } else {
    await supabase.from("contratos").update({ fin, activo: true, renta_programada: null, renta_desde: null }).eq("id", c.id);
  }
  // Rentas aún sin pagar desde el mes en que entra la nueva toman el monto nuevo.
  if (cambia) await supabase.from("cobros_renta").update({ monto: renta }).eq("contrato_id", c.id).eq("estado", "pendiente").gte("periodo", mesDesde);

  let token: string | null = null;
  if (cambia) {
    const { data: a } = await supabase
      .from("aumentos_renta")
      .insert({
        organizacion_id: org.id,
        contrato_id: c.id,
        renta_anterior: anterior,
        renta_nueva: renta,
        pct,
        metodo,
        inpc_inicial: metodo === "inpc" ? calc.inpcInicial : null,
        inpc_final: metodo === "inpc" ? calc.inpcFinal : null,
        periodo_inicial: metodo === "inpc" ? calc.periodoInicial : null,
        periodo_final: metodo === "inpc" ? calc.periodoFinal : null,
        desde,
        nuevo_fin: fin,
      })
      .select("id, token")
      .single();
    token = a?.token ?? null;
  }

  const fmt = (n: number) => pesos.format(n);
  await supabase.from("notas").insert({
    organizacion_id: org.id,
    inquilino_id: c.inquilino_id,
    autor_email: user.email ?? null,
    texto: `Renovó contrato hasta ${fin}, renta ${fmt(renta)}${cambia ? ` desde ${desde} (antes ${fmt(anterior)}, ${pct >= 0 ? "+" : ""}${pctTexto(pct)}${metodo === "inpc" ? " por INPC" : ""})` : ""}.`,
  });

  // Aviso al inquilino
  const inq = c.inquilinos;
  const base = await origen();
  const link = token ? `${base}/n/${token}` : null;
  const casa = c.propiedades?.nombre ?? "tu casa";
  const textoRenta = `${fmt(renta)}${cambia ? ` (${pct >= 0 ? "+" : ""}${pctTexto(pct)}${metodo === "inpc" ? " por inflación" : ""})` : ""}`;
  let avisos = 0;
  if (f.get("avisar") === "on" && inq && cambia && link) {
    if (correoConfigurado() && valido(inq.email)) {
      const r = await enviarCorreos([
        {
          para: inq.email!,
          asunto: `Renovación de tu contrato de ${casa}`,
          html: plantilla({
            org: org.nombre,
            titulo: `${primerNombre(inq.nombre)}, tu contrato se renovó`,
            parrafos: [
              `Tu contrato de ${casa} queda vigente hasta el ${formatoFecha(fin)}.`,
              `A partir del ${formatoFecha(desde)} la renta será de ${textoRenta}.`,
              metodo === "inpc" ? "El ajuste se calculó con el Índice Nacional de Precios al Consumidor (INPC) que publica el INEGI. En el link ves el cálculo completo." : "En el link ves el detalle.",
            ],
            boton: { texto: "Ver el detalle", url: link },
          }),
          responderA: user.email ?? null,
        },
      ]).catch(() => ({ enviados: 0 }));
      avisos += r.enviados;
    }
    if (whatsappConfigurado() && telefonoValido(inq.telefono)) {
      try {
        await enviarPlantilla({ telefono: inq.telefono!, plantilla: "bk_aumento_renta", variables: [primerNombre(inq.nombre), org.nombre, casa, formatoFecha(fin), formatoFecha(desde), textoRenta, link] });
        avisos++;
      } catch {}
    }
    if (token) await supabase.from("aumentos_renta").update({ avisado_at: new Date().toISOString() }).eq("token", token);
  }

  revalidatePath(`/personas/inquilinos/${c.inquilino_id}`);
  revalidatePath("/hoy");
  return {
    ok: true,
    mensaje: !cambia ? "Contrato renovado con la misma renta." : avisos ? "Contrato renovado. Le avisamos al inquilino." : "Contrato renovado. Mándale el aviso al inquilino.",
    aviso: link ?? undefined,
    telefono: inq?.telefono ?? null,
    textoWA: link && inq ? `Hola ${primerNombre(inq.nombre)}, tu contrato de ${casa} se renovó hasta el ${formatoFecha(fin)}. A partir del ${formatoFecha(desde)} la renta será de ${textoRenta}. Aquí está el detalle: ${link}` : undefined,
  };
}
