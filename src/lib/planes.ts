// Planes de Black Key: un monto mensual que incluye hasta X propiedades. Para cambiar precios o límites, edita aquí
// (y crea el precio correspondiente en Stripe: STRIPE_PRICE_INICIAL, STRIPE_PRICE_PROFESIONAL, STRIPE_PRICE_AGENCIA).
export const GRATIS_HASTA = 2;

export type ClavePlan = "inicial" | "profesional" | "agencia";
export type Plan = { clave: ClavePlan; nombre: string; hasta: number; precio: number; para: string };

export const PLANES: Plan[] = [
  { clave: "inicial", nombre: "Inicial", hasta: 10, precio: 890, para: "Para empezar a ordenar tu cartera" },
  { clave: "profesional", nombre: "Profesional", hasta: 30, precio: 1890, para: "Para administradoras en crecimiento" },
  { clave: "agencia", nombre: "Agencia", hasta: 80, precio: 3890, para: "Para equipos con varias personas" },
];
// Más de la última: plan a la medida.
export const MAS_DE = PLANES[PLANES.length - 1].hasta;

export const planPorClave = (c: string | null | undefined) => PLANES.find((p) => p.clave === c) ?? null;
// El plan más barato donde caben `n` propiedades (null si ninguno).
export const planPara = (n: number) => PLANES.find((p) => n <= p.hasta) ?? null;
