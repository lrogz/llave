import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { diasEntre, hoyMX, primerNombre } from "./crm";
import { correoConfigurado, enviarCorreos, plantilla, type Correo } from "./correo";
import { TIPOS_SERVICIO, etiqueta, formatoFecha, pesos } from "./datos";
import { inicioDeMes, mesAnterior, mesTexto } from "./reporte";

export type TipoAviso = "renta" | "vencida" | "reporte" | "renovacion" | "servicios" | "resumen";
export const AVISOS: { clave: TipoAviso; texto: string; detalle: string }[] = [
  { clave: "renta", texto: "Aviso de renta al inquilino", detalle: "3 días antes de que venza, con su link de pago" },
  { clave: "vencida", texto: "Renta vencida", detalle: "Recordatorio al día siguiente y a la semana" },
  { clave: "reporte", texto: "Reporte mensual al dueño", detalle: "Del día 1 al 5, con rentas, trabajos y saldo" },
  { clave: "renovacion", texto: "Renovación de contrato", detalle: "Al inquilino 60 días antes de que termine" },
  { clave: "servicios", texto: "Servicios por vencer", detalle: "A quien paga (inquilino o dueño), 3 días antes" },
  { clave: "resumen", texto: "Resumen diario para ti", detalle: "Cada mañana, solo si hay algo pendiente" },
];

type Candidato = { clave: string; tipo: TipoAviso; correo: Correo };
type Org = { id: string; nombre: string; avisos: Partial<Record<TipoAviso, boolean>> | null; miembros: { email: string | null; rol: string }[] };
export type ResultadoOrg = { org: string; enviados: number; porTipo: Record<string, number>; error?: string };

