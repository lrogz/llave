"use server";

import { redirect } from "next/navigation";
import { estadoPlan } from "@/lib/plan";
import { sesionConOrg } from "@/lib/sesion";
import { stripe, stripeConfigurado } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { origen } from "@/lib/util";

async function soyAdmin() {
  const s = await sesionConOrg();
  const { data } = await s.supabase.from("miembros").select("rol").eq("organizacion_id", s.org.id).eq("user_id", s.user.id).maybeSingle();
  if (data?.rol !== "propietario" && data?.rol !== "admin") throw new Error("Solo la dueña de la cuenta o una administradora puede cambiar el plan.");
  return s;
}

// Abre el pago de Stripe por el número de propiedades actual.
export async function activarPlan() {
  const { supabase, org, user } = await soyAdmin();
  if (!stripeConfigurado()) throw new Error("Los pagos aún no están conectados.");
  const admin = createAdminClient();
  const e = await estadoPlan(supabase, org.id);
  const { data: o } = await admin.from("organizaciones").select("stripe_customer_id").eq("id", org.id).single();
  let cliente = o?.stripe_customer_id as string | null;
  if (!cliente) {
    const c = await stripe<{ id: string }>("POST", "/customers", { email: user.email, name: org.nombre, metadata: { org_id: org.id } });
    cliente = c.id;
    await admin.from("organizaciones").update({ stripe_customer_id: cliente }).eq("id", org.id);
  }
  const base = await origen();
  const sesion = await stripe<{ url: string }>("POST", "/checkout/sessions", {
    mode: "subscription",
    customer: cliente,
    client_reference_id: org.id,
    locale: "es",
    line_items: { 0: { price: process.env.STRIPE_PRICE_ID, quantity: Math.max(1, e.propiedades) } },
    subscription_data: { metadata: { org_id: org.id } },
    allow_promotion_codes: "true",
    success_url: `${base}/plan?listo=1`,
    cancel_url: `${base}/plan`,
  });
  redirect(sesion.url);
}

// Portal de Stripe: cambiar tarjeta, ver facturas o cancelar.
export async function administrarPlan() {
  const { org } = await soyAdmin();
  const { data: o } = await createAdminClient().from("organizaciones").select("stripe_customer_id").eq("id", org.id).single();
  if (!o?.stripe_customer_id) redirect("/plan");
  const p = await stripe<{ url: string }>("POST", "/billing_portal/sessions", { customer: o.stripe_customer_id, return_url: `${await origen()}/plan` });
  redirect(p.url);
}
