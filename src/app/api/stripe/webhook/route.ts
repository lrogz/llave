import { NextResponse, type NextRequest } from "next/server";
import { connection } from "next/server";
import { firmaValida, sincronizarCantidad } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe avisa aquí cuando alguien paga, cambia o cancela su suscripción.
type Evento = {
  type: string;
  data: {
    object: {
      id: string;
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
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  const cuerpo = await request.text();
  if (!secreto || !firmaValida(cuerpo, request.headers.get("stripe-signature"), secreto)) {
    return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  }
  const ev = JSON.parse(cuerpo) as Evento;
  const o = ev.data.object;
  const admin = createAdminClient();

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
