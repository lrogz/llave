import { NextResponse, type NextRequest } from "next/server";
import { connection } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { marcarPagado } from "@/lib/cobro";
import { firmaValida, sincronizarCantidad, stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe avisa aquí cuando alguien paga, cambia o cancela su suscripción.
type Evento = {
  type: string;
  account?: string;
  data: {
    object: {
      id: string;
      mode?: string;
      setup_intent?: string | null;
      charges_enabled?: boolean;
      payment_method_types?: string[];
      last_payment_error?: { message?: string } | null;
      client_reference_id?: string | null;
      customer?: string | null;
      subscription?: string | null;
      status?: string;
      metadata?: Record<string, string>;
      items?: { data: { quantity?: number }[] };
    };
  };
};

export async function POST(request: NextRequest) {
  await connection();
  // Dos endpoints en Stripe pueden apuntar aquí: el de la suscripción y el de cuentas conectadas (rentas).
  const secretos = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((x): x is string => !!x);
  const cuerpo = await request.text();
  const firma = request.headers.get("stripe-signature");
  if (!secretos.some((sec) => firmaValida(cuerpo, firma, sec))) {
    return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  }
  const ev = JSON.parse(cuerpo) as Evento;
  const o = ev.data.object;
  const admin = createAdminClient();

  // ── Rentas en la cuenta conectada de la administradora
  if (ev.account) {
    await eventoDeRenta(admin, ev);
    return NextResponse.json({ recibido: true });
  }

  if (ev.type === "checkout.session.completed" && o.client_reference_id && o.subscription) {
    await admin
      .from("organizaciones")
      .update({ plan: "pro", suscripcion_estado: "active", stripe_customer_id: o.customer ?? null, stripe_subscription_id: o.subscription })
      .eq("id", o.client_reference_id);
    await sincronizarCantidad(admin, o.client_reference_id).catch(() => {});
  }

  if (ev.type.startsWith("customer.subscription.")) {
    const orgId = o.metadata?.org_id;
    const filtro = orgId ? { col: "id", val: orgId } : { col: "stripe_subscription_id", val: o.id };
    const terminada = ev.type === "customer.subscription.deleted" || ["canceled", "unpaid", "incomplete_expired"].includes(o.status ?? "");
    await admin
      .from("organizaciones")
      .update({
        plan: terminada ? "inicio" : "pro",
        suscripcion_estado: terminada ? "canceled" : (o.status ?? null),
        stripe_subscription_id: o.id,
        propiedades_cobradas: o.items?.data[0]?.quantity ?? null,
      })
      .eq(filtro.col, filtro.val);
  }

  return NextResponse.json({ recibido: true });
}

async function eventoDeRenta(admin: SupabaseClient, ev: Evento) {
  const o = ev.data.object;
  const cuenta = ev.account!;
  if (ev.type === "account.updated") {
    await admin.from("organizaciones").update({ stripe_cuenta_lista: !!o.charges_enabled }).eq("stripe_cuenta_id", cuenta);
    return;
  }
  // Pago de renta (Checkout con tarjeta/SPEI/OXXO o cobro automático): se concilia solo.
  if (ev.type === "payment_intent.succeeded" && o.metadata?.cobro_id) {
    await marcarPagado(admin, o.metadata.cobro_id, cuenta, { id: o.id, tipo: o.payment_method_types?.[0] });
    return;
  }
  if (ev.type === "payment_intent.payment_failed" && o.metadata?.cobro_id) {
    await admin.from("cobros_renta").update({ error_cobro: (o.last_payment_error?.message ?? "Pago rechazado").slice(0, 300) }).eq("id", o.metadata.cobro_id).neq("estado", "pagado");
    return;
  }
  // El inquilino guardó su tarjeta para el pago automático.
  if (ev.type === "checkout.session.completed" && o.mode === "setup" && o.setup_intent && o.metadata?.contrato_id) {
    const { data: k } = await admin.from("contratos").select("id, organizaciones(stripe_cuenta_id)").eq("id", o.metadata.contrato_id).maybeSingle();
    if ((k?.organizaciones as unknown as { stripe_cuenta_id: string | null } | null)?.stripe_cuenta_id !== cuenta) return;
    const si = await stripe<{ payment_method: string | null }>("GET", `/setup_intents/${o.setup_intent}`, undefined, { cuenta });
    if (!si.payment_method) return;
    const pm = await stripe<{ card?: { brand?: string; last4?: string } }>("GET", `/payment_methods/${si.payment_method}`, undefined, { cuenta });
    const marca = (pm.card?.brand ?? "tarjeta").replace(/^\w/, (x) => x.toUpperCase());
    await admin
      .from("contratos")
      .update({ stripe_metodo_id: si.payment_method, domiciliado: true, tarjeta_texto: `${marca} •••• ${pm.card?.last4 ?? ""}`.trim() })
      .eq("id", o.metadata.contrato_id);
    // Con tarjeta nueva se vuelve a intentar lo pendiente.
    await admin.from("cobros_renta").update({ intentos_cobro: 0, error_cobro: null }).eq("contrato_id", o.metadata.contrato_id).in("estado", ["pendiente", "vencido"]);
  }
}