const valido = (e?: string | null): e is string => !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// Corre los avisos del día. Con `soloOrg` lo hace para una administradora (botón "mandar ahora").
export async function correrAvisos(db: SupabaseClient, opciones: { soloOrg?: string; base?: string } = {}) {
  const base = opciones.base ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  let q = db.from("organizaciones").select("id, nombre, avisos, miembros(email, rol)");
  if (opciones.soloOrg) q = q.eq("id", opciones.soloOrg);
  const { data: orgs, error } = await q;
  if (error) return { ok: false, error: error.message, resultados: [] as ResultadoOrg[] };
  const resultados: ResultadoOrg[] = [];
  for (const org of (orgs ?? []) as Org[]) {
    try {
      resultados.push(await avisosDeOrg(db, org, base));
    } catch (e) {
      resultados.push({ org: org.nombre, enviados: 0, porTipo: {}, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ok: true, correo: correoConfigurado(), resultados };
}

async function avisosDeOrg(db: SupabaseClient, org: Org, base: string): Promise<ResultadoOrg> {
  await db.rpc("generar_cobros", { org: org.id });
  const activo = (t: TipoAviso) => org.avisos?.[t] !== false;
  const hoy = hoyMX();
  const responsables = org.miembros.filter((m) => (m.rol === "propietario" || m.rol === "admin") && valido(m.email)).map((m) => m.email!);
  const responderA = responsables[0] ?? null;
  const c: Candidato[] = [];
  const correo = (para: string, asunto: string, html: string): Correo => ({ para, asunto, html, responderA });

  // Rentas: aviso 3 días antes y recordatorio de vencida
  const { data: cobros } = await db
    .from("cobros_renta")
    .select("id, monto, recargo, vence, estado, token, contratos(inquilinos(nombre, email), propiedades(nombre))")
    .eq("organizacion_id", org.id)
    .in("estado", ["pendiente", "vencido"])
    .gte("vence", hoyMX(-7))
    .lte("vence", hoyMX(3));
  for (const r of (cobros ?? []) as unknown as {
    id: string;
    monto: number;
    recargo: number;
    vence: string;
    estado: string;
    token: string;
    contratos: { inquilinos: { nombre: string; email: string | null } | null; propiedades: { nombre: string } | null } | null;
  }[]) {
    const inq = r.contratos?.inquilinos;
    if (!valido(inq?.email)) continue;
    const casa = r.contratos?.propiedades?.nombre ?? "tu casa";
    const total = pesos.format(Number(r.monto) + Number(r.recargo ?? 0));
    const link = { texto: "Ver datos y subir comprobante", url: `${base}/p/${r.token}` };
    const d = diasEntre(hoy, r.vence);
    if (activo("renta") && r.estado === "pendiente" && d === 3) {
      c.push({
        clave: `renta:${r.id}`,
        tipo: "renta",
        correo: correo(inq!.email!, `Tu renta de ${casa} vence el ${formatoFecha(r.vence)}`, plantilla({
          org: org.nombre,
          titulo: `${primerNombre(inq!.nombre)}, tu renta vence en 3 días`,
          parrafos: [`La renta de ${casa} por ${total} vence el ${formatoFecha(r.vence)}.`, "En el link están los datos para depositar. Cuando pagues, sube ahí tu comprobante."],
          boton: link,
        })),
      });
    }
    if (activo("vencida") && r.estado === "vencido" && (d === -1 || d === -7)) {
      c.push({
        clave: `vencida:${r.id}:${d}`,
        tipo: "vencida",
        correo: correo(inq!.email!, `Renta pendiente de ${casa}`, plantilla({
          org: org.nombre,
          titulo: `${primerNombre(inq!.nombre)}, tu renta está pendiente`,
          parrafos: [`La renta de ${casa} por ${total} venció el ${formatoFecha(r.vence)}.`, "Si ya pagaste, sube tu comprobante en el link para que lo registremos. ¡Gracias!"],
          boton: link,
        })),
      });
    }
  }

  // Reporte del mes pasado al dueño (días 1 a 5)
  const diaMes = Number(hoy.slice(8, 10));
  if (activo("reporte") && diaMes <= 5) {
    const mesPasado = mesAnterior(inicioDeMes(hoy));
    const { data: duenos } = await db.from("duenos").select("id, nombre, email, frecuencia_reporte, propiedades(id)").eq("organizacion_id", org.id).neq("frecuencia_reporte", "solo_cambios");
    for (const d of (duenos ?? []) as { id: string; nombre: string; email: string | null; propiedades: { id: string }[] }[]) {
      if (!valido(d.email) || !d.propiedades.length) continue;
      await db.from("reportes_dueno").upsert({ organizacion_id: org.id, dueno_id: d.id, periodo: mesPasado }, { onConflict: "dueno_id,periodo", ignoreDuplicates: true });
      const { data: rep } = await db.from("reportes_dueno").select("token").eq("dueno_id", d.id).eq("periodo", mesPasado).single();
      if (!rep) continue;
      const mes = mesTexto(mesPasado);
      c.push({
        clave: `reporte:${d.id}:${mesPasado}`,
        tipo: "reporte",
        correo: correo(d.email!, `Reporte de ${mes} de tus propiedades`, plantilla({
          org: org.nombre,
          titulo: `${primerNombre(d.nombre)}, aquí está tu reporte de ${mes}`,
          parrafos: ["Rentas cobradas, trabajos realizados con fotos, gastos y tu saldo del mes, todo en un solo lugar."],
          boton: { texto: "Ver mi reporte", url: `${base}/e/${rep.token}` },
        })),
      });
    }
  }

  // Renovación: 60 días antes (ventana de 5 días por si un día no corrió)
  if (activo("renovacion")) {
    const { data: contratos } = await db
      .from("contratos")
      .select("id, fin, inquilinos(nombre, email), propiedades(nombre)")
      .eq("organizacion_id", org.id)
      .eq("activo", true)
      .gte("fin", hoyMX(55))
      .lte("fin", hoyMX(60));
    for (const k of (contratos ?? []) as unknown as { id: string; fin: string; inquilinos: { nombre: string; email: string | null } | null; propiedades: { nombre: string } | null }[]) {
      if (!valido(k.inquilinos?.email)) continue;
      const casa = k.propiedades?.nombre ?? "tu casa";
      c.push({
        clave: `renovacion:${k.id}`,
        tipo: "renovacion",
        correo: correo(k.inquilinos!.email!, `Tu contrato de ${casa} termina pronto`, plantilla({
          org: org.nombre,
          titulo: `${primerNombre(k.inquilinos!.nombre)}, ¿quieres renovar?`,
          parrafos: [`Tu contrato de ${casa} termina el ${formatoFecha(k.fin)}.`, "Responde a este correo para decirnos si te gustaría renovar y te compartimos las condiciones."],
        })),
      });
    }
  }

  // Servicios por vencer: a quien le toca pagar
  if (activo("servicios")) {
    const { data: recibos } = await db
      .from("recibos_servicio")
      .select("id, vence, monto, servicios(tipo, compania, numero_servicio, quien_paga, propiedades(id, nombre, duenos(nombre, email), contratos(activo, inquilinos(nombre, email))))")
      .eq("organizacion_id", org.id)
      .eq("estado", "pendiente")
      .eq("vence", hoyMX(3));
    for (const r of (recibos ?? []) as unknown as {
      id: string;
      vence: string;
      monto: number | null;
      servicios: {
        tipo: string;
        compania: string | null;
        numero_servicio: string | null;
        quien_paga: string;
        propiedades: { nombre: string; duenos: { nombre: string; email: string | null } | null; contratos: { activo: boolean; inquilinos: { nombre: string; email: string | null } | null }[] } | null;
      } | null;
    }[]) {
      const s = r.servicios;
      const p = s?.propiedades;
      const quien = s?.quien_paga === "dueno" ? p?.duenos : s?.quien_paga === "inquilino" ? p?.contratos.find((x) => x.activo)?.inquilinos : null;
      if (!s || !p || !valido(quien?.email)) continue;
      const servicio = etiqueta(TIPOS_SERVICIO, s.tipo);
      c.push({
        clave: `servicio:${r.id}`,
        tipo: "servicios",
        correo: correo(quien!.email!, `${servicio} de ${p.nombre} vence el ${formatoFecha(r.vence)}`, plantilla({
          org: org.nombre,
          titulo: `${primerNombre(quien!.nombre)}, recuerda pagar ${servicio.toLowerCase()}`,
          parrafos: [
            `${servicio}${s.compania ? ` (${s.compania})` : ""} de ${p.nombre} vence el ${formatoFecha(r.vence)}${r.monto != null ? ` por ${pesos.format(r.monto)}` : ""}.`,
            s.numero_servicio ? `Número de servicio: ${s.numero_servicio}.` : "",
            "Cuando lo pagues, responde a este correo con tu comprobante.",
          ].filter(Boolean),
        })),
      });
    }
  }

  // Quita los que ya se mandaron
  const claves = c.map((x) => x.clave);
  const ya = new Set<string>();
  if (claves.length) {
    const { data } = await db.from("avisos_enviados").select("clave").eq("organizacion_id", org.id).in("clave", claves);
    for (const x of data ?? []) ya.add(x.clave);
  }
  let nuevos = c.filter((x) => !ya.has(x.clave));

  // Resumen para la administradora (solo si hay algo)
  if (activo("resumen") && responsables.length) {
    const [venc, compr, aprob, parados, porVencer, serv] = await Promise.all([
      db.from("cobros_renta").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).eq("estado", "vencido"),
      db.from("cobros_renta").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).eq("estado", "por_confirmar"),
      db.from("aprobaciones").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).is("decision", null).lt("created_at", new Date(Date.now() - 48 * 3600_000).toISOString()),
      db.from("tickets").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).not("estado", "in", "(resuelto,cancelado)").lt("updated_at", new Date(Date.now() - 72 * 3600_000).toISOString()),
      db.from("contratos").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).eq("activo", true).lte("fin", hoyMX(30)),
      db.from("recibos_servicio").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).in("estado", ["pendiente", "vencido"]).lte("vence", hoyMX(3)),
    ]);
    const lineas = [
      [venc.count, "rentas atrasadas"],
      [compr.count, "comprobantes de pago por revisar"],
      [aprob.count, "aprobaciones de dueños sin respuesta"],
      [parados.count, "tickets sin movimiento en 3 días"],
      [porVencer.count, "contratos que terminan en 30 días"],
      [serv.count, "servicios vencidos o por vencer"],
    ]
      .filter(([n]) => (n as number) > 0)
      .map(([n, t]) => `• ${n} ${t}`);
    if (nuevos.length) lineas.push(`• Hoy mandamos ${nuevos.length} ${nuevos.length === 1 ? "aviso" : "avisos"} por ti a inquilinos y dueños.`);
    if (lineas.length) {
      for (const email of responsables) {
        const clave = `resumen:${hoy}:${email}`;
        if (ya.has(clave)) continue;
        nuevos.push({
          clave,
          tipo: "resumen",
          correo: { para: email, asunto: `Hoy en ${org.nombre}: ${lineas.length} ${lineas.length === 1 ? "tema" : "temas"}`, html: plantilla({ org: org.nombre, titulo: "Lo que necesita tu atención hoy", parrafos: lineas, boton: { texto: "Abrir Black Key", url: `${base}/hoy` }, pie: "Puedes apagar este resumen en Ajustes" }) },
        });
      }
      const { data } = await db.from("avisos_enviados").select("clave").eq("organizacion_id", org.id).in("clave", responsables.map((e) => `resumen:${hoy}:${e}`));
      const yaRes = new Set((data ?? []).map((x) => x.clave));
      nuevos = nuevos.filter((x) => !yaRes.has(x.clave));
    }
  }

  const porTipo: Record<string, number> = {};
  if (!nuevos.length) return { org: org.nombre, enviados: 0, porTipo };
  const r = await enviarCorreos(nuevos.map((x) => x.correo));
  const salieron = nuevos.slice(0, r.enviados);
  if (salieron.length) {
    await db.from("avisos_enviados").upsert(
      salieron.map((x) => ({ organizacion_id: org.id, clave: x.clave, tipo: x.tipo, para: x.correo.para, asunto: x.correo.asunto })),
      { onConflict: "organizacion_id,clave", ignoreDuplicates: true },
    );
  }
  for (const x of salieron) porTipo[x.tipo] = (porTipo[x.tipo] ?? 0) + 1;
  return { org: org.nombre, enviados: salieron.length, porTipo, error: r.error };
}
