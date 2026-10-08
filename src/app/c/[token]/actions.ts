"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

type Respuesta =
  | { modo: "remota"; monto: string; incluyeMateriales: boolean; garantiaDias: string; fechas: string[]; notas: string }
  | { modo: "visita"; visita: string; notas: string }
  | { modo: "descartar" };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export async function responderSolicitud(token: string, r: Respuesta): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: sol } = await admin
    .from("solicitudes_cotizacion")
    .select("id, estado, organizacion_id, ticket_id, proveedor_id, tickets(estado)")
    .eq("token", token)
    .maybeSingle();
  if (!sol) return { ok: false, error: "Este link ya no es válido." };

  const estadoTicket = (sol.tickets as unknown as { estado: string } | null)?.estado;
  if (estadoTicket === "resuelto" || estadoTicket === "cancelado" || estadoTicket === "en_proceso") {
    return { ok: false, error: "Este trabajo ya fue asignado o cerrado." };
  }
  if (sol.estado === "cotizada" || sol.estado === "visita_agendada") {
    return { ok: false, error: "Ya respondiste esta solicitud." };
  }

  if (r.modo === "descartar") {
    await admin.from("solicitudes_cotizacion").update({ estado: "descartada" }).eq("id", sol.id);
    revalidatePath(`/c/${token}`);
    return { ok: true };
  }

  const notas = String(r.notas ?? "").trim().slice(0, 500) || null;
  let fila: Record<string, unknown>;

  if (r.modo === "remota") {
    const monto = Number(String(r.monto).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(monto) || monto <= 0 || monto > 10_000_000) return { ok: false, error: "Escribe el precio total." };
    const garantia = Number(String(r.garantiaDias).replace(/\D/g, ""));
    const fechas = (r.fechas ?? []).filter((f) => FECHA.test(f)).slice(0, 3);
    if (!fechas.length) return { ok: false, error: "Propón al menos una fecha." };
    fila = {
      modo: "remota",
      monto,
      incluye_materiales: Boolean(r.incluyeMateriales),
      garantia_dias: Number.isFinite(garantia) && garantia > 0 ? Math.min(garantia, 3650) : null,
      fechas_disponibles: fechas,
    };
  } else {
    if (!FECHA_HORA.test(r.visita)) return { ok: false, error: "Elige día y hora de la visita." };
    const visita = new Date(`${r.visita}:00-06:00`); // hora del centro de México
    if (Number.isNaN(visita.getTime()) || visita.getTime() < Date.now()) return { ok: false, error: "La visita debe ser en el futuro." };
    fila = { modo: "visita", visita_at: visita.toISOString() };
  }

  const { error } = await admin.from("cotizaciones").insert({
    ...fila,
    organizacion_id: sol.organizacion_id,
    ticket_id: sol.ticket_id,
    proveedor_id: sol.proveedor_id,
    solicitud_id: sol.id,
    notas,
  });
  if (error) return { ok: false, error: "No pudimos guardar tu respuesta. Intenta de nuevo." };

  await admin
    .from("solicitudes_cotizacion")
    .update({ estado: r.modo === "remota" ? "cotizada" : "visita_agendada" })
    .eq("id", sol.id);
  if (estadoTicket === "reportado") {
    await admin.from("tickets").update({ estado: "cotizando" }).eq("id", sol.ticket_id);
  }

  revalidatePath(`/c/${token}`);
  return { ok: true };
}
