// Utilidades del CRM de seguimiento (sirven en servidor y navegador).

const fechaISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" });

// Fecha de hoy en México como YYYY-MM-DD.
export function hoyMX(desplazarDias = 0) {
  const d = new Date(Date.now() + desplazarDias * 86_400_000);
  return fechaISO.format(d);
}

// Momento de hace N horas, en ISO (para filtros de "sin movimiento").
export function haceHoras(horas: number) {
  return new Date(Date.now() - horas * 3_600_000).toISOString();
}

// Días entre dos fechas YYYY-MM-DD (b - a).
export function diasEntre(a: string, b: string) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

// Una fecha sin hora (YYYY-MM-DD) como mediodía en México, para la línea de tiempo.
export const mediodia = (fecha: string) => `${fecha}T12:00:00-06:00`;

export const DE_QUIEN = [
  ["administradora", "Yo"],
  ["dueno", "Dueño"],
  ["inquilino", "Inquilino"],
] as const;

export const DE_QUIEN_OPCION = {
  administradora: "Lo resuelvo yo",
  dueno: "Depende del dueño",
  inquilino: "Depende del inquilino",
} as const;

const conAnio = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City" });
// "18 nov 2025": para contratos, donde el año importa.
export const fechaConAnio = (fecha: string) => conAnio.format(new Date(mediodia(fecha))).replace(/\./g, "");

export const CANALES = [
  ["whatsapp", "WhatsApp"],
  ["correo", "Correo"],
  ["llamada", "Llamada"],
] as const;

export const FRECUENCIAS = [
  ["mensual", "Cada mes"],
  ["quincenal", "Cada quincena"],
  ["solo_cambios", "Solo cuando haya algo"],
] as const;

export function cuandoVence(vence: string | null, hoy = hoyMX()) {
  if (!vence) return { texto: "Sin fecha", clase: "text-gris" };
  const d = diasEntre(hoy, vence);
  if (d < 0) return { texto: `Venció hace ${-d} ${-d === 1 ? "día" : "días"}`, clase: "text-naranja-oscuro font-bold" };
  if (d === 0) return { texto: "Hoy", clase: "text-naranja-oscuro font-bold" };
  if (d === 1) return { texto: "Mañana", clase: "text-tinta font-semibold" };
  return { texto: `En ${d} días`, clase: "text-gris" };
}

export const primerNombre = (n: string) => n.trim().split(/\s+/)[0] ?? n;

// Plantillas de WhatsApp: el texto sale listo, la administradora solo da enviar.
export const plantillas = {
  renovacion: (inquilino: string, propiedad: string, fin: string) =>
    `Hola ${primerNombre(inquilino)}, ¿cómo estás? Tu contrato de ${propiedad} termina el ${fin}. ¿Te gustaría renovar? Con gusto te comparto las condiciones.`,
  cobranza: (inquilino: string, propiedad: string, monto: string, link?: string) =>
    link
      ? `Hola ${primerNombre(inquilino)}, te recuerdo que está pendiente la renta de ${propiedad} por ${monto}. Aquí ves los datos para depositar y puedes subir tu comprobante: ${link} ¡Gracias!`
      : `Hola ${primerNombre(inquilino)}, te recuerdo que está pendiente la renta de ${propiedad} por ${monto}. Si ya la pagaste, ¿me compartes el comprobante? ¡Gracias!`,
  avisoRenta: (inquilino: string, propiedad: string, monto: string, vence: string, link: string) =>
    `Hola ${primerNombre(inquilino)}, la renta de ${propiedad} por ${monto} vence el ${vence}. Datos para depositar y para subir tu comprobante: ${link}`,
  aprobacionPendiente: (dueno: string, ticket: string, link: string) =>
    `Hola ${primerNombre(dueno)}, sigue pendiente tu aprobación para "${ticket}". Aquí puedes ver la cotización y aprobar con un clic: ${link}`,
  reporte: (dueno: string, mes: string, link: string) =>
    `Hola ${primerNombre(dueno)}, aquí está el reporte de ${mes} de tus propiedades: rentas, trabajos con fotos y tu saldo. ${link}`,
  saludoDueno: (dueno: string) => `Hola ${primerNombre(dueno)}, te escribo de la administración sobre tus propiedades.`,
  saludoInquilino: (inquilino: string) => `Hola ${primerNombre(inquilino)}, te escribo de la administración.`,
};

// Tiempo legible: "40 min", "5 h", "2 días".
export function duracion(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = ms / 60_000;
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} h`;
  const d = h / 24;
  return `${d < 10 ? Math.round(d * 10) / 10 : Math.round(d)} ${Math.round(d * 10) / 10 === 1 ? "día" : "días"}`;
}

// Diferencia en ms entre dos fechas ISO (b - a); null si falta alguna.
export const entre = (a?: string | null, b?: string | null) => (a && b ? Date.parse(b) - Date.parse(a) : null);

// Promedio de duraciones válidas; null si no hay datos.
export function promedio(valores: (number | null | undefined)[]) {
  const v = valores.filter((x): x is number => typeof x === "number" && x >= 0);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}
