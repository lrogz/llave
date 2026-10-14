import { pesos } from "./datos";

export type DatosAnuncio = {
  nombre: string;
  tipo: string;
  colonia: string | null;
  ciudad: string | null;
  renta_mensual: number | null;
  recamaras: number | null;
  banos: number | null;
  m2: number | null;
  estacionamientos: number | null;
  amueblada: boolean;
  mascotas: boolean;
  descripcion_anuncio: string | null;
  requisitos: string | null;
};

const TIPO: Record<string, string> = { casa: "Casa", departamento: "Departamento", local: "Local", oficina: "Oficina", unidad_condominio: "Casa en condominio", otro: "Inmueble" };
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const lugar = (p: Pick<DatosAnuncio, "colonia" | "ciudad">) => [p.colonia, p.ciudad].filter(Boolean).join(", ");

// "Casa en renta en Jurica, Querétaro"
export const tituloAnuncio = (p: DatosAnuncio) => `${TIPO[p.tipo] ?? "Inmueble"} en renta${lugar(p) ? ` en ${lugar(p)}` : ""}`;

export function caracteristicas(p: DatosAnuncio) {
  return [
    p.recamaras != null ? plural(p.recamaras, "recámara", "recámaras") : null,
    p.banos != null ? plural(Number(p.banos), "baño", "baños") : null,
    p.m2 != null ? `${Number(p.m2)} m²` : null,
    p.estacionamientos != null ? plural(p.estacionamientos, "estacionamiento", "estacionamientos") : null,
    p.amueblada ? "Amueblada" : null,
    p.mascotas ? "Acepta mascotas" : null,
  ].filter((x): x is string => !!x);
}

// Borrador de descripción a partir de los datos, para no empezar en blanco.
export function descripcionSugerida(p: DatosAnuncio) {
  const c = caracteristicas(p).filter((x) => x !== "Amueblada" && x !== "Acepta mascotas");
  return [
    `${tituloAnuncio(p)}${c.length ? ` con ${c.join(", ")}` : ""}.`,
    p.amueblada ? "Se entrega amueblada." : null,
    p.mascotas ? "Se aceptan mascotas." : null,
    p.renta_mensual ? `Renta mensual: ${pesos.format(Number(p.renta_mensual))}.` : null,
    "Agenda tu visita.",
  ]
    .filter(Boolean)
    .join(" ");
}

// Texto para copiar y pegar en Inmuebles24, EasyBroker, Marketplace, etc.
export function textoPortales(p: DatosAnuncio, link: string) {
  return [
    tituloAnuncio(p),
    p.renta_mensual ? `${pesos.format(Number(p.renta_mensual))} al mes` : null,
    caracteristicas(p).join(" · ") || null,
    "",
    p.descripcion_anuncio || descripcionSugerida(p),
    p.requisitos ? `\nRequisitos: ${p.requisitos}` : null,
    "",
    `Fotos e informes: ${link}`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}
