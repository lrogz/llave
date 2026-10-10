import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cobro de la suscripción con Stripe (API REST, sin SDK). Variables de servidor:
//   STRIPE_SECRET_KEY      sk_live_… / sk_test_…
//   STRIPE_PRICE_ID        price_… de $110 MXN mensual "por unidad" (cantidad = propiedades)
//   STRIPE_WEBHOOK_SECRET  whsec_… del endpoint /api/stripe/webhook
export const stripeConfigurado = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);

const base = () => (process.env.STRIPE_URL ?? "https://api.stripe.com") + "/v1";

// Stripe recibe formularios con llaves anidadas: items[0][price]=…
function formulario(datos: Record<string, unknown>, prefijo = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(datos)) {
    if (v === undefined || v === null) continue;
    const llave = prefijo ? `${prefijo}[${k}]` : k;
    if (typeof v === "object") formulario(v as Record<string, unknown>, llave, out);
    else out.append(llave, String(v));
  }
  return out;
}

export async function stripe<T = Record<string, unknown>>(metodo: "GET" | "POST", ruta: string, datos?: Record<string, unknown>): Promise<T> {
  const r = await fetch(base() + ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: metodo === "POST" && datos ? formulario(datos) : undefined,
  });
  const j = (await r.json()) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`Stripe: ${j.error?.message ?? r.status}`);
  return j;
}

// Verifica la firma "Stripe-Signature: t=…,v1=…" (HMAC-SHA256 de "t.cuerpo"), con 5 min de tolerancia.
export function firmaValida(cuerpo: string, cabecera: string | null, secreto: string) {
  if (!cabecera) return false;
  const partes = Object.fromEntries(cabecera.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(partes.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const esperada = crypto.createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex");
  const firmas = cabecera
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  return firmas.some((f) => f.length === esperada.length && crypto.timingSafeEqual(Buffer.from(f), Buffer.from(esperada)));
}

// Ajusta la cantidad cobrada al número de propiedades (sin prorratear: aplica desde el siguiente mes).
export async function sincronizarCantidad(admin: SupabaseClient, orgId: string) {
  if (!stripeConfigurado()) return;
  const { data: o } = await admin.from("organizaciones").select("plan, stripe_subscription_id, propiedades_cobradas").eq("id", orgId).single();
  if (o?.plan !== "pro" || !o.stripe_subscription_id) return;
  const { count } = await admin.from("propiedades").select("id", { count: "exact", head: true }).eq("organizacion_id", orgId);
  const n = Math.max(1, count ?? 0);
  if (n === o.propiedades_cobradas) return;
  const sub = await stripe<{ items: { data: { id: string }[] } }>("GET", `/subscriptions/${o.stripe_subscription_id}`);
  const item = sub.items.data[0]?.id;
  if (!item) return;
  await stripe("POST", `/subscriptions/${o.stripe_subscription_id}`, { items: { 0: { id: item, quantity: n } }, proration_behavior: "none" });
  await admin.from("organizaciones").update({ propiedades_cobradas: n }).eq("id", orgId);
}
