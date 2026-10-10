"use server";

import { revalidatePath } from "next/cache";
import { sesionConOrg } from "@/lib/sesion";

const METODOS = ["spei", "transferencia_externa", "efectivo", "tarjeta", "oxxo"];
const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

function refrescar() {
  revalidatePath("/pagos");
  revalidatePath("/hoy");
}

async function cobroDeLaOrg(id: string) {
  const s = await sesionConOrg();
  if (!esUuid(id)) throw new Error("Cobro no válido.");
  const { data } = await s.supabase.from("cobros_renta").select("id, estado").eq("id", id).maybeSingle();
  if (!data) throw new Error("No encontramos el cobro.");
  return { ...s, cobro: data };
}

// La administradora registra un pago que recibió (o confirma el comprobante del inquilino).
export async function registrarPago(f: FormData) {
  const { supabase, cobro } = await cobroDeLaOrg(txt(f, "id", 40));
  const metodo = txt(f, "metodo", 30);
  const fecha = txt(f, "fecha", 10);
  const pagadoAt = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T12:00:00-06:00` : new Date().toISOString();
  await supabase
    .from("cobros_renta")
    .update({ estado: "pagado", metodo: METODOS.includes(metodo) ? metodo : "transferencia_externa", pagado_at: pagadoAt, nota: txt(f, "nota", 300) || null })
    .eq("id", cobro.id);
  refrescar();
}

export async function rechazarComprobante(f: FormData) {
  const { supabase, cobro } = await cobroDeLaOrg(txt(f, "id", 40));
  if (cobro.estado !== "por_confirmar") return;
  await supabase.from("cobros_renta").update({ estado: "pendiente", nota: txt(f, "nota", 300) || "Comprobante no válido" }).eq("id", cobro.id);
  // Si ya pasó la fecha, vuelve a quedar como atrasado.
  const { org } = await sesionConOrg();
  await supabase.rpc("actualizar_cobros", { org: org.id });
  refrescar();
}

export async function condonar(f: FormData) {
  const { supabase, cobro } = await cobroDeLaOrg(txt(f, "id", 40));
  await supabase.from("cobros_renta").update({ estado: "condonado", nota: txt(f, "nota", 300) || null }).eq("id", cobro.id);
  refrescar();
}

export async function deshacerPago(f: FormData) {
  const { supabase, org, cobro } = await cobroDeLaOrg(txt(f, "id", 40));
  if (cobro.estado !== "pagado" && cobro.estado !== "condonado") return;
  await supabase.from("cobros_renta").update({ estado: "pendiente", pagado_at: null, metodo: null }).eq("id", cobro.id);
  await supabase.rpc("actualizar_cobros", { org: org.id });
  refrescar();
}

export async function guardarDatosPago(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const { error } = await supabase.from("organizaciones").update({ datos_pago: txt(f, "datos_pago", 500) || null }).eq("id", org.id);
  if (error) throw new Error("Solo la dueña de la cuenta puede cambiar los datos de pago.");
  revalidatePath("/pagos");
}
