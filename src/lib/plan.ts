import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRATIS_HASTA, planPorClave, type Plan } from "./planes";

export { GRATIS_HASTA, PLANES, planPara, planPorClave, MAS_DE } from "./planes";

export type EstadoPlan = {
  propiedades: number;
  pagando: boolean;
  plan: Plan | null; // plan de pago actual (null = gratis)
  costoMensual: number;
  limite: number; // propiedades que caben en el plan actual
  suscripcion: string | null;
  tieneCliente: boolean;
};

// Precio de Stripe de cada plan.
export const precioStripe = (clave: string) =>
  ({ inicial: process.env.STRIPE_PRICE_INICIAL, profesional: process.env.STRIPE_PRICE_PROFESIONAL, agencia: process.env.STRIPE_PRICE_AGENCIA })[clave] ?? null;
export const planDePrecio = (precio: string | null | undefined) => (["inicial", "profesional", "agencia"] as const).find((c) => precio && precioStripe(c) === precio) ?? null;

export async function estadoPlan(db: SupabaseClient, orgId: string): Promise<EstadoPlan> {
  const [{ data: o }, { count }] = await Promise.all([
    db.from("organizaciones").select("plan, plan_nivel, suscripcion_estado, stripe_customer_id").eq("id", orgId).single(),
    db.from("propiedades").select("id", { count: "exact", head: true }).eq("organizacion_id", orgId),
  ]);
  const propiedades = count ?? 0;
  const pagando = o?.plan === "pro" && ["active", "trialing", "past_due"].includes(o?.suscripcion_estado ?? "");
  // Suscripciones de antes de los planes (sin nivel) se tratan como el plan más grande.
  const plan = pagando ? (planPorClave(o?.plan_nivel as string | null) ?? planPorClave("agencia")) : null;
  return {
    propiedades,
    pagando,
    plan,
    costoMensual: plan?.precio ?? 0,
    limite: plan?.hasta ?? GRATIS_HASTA,
    suscripcion: (o?.suscripcion_estado as string | null) ?? null,
    tieneCliente: Boolean(o?.stripe_customer_id),
  };
}

// ¿Puede dar de alta `nuevas` propiedades más?
export function puedeAgregar(e: EstadoPlan, nuevas = 1) {
  return e.propiedades + nuevas <= e.limite;
}
