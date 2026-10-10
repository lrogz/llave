"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { BUCKET, MAX_ENVIO, QUIEN_PAGA, TIPOS_SERVICIO, extension } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const TIPOS = new Set<string>(TIPOS_SERVICIO.map(([v]) => v));
const PAGAN = new Set<string>(QUIEN_PAGA.map(([v]) => v));

function refrescar(propiedadId?: string) {
  if (propiedadId) revalidatePath(`/propiedades/${propiedadId}`);
  revalidatePath("/pagos");
  revalidatePath("/hoy");
}

export async function agregarServicio(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const propiedadId = txt(f, "propiedad_id", 40);
  if (!esUuid(propiedadId)) return;
  const { data: prop } = await supabase.from("propiedades").select("id").eq("id", propiedadId).maybeSingle();
  if (!prop) return;
  const tipo = txt(f, "tipo", 30);
  const quien = txt(f, "quien_paga", 20);
  const per = txt(f, "periodicidad", 12);
  const dia = Math.round(Number(txt(f, "dia_vencimiento", 2)));
  await supabase.from("servicios").insert({
    organizacion_id: org.id,
    propiedad_id: prop.id,
    tipo: TIPOS.has(tipo) ? tipo : "otro",
    compania: txt(f, "compania", 80) || null,
    numero_servicio: txt(f, "numero_servicio", 40) || null,
    quien_paga: PAGAN.has(quien) ? quien : "inquilino",
    periodicidad: ["mensual", "bimestral", "anual"].includes(per) ? per : "mensual",
    dia_vencimiento: dia >= 1 && dia <= 31 ? dia : null,
  });
  await supabase.rpc("actualizar_cobros", { org: org.id });
  refrescar(prop.id);
}

export async function quitarServicio(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "id", 40);
  if (!esUuid(id)) return;
  const { data } = await supabase.from("servicios").select("id, propiedad_id").eq("id", id).maybeSingle();
  if (!data) return;
  const { error } = await supabase.from("servicios").delete().eq("id", data.id);
  if (error) throw new Error("Solo la dueña de la cuenta puede quitar servicios.");
  refrescar(data.propiedad_id);
}

// Marca un recibo como pagado, con monto y comprobante opcional.
export async function pagarRecibo(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const id = txt(f, "id", 40);
  if (!esUuid(id)) return;
  const { data: r } = await supabase.from("recibos_servicio").select("id").eq("id", id).maybeSingle();
  if (!r) return;
  const montoTxt = txt(f, "monto", 20).replace(/[^0-9.]/g, "");
  let comprobante: string | null = null;
  const archivo = f.get("comprobante");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > MAX_ENVIO) throw new Error("El comprobante pesa más de 4 MB.");
    comprobante = `${org.id}/servicios/${r.id}/${randomUUID()}.${extension(archivo.name, archivo.type)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(comprobante, archivo, { contentType: archivo.type });
    if (error) throw new Error("No pudimos subir el comprobante.");
  }
  await supabase
    .from("recibos_servicio")
    .update({
      estado: "pagado",
      pagado_at: new Date().toISOString(),
      ...(montoTxt ? { monto: Number(montoTxt) } : {}),
      ...(comprobante ? { comprobante_path: comprobante } : {}),
    })
    .eq("id", r.id);
  refrescar();
}

export async function deshacerRecibo(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const id = txt(f, "id", 40);
  if (!esUuid(id)) return;
  await supabase.from("recibos_servicio").update({ estado: "pendiente", pagado_at: null }).eq("id", id);
  await supabase.rpc("actualizar_cobros", { org: org.id });
  refrescar();
}
