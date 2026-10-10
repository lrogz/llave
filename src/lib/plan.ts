import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { diasEntre, hoyMX } from "./crm";

// Precio: $110 MXN por propiedad al mes (sin IVA). Gratis hasta 3 propiedades. 30 días de prueba sin límite.
export const PRECIO_PROPIEDAD = 110;
export const GRATIS_HASTA = 3;

export type EstadoPlan = {
  propiedades: number;
  pagando: boolean;
  enPrueba: boolean;
  diasPrueba: number;
  pruebaHasta: string;
  costoMensual: number;
  limite: number | null; // null = sin límite
  suscripcion: string | null;
  tieneCliente: boolean;
};

export async function estadoPlan(db: SupabaseClient, orgId: string): Promise<EstadoPlan> {
  const [{ data: o }, { count }] = await Promise.all([
    db.from("organizaciones").select("plan, prueba_hasta, suscripcion_estado, stripe_customer_id").eq("id", orgId).single(),
    db.from("propiedades").select("id", { count: "exact", head: true }).eq("organizacion_id", orgId),
  ]);
  const propiedades = count ?? 0;
  const pagando = o?.plan === "pro" && ["active", "trialing", "past_due"].includes(o?.suscripcion_estado ?? "");
  const pruebaHasta = (o?.prueba_hasta as string | null) ?? hoyMX();
  const diasPrueba = Math.max(0, diasEntre(hoyMX(), pruebaHasta));
  const enPrueba = !pagando && pruebaHasta >= hoyMX();
  return {
    propiedades,
    pagando,
    enPrueba,
    diasPrueba,
    pruebaHasta,
    costoMensual: propiedades > GRATIS_HASTA ? propiedades * PRECIO_PROPIEDAD : 0,
    limite: pagando || enPrueba ? null : GRATIS_HASTA,
    suscripcion: (o?.suscripcion_estado as string | null) ?? null,
    tieneCliente: Boolean(o?.stripe_customer_id),
  };
}

// ¿Puede dar de alta `nuevas` propiedades más?
export function puedeAgregar(e: EstadoPlan, nuevas = 1) {
  return e.limite === null || e.propiedades + nuevas <= e.limite;
}
