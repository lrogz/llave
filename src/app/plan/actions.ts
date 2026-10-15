"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { estadoPlan, planPorClave, precioStripe } from "@/lib/plan";
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

// Contratar un plan (Checkout) o, si ya paga, cambiar de plan (sube o baja; Stripe prorratea).
export async function elegirPlan(f: FormData) {
  const { supabase, org, user } = await soyAdmin();
  if (!stripeConfigurado()) throw new Error("Los pagos aún no están conectados.");
  const plan = planPorClave(String(f.get("plan") ?? ""));
  const precio = plan ? precioStripe(plan.clave) : null;
  if (!plan || !precio) redirect("/plan");
  const e = await estadoPlan(supabase, org.id);
  if (e.propiedades > plan.hasta) redirect(`/plan?no_cabe=${plan.clave}`);
  const admin = createAdminClient();
  const { data: o } = await admin.from("organizaciones").select("stripe_customer_id, stripe_subscription_id").eq("id", org.id).single();

  if (e.pagando && o?.stripe_subscription_id) {
    const sub = await stripe<{ items: { data: { id: string }[] } }>("GET", `/subscriptions/${o.stripe_subscription_id}`);
    const item = sub.items.data[0]?.id;
    if (!item) redirect("/plan");
    await stripe("POST", `/subscriptions/${o.stripe_subscription_id}`, { items: { 0: { id: item, price: precio, quantity: 1 } }, proration_behavior: "create_prorations", metadata: { org_id: org.id } });
    await admin.from("organizaciones").update({ plan_nivel: plan.clave }).eq("id", org.id);
    revalidatePath("/plan");
    redirect(`/plan?cambiado=${plan.clave}`);
  }

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
    line_items: { 0: { price: precio, quantity: 1 } },
    subscription_data: { metadata: { org_id: org.id } },
    metadata: { plan_precio: precio },
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
