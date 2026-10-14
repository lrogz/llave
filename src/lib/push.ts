import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "./supabase/admin";

// Notificaciones push (app instalada en el celular o la compu). Llaves VAPID:
// NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT (mailto:tu@correo).
export const pushConfigurado = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export type AvisoPush = { titulo: string; cuerpo: string; url: string; tag?: string };

let listo = false;
function configurar() {
  if (listo) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:avisos@blackkey.mx", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  listo = true;
}

type Sus = { id: string; endpoint: string; p256dh: string; auth: string };

async function enviar(subs: Sus[], aviso: AvisoPush) {
  if (!subs.length) return 0;
  configurar();
  const db = createAdminClient();
  const carga = JSON.stringify({ titulo: aviso.titulo.slice(0, 80), cuerpo: aviso.cuerpo.slice(0, 180), url: aviso.url, tag: aviso.tag });
  const muertas: string[] = [];
  const vivas: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        // web-push cifra y firma; el envío lo hacemos con fetch (funciona igual en Vercel y en pruebas).
        const r = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 86_400, urgency: "high" });
        const res = await fetch(r.endpoint, { method: r.method, headers: r.headers as Record<string, string>, body: r.body ? new Uint8Array(r.body) : undefined, signal: AbortSignal.timeout(8000) });
        if (res.ok) vivas.push(s.id);
        else if (res.status === 404 || res.status === 410) muertas.push(s.id); // el navegador ya la dio de baja
      } catch {
        // red caída: se reintenta en el siguiente aviso
      }
    }),
  );
  if (muertas.length) await db.from("suscripciones_push").delete().in("id", muertas);
  if (vivas.length) await db.from("suscripciones_push").update({ ultimo_envio: new Date().toISOString() }).in("id", vivas);
  return vivas.length;
}

// Avisa a todo el equipo de la administradora. Corre después de responder (no hace esperar a quien reporta).
export function avisarEquipo(organizacionId: string, aviso: AvisoPush) {
  if (!pushConfigurado()) return;
  after(async () => {
    try {
      const { data } = await createAdminClient().from("suscripciones_push").select("id, endpoint, p256dh, auth").eq("organizacion_id", organizacionId);
      await enviar((data ?? []) as Sus[], aviso);
    } catch {
      // las notificaciones nunca deben romper la acción principal
    }
  });
}

// Al proveedor (su portal instalado). Espera el envío: se usa desde acciones y el cron.
export async function enviarAProveedor(proveedorId: string, aviso: AvisoPush) {
  if (!pushConfigurado()) return 0;
  try {
    const { data } = await createAdminClient().from("suscripciones_push").select("id, endpoint, p256dh, auth").eq("proveedor_id", proveedorId);
    return await enviar((data ?? []) as Sus[], aviso);
  } catch {
    return 0;
  }
}

// Igual, pero después de responder.
export function avisarProveedorPush(proveedorId: string, aviso: AvisoPush) {
  if (!pushConfigurado()) return;
  after(() => enviarAProveedor(proveedorId, aviso));
}

export async function enviarAUsuario(userId: string, aviso: AvisoPush) {
  if (!pushConfigurado()) return 0;
  const { data } = await createAdminClient().from("suscripciones_push").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  return enviar((data ?? []) as Sus[], aviso);
}
