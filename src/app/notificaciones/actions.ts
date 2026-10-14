"use server";

import { sesionConOrg } from "@/lib/sesion";
import { enviarAUsuario, pushConfigurado } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

// Guarda la suscripción de este dispositivo. Con el cliente admin para que un mismo
// navegador pueda pasar de una cuenta a otra (el endpoint es único).
export async function suscribir(sub: Sub, dispositivo: string) {
  const { user, org } = await sesionConOrg();
  const endpoint = String(sub?.endpoint ?? "");
  const p256dh = String(sub?.keys?.p256dh ?? "");
  const auth = String(sub?.keys?.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return { ok: false };
  const { error } = await createAdminClient()
    .from("suscripciones_push")
    .upsert({ endpoint, p256dh, auth, user_id: user.id, organizacion_id: org.id, dispositivo: dispositivo.slice(0, 80) || null }, { onConflict: "endpoint" });
  return { ok: !error };
}

export async function desuscribir(endpoint: string) {
  const { supabase } = await sesionConOrg();
  await supabase.from("suscripciones_push").delete().eq("endpoint", String(endpoint).slice(0, 1000));
  return { ok: true };
}

export async function probarNotificacion() {
  const { user } = await sesionConOrg();
  if (!pushConfigurado()) return { ok: false, enviados: 0 };
  const enviados = await enviarAUsuario(user.id, { titulo: "¡Listo! 🔑", cuerpo: "Así te avisaremos de reportes nuevos, pagos y cotizaciones.", url: "/hoy", tag: "prueba" });
  return { ok: enviados > 0, enviados };
}
