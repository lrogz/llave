// Entrega (entrada) y recepción (salida) de la casa: inventario por cuarto.

export type Partida = { id: string; cuarto: string; estado: string; nota: string };
export type Lecturas = { luz?: string; agua?: string; gas?: string; llaves?: string };

export const TIPOS_INSPECCION = [
  ["entrada", "Entrega al inquilino"],
  ["salida", "Recepción (salida)"],
  ["rutina", "Revisión de rutina"],
] as const;

export const ESTADOS_PARTIDA = [
  ["bien", "Bien"],
  ["detalle", "Con detalles"],
  ["danado", "Dañado"],
  ["na", "No aplica"],
] as const;

export const COLOR_PARTIDA: Record<string, string> = {
  bien: "bg-verde-claro text-verde-oscuro",
  detalle: "bg-[#FFF4E0] text-[#7A4E00]",
  danado: "bg-naranja-claro text-naranja-oscuro",
  na: "bg-fondo text-gris",
};

export const idCuarto = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "cuarto";

export function cuartosIniciales(recamaras: number | null, banos: number | null): Partida[] {
  const r = Math.min(Math.max(recamaras ?? 2, 1), 8);
  const b = Math.min(Math.max(Math.ceil(Number(banos ?? 1)), 1), 6);
  const nombres = [
    "Entrada y fachada",
    "Sala",
    "Comedor",
    "Cocina",
    ...Array.from({ length: r }, (_, i) => (r === 1 ? "Recámara" : `Recámara ${i + 1}`)),
    ...Array.from({ length: b }, (_, i) => (b === 1 ? "Baño" : `Baño ${i + 1}`)),
    "Patio de servicio",
    "Jardín / exterior",
    "Cochera",
    "Instalaciones (luz, agua, gas)",
  ];
  return nombres.map((cuarto) => ({ id: idCuarto(cuarto), cuarto, estado: "", nota: "" }));
}

export const etiquetaTipo = (t: string) => TIPOS_INSPECCION.find(([v]) => v === t)?.[1] ?? t;
