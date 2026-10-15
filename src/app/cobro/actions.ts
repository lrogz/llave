"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cobroConfigurado } from "@/lib/cobro";
import { sesionConOrg } from "@/lib/sesion";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { origen } from "@/lib/util";

async function soloAdmin() {
  const s = await sesionConOrg();
  const { data: yo } = await s.supabase.from("miembros").select("rol").eq("organizacion_id", s.org.id).eq("user_id", s.user.id).maybeSingle();
  if (yo?.rol !== "propietario" && yo?.rol !== "admin") throw new Error("Solo la dueña o una administradora de la cuenta puede conectar Stripe.");
  return s;
}

// Crea (una vez) la cuenta de Stripe de la administradora y la manda a completar sus datos con Stripe.
export async function conectarStripe() {
  if (!cobroConfigurado()) throw new Error("Falta configurar Stripe en el servidor.");
  const { org, user } = await soloAdmin();
  const admin = createAdminClient();
  const { data: o } = await admin.from("organizaciones").select("stripe_cuenta_id").eq("id", org.id).single();
  let cuenta = o?.stripe_cuenta_id as string | null;
  if (!cuenta) {
    const c = await stripe<{ id: string }>(
      "POST",
      "/accounts",
      {
        country: "MX",
        email: user.email ?? undefined,
        business_profile: { name: org.nombre, product_description: "Administración y renta de inmuebles" },
        controller: { fees: { payer: "account" }, losses: { payments: "stripe" }, stripe_dashboard: { type: "full" }, requirement_collection: "stripe" },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { org_id: org.id },
      },
      { clave: `cuenta-${org.id}` },
    );
    cuenta = c.id;
    await admin.from("organizaciones").update({ stripe_cuenta_id: cuenta, stripe_cuenta_lista: false }).eq("id", org.id);
  }
  const base = await origen();
  const link = await stripe<{ url: string }>("POST", "/account_links", { account: cuenta, type: "account_onboarding", refresh_url: `${base}/ajustes?stripe=reintentar#cobro`, return_url: `${base}/ajustes?stripe=volvio#cobro` });
  redirect(link.url);
}

// Al volver de Stripe (o con el botón): ¿ya puede cobrar?
export async function revisarCuenta() {
  const { org } = await sesionConOrg();
  const admin = createAdminClient();
  const { data: o } = await admin.from("organizaciones").select("stripe_cuenta_id").eq("id", org.id).single();
  if (!o?.stripe_cuenta_id) return;
  const c = await stripe<{ charges_enabled: boolean }>("GET", `/accounts/${o.stripe_cuenta_id}`);
  await admin.from("organizaciones").update({ stripe_cuenta_lista: !!c.charges_enabled }).eq("id", org.id);
  revalidatePath("/ajustes");
}
