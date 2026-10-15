// Constantes y utilidades que sirven en servidor y navegador.

export const BUCKET = "llave";

export const CATEGORIAS = [
  ["plomeria", "Plomería"],
  ["humedad", "Humedad"],
  ["electricidad", "Electricidad"],
  ["gas", "Gas"],
  ["cerrajeria", "Cerrajería"],
  ["electrodomesticos", "Electrodomésticos"],
  ["carpinteria", "Carpintería"],
  ["albanileria", "Albañilería"],
  ["pintura", "Pintura"],
  ["impermeabilizacion", "Impermeabilización"],
  ["herreria", "Herrería"],
  ["vidrios", "Vidrios y aluminio"],
  ["cortinas", "Cortinas y persianas"],
  ["minisplit", "Minisplit / aire"],
  ["fumigacion", "Fumigación"],
  ["limpieza", "Limpieza"],
  ["jardineria", "Jardinería"],
  ["mudanzas", "Mudanzas"],
  ["internet", "Internet y TV"],
  ["otro", "Otro"],
] as const;

// Las que ve el inquilino al reportar (las demás son para proveedores y servicios).
const EN_REPORTE = new Set(["plomeria", "humedad", "electricidad", "gas", "cerrajeria", "electrodomesticos", "minisplit", "carpinteria", "otro"]);
export const CATEGORIAS_REPORTE = CATEGORIAS.filter(([v]) => EN_REPORTE.has(v));

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
  ["otro", "Otro"],
  ["compartido", "Compartido (por %)"],
] as const;

// Quién paga en un reparto por porcentajes.
export const PARTES_PAGO = [
  ["dueno", "Dueño"],
  ["inquilino", "Inquilino"],
  ["condominio", "Condominio"],
  ["administradora", "Administradora"],
  ["otro", "Otro"],
] as const;
export type Reparto = Partial<Record<(typeof PARTES_PAGO)[number][0], number>> & { otro_nombre?: string };

// "Dueño", "Otro: Junta de vecinos" o "50% dueño · 50% inquilino".
export function textoPaga(quien: string | null | undefined, reparto?: Reparto | null) {
  if (!quien) return "";
  const otro = reparto?.otro_nombre?.trim();
  if (quien === "otro") return otro ? `Otro: ${otro}` : "Otro";
  if (quien !== "compartido") return etiqueta(QUIEN_PAGA, quien);
  const partes = PARTES_PAGO.filter(([v]) => Number(reparto?.[v] ?? 0) > 0).map(([v, t]) => `${Number(reparto![v])}% ${v === "otro" && otro ? otro : t.toLowerCase()}`);
  return partes.length ? partes.join(" · ") : "Compartido";
}

// Fracción (0 a 1) que le toca a una parte, p. ej. al dueño para su reporte y liquidación.
export function parteDe(quien: string | null | undefined, reparto: Reparto | null | undefined, parte: (typeof PARTES_PAGO)[number][0]) {
  if (quien === "compartido") return Math.max(0, Math.min(100, Number(reparto?.[parte] ?? 0))) / 100;
  return quien === parte ? 1 : 0;
}

// Lee "quien_paga" y, si es compartido, los porcentajes (deben sumar 100). Devuelve null si no es válido.
export function leerPaga(f: FormData, porDefecto: string | null = null): { quien_paga: string | null; reparto: Reparto | null; error?: string } {
  const quien = String(f.get("quien_paga") ?? "").trim();
  if (!QUIEN_PAGA.some(([v]) => v === quien)) return { quien_paga: porDefecto, reparto: null };
  const otro = String(f.get("pago_otro") ?? "").trim().slice(0, 80);
  if (quien === "otro") return { quien_paga: "otro", reparto: otro ? { otro_nombre: otro } : null };
  if (quien !== "compartido") return { quien_paga: quien, reparto: null };
  const reparto: Reparto = {};
  let suma = 0;
  for (const [v] of PARTES_PAGO) {
    const n = Math.round(Number(String(f.get(`pct_${v}`) ?? "").replace(/[^0-9.]/g, "")) * 100) / 100;
    if (n > 0 && n <= 100) {
      reparto[v] = n;
      suma += n;
    }
  }
  if (otro && reparto.otro) reparto.otro_nombre = otro;
  if (Math.abs(suma - 100) > 0.01) return { quien_paga: null, reparto: null, error: `Los porcentajes deben sumar 100% (suman ${suma}%).` };
  return { quien_paga: "compartido", reparto };
}

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

export const TIPOS_SERVICIO = [
  ["luz", "Luz"],
  ["agua", "Agua"],
  ["gas", "Gas"],
  ["internet", "Internet"],
  ["predial", "Predial"],
  ["cuota_condominio", "Cuota de condominio"],
  ["otro", "Otro"],
] as const;

export const TIPOS_DOCUMENTO = [
  ["contrato", "Contrato"],
  ["identificacion", "Identificación"],
  ["comprobante_domicilio", "Comprobante de domicilio"],
  ["escrituras", "Escrituras"],
  ["poliza", "Póliza / seguro"],
  ["predial", "Predial"],
  ["otro", "Otro"],
] as const;

export const MAX_ENVIO = 4 * 1024 * 1024; // límite por envío en Vercel; las fotos se reducen antes
