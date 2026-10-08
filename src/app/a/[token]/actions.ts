"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function decidir(token: string, decision: "aprobada" | "rechazada", comentario: string) {
  if (decision !== "aprobada" && decision !== "rechazada") return { ok: false, error: "Decisión no válida." };
  const admin = createAdminClient();
  const { data: ap } = await admin
    .from("aprobaciones")
    .select("id, decision, cotizacion_id, cotizaciones(ticket_id, estado)")
    .eq("token", token)
    .maybeSingle();
  if (!ap) return { ok: false, error: "Este link ya no es válido." };
  if (ap.decision) return { ok: false, error: "Ya respondiste esta aprobación." };

  const cot = ap.cotizaciones as unknown as { ticket_id: string; estado: string } | null;
  if (!cot || cot.estado !== "enviada_aprobacion") {
    return { ok: false, error: "La administradora cambió la propuesta. Espera el link nuevo." };
  }

  await admin
    .from("aprobaciones")
    .update({ decision, comentario: String(comentario ?? "").trim().slice(0, 500) || null, decidida_at: new Date().toISOString() })
    .eq("id", ap.id);

  if (decision === "aprobada") {
    await admin.from("cotizaciones").update({ estado: "aprobada" }).eq("id", ap.cotizacion_id);
    await admin.from("tickets").update({ estado: "en_proceso" }).eq("id", cot.ticket_id);
  } else {
    await admin.from("cotizaciones").update({ estado: "rechazada" }).eq("id", ap.cotizacion_id);
    await admin.from("tickets").update({ estado: "cotizando" }).eq("id", cot.ticket_id);
  }

  revalidatePath(`/a/${token}`);
  return { ok: true };
}
