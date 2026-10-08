// Constantes y utilidades que sirven en servidor y navegador.

export const BUCKET = "llave";

export const CATEGORIAS = [
  ["plomeria", "Plomería"],
  ["humedad", "Humedad"],
  ["electricidad", "Electricidad"],
  ["gas", "Gas"],
  ["cerrajeria", "Cerrajería"],
  ["electrodomesticos", "Electrodomésticos"],
  ["otro", "Otro"],
] as const;

export const DISPONIBILIDAD = [
  ["mananas", "Mañanas"],
  ["tardes", "Tardes"],
  ["sabado", "Sábado"],
  ["cualquiera", "Cuando sea"],
] as const;

export const ESTADOS_TICKET = [
  ["reportado", "Reportado"],
  ["cotizando", "Cotizando"],
  ["aprobacion", "Aprobación"],
  ["en_proceso", "En proceso"],
  ["resuelto", "Resuelto"],
] as const;

export const COLOR_ESTADO: Record<string, string> = {
  reportado: "bg-naranja-claro text-naranja-oscuro",
  cotizando: "bg-[#E8EEFB] text-[#2A4A93]",
  aprobacion: "bg-[#FFF4E0] text-[#7A4E00]",
  en_proceso: "bg-verde-claro text-verde-oscuro",
  resuelto: "bg-fondo text-gris",
  cancelado: "bg-fondo text-gris",
};

export type EstadoTicket = (typeof ESTADOS_TICKET)[number][0] | "cancelado";

export const QUIEN_PAGA = [
  ["dueno", "Dueño"],
  ["inquilino", "Inquilino"],
  ["condominio", "Condominio"],
  ["administradora", "Administradora"],
] as const;

export function etiqueta(lista: readonly (readonly [string, string])[], valor: string | null | undefined) {
  return lista.find(([v]) => v === valor)?.[1] ?? valor ?? "";
}

export const pesos = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const fechaCorta = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "America/Mexico_City",
});
const fechaHora = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

export function formatoFecha(valor: string | null | undefined) {
  if (!valor) return "";
  // Las fechas sin hora (YYYY-MM-DD) se leen como mediodía para no cambiar de día por zona horaria.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T12:00:00-06:00`) : new Date(valor);
  return fechaCorta.format(d);
}

export function formatoFechaHora(valor: string | null | undefined) {
  return valor ? fechaHora.format(new Date(valor)) : "";
}

// Teléfono mexicano a formato internacional para wa.me (sin + ni espacios).
export function telefonoWhatsApp(telefono: string | null | undefined) {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (digitos.length === 10) return `52${digitos}`;
  if (digitos.length === 12 && digitos.startsWith("52")) return digitos;
  if (digitos.length === 13 && digitos.startsWith("521")) return `52${digitos.slice(3)}`;
  return digitos;
}

export function linkWhatsApp(telefono: string | null | undefined, mensaje: string) {
  const numero = telefonoWhatsApp(telefono);
  const texto = encodeURIComponent(mensaje);
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`;
}

export function extension(nombre: string, tipoMime: string) {
  const deNombre = nombre.includes(".") ? nombre.split(".").pop()!.toLowerCase() : "";
  if (/^[a-z0-9]{2,5}$/.test(deNombre)) return deNombre;
  const mapa: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
  };
  return mapa[tipoMime] ?? "bin";
}

export function tipoMedia(tipoMime: string): "foto" | "video" | "audio" | "pdf" | null {
  if (tipoMime.startsWith("image/")) return "foto";
  if (tipoMime.startsWith("video/")) return "video";
  if (tipoMime.startsWith("audio/")) return "audio";
  if (tipoMime === "application/pdf") return "pdf";
  return null;
}

export const TIPOS_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/ogg",
  "audio/mp4",
  "application/pdf",
];

export const MAX_ARCHIVO_REPORTE = 100 * 1024 * 1024; // 100 MB, igual que el bucket
export const MAX_ARCHIVOS_REPORTE = 6;
