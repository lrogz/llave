// Constantes y formatos del módulo de condominios (sirven en servidor y navegador).

export const CONCEPTOS = [
  ["mantenimiento", "Mantenimiento"],
  ["agua", "Agua"],
  ["extraordinaria", "Cuota extraordinaria"],
  ["multa", "Multa"],
  ["otro", "Otro"],
] as const;

export const TIPOS_VISITA = [
  ["visita", "Visita"],
  ["proveedor", "Proveedor / técnico"],
  ["servicio", "Personal de servicio"],
  ["taxi", "Taxi o app"],
  ["paqueteria", "Paquetería"],
] as const;

export const DIAS = [
  [1, "L"],
  [2, "M"],
  [3, "Mi"],
  [4, "J"],
  [5, "V"],
  [6, "S"],
  [7, "D"],
] as const;

export const CATEGORIAS_VECINO = [
  ["electricidad", "Luz / alumbrado"],
  ["plomeria", "Agua / fuga"],
  ["jardineria", "Áreas verdes"],
  ["limpieza", "Limpieza / basura"],
  ["seguridad", "Seguridad / acceso"],
  ["convivencia", "Ruido o convivencia"],
  ["albanileria", "Daño en áreas comunes"],
  ["otro", "Otro"],
] as const;

export const CATEGORIAS_GASTO = ["Vigilancia", "Limpieza", "Jardinería", "Energía", "Agua", "Mantenimiento", "Elevadores", "Administración", "Obra", "Otro"];

// Qué le decimos al guardia según el resultado del escaneo.
export const RESULTADO_ESCANEO: Record<string, { titulo: string; detalle: string }> = {
  autorizado: { titulo: "Acceso autorizado", detalle: "Entrada registrada." },
  no_existe: { titulo: "Pase no válido", detalle: "Este código no es de este condominio." },
  cancelado: { titulo: "Pase cancelado", detalle: "El residente canceló este pase." },
  vencido: { titulo: "Pase vencido", detalle: "La vigencia ya terminó." },
  aun_no_vigente: { titulo: "Todavía no es vigente", detalle: "El pase empieza más tarde." },
  fuera_de_horario: { titulo: "Fuera de horario", detalle: "Hoy o a esta hora no tiene acceso." },
  ya_usado: { titulo: "Pase ya utilizado", detalle: "Era de un solo uso y ya se registró su entrada." },
  sin_turno: { titulo: "Sin turno abierto", detalle: "Vuelve a entrar con tu PIN." },
};

export const ESTADO_REPORTE: Record<string, { texto: string; clase: string; abierto: boolean }> = {
  reportado: { texto: "Recibido", clase: "bg-[#F4E3C1] text-[#6B4A0B]", abierto: true },
  cotizando: { texto: "En proceso", clase: "bg-[#F6D9A0] text-[#6B4A0B]", abierto: true },
  aprobacion: { texto: "En proceso", clase: "bg-[#F6D9A0] text-[#6B4A0B]", abierto: true },
  en_proceso: { texto: "En proceso", clase: "bg-[#F6D9A0] text-[#6B4A0B]", abierto: true },
  resuelto: { texto: "Resuelto", clase: "bg-[#D5E6CF] text-[#1E4D2B]", abierto: false },
  cancelado: { texto: "Cancelado", clase: "bg-[#E7E3DA] text-[#5A5547]", abierto: false },
};

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
export const dinero = (centavos: number | string | null | undefined) => mxn.format(Number(centavos ?? 0) / 100);
export const dineroMXN = (centavos: number | string | null | undefined) => `${dinero(centavos)} MXN`;

// "1,450.50" → 145050. Devuelve null si no es un monto válido.
export function aCentavos(texto: string | null | undefined): number | null {
  const limpio = String(texto ?? "").replace(/[^0-9.]/g, "");
  if (!limpio || (limpio.match(/\./g) ?? []).length > 1) return null;
  const n = Math.round(Number(limpio) * 100);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const mesFmt = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
export const mesTexto = (yyyyMm: string) => {
  const t = mesFmt.format(new Date(`${yyyyMm.slice(0, 7)}-15T12:00:00Z`)).replace(" de ", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const horaFmt = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" });
const diaFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" });
const claveDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" });
export const hora = (iso: string) => horaFmt.format(new Date(iso));
export function cuando(iso: string) {
  const d = new Date(iso);
  const hoy = claveDia.format(new Date());
  const manana = claveDia.format(new Date(Date.now() + 86400_000));
  const k = claveDia.format(d);
  const dia = k === hoy ? "Hoy" : k === manana ? "Mañana" : diaFmt.format(d);
  return `${dia} · ${horaFmt.format(d)}`;
}
export function vigencia(desde: string, hasta: string) {
  const a = new Date(desde);
  const b = new Date(hasta);
  const mismoDia = claveDia.format(a) === claveDia.format(b);
  return mismoDia ? `${cuando(desde)} a ${horaFmt.format(b)}` : `${cuando(desde)} → ${cuando(hasta)}`;
}
export const etiquetaDe = (lista: readonly (readonly [string | number, string])[], v: string | number | null | undefined) =>
  lista.find(([k]) => k === v)?.[1] ?? String(v ?? "");

// Fecha de hoy (YYYY-MM-DD) en la Ciudad de México.
export const hoyCDMX = () => claveDia.format(new Date());

// Estado visible de un pase.
export function estadoPase(p: { estado: string; hasta: string; max_usos: number | null; usos: number }) {
  if (p.estado === "cancelado") return { texto: "Cancelado", clase: "bg-[#E7E3DA] text-[#5A5547]", vigente: false };
  if (new Date(p.hasta) < new Date()) return { texto: "Vencido", clase: "bg-[#E7E3DA] text-[#5A5547]", vigente: false };
  if (p.max_usos !== null && p.usos >= p.max_usos) return { texto: "Usado", clase: "bg-[#E7E3DA] text-[#5A5547]", vigente: false };
  return { texto: "Activo", clase: "bg-[#D5E6CF] text-[#1E4D2B]", vigente: true };
}


export const TIPOS_TABLERO = [
  ["recomendacion", "Recomendación"],
  ["pregunta", "Pregunta"],
  ["venta", "Venta"],
  ["perdido", "Mascota u objeto perdido"],
] as const;

export const CATEGORIAS_DOCUMENTO = [
  ["reglamento", "Reglamento"],
  ["acta", "Acta"],
  ["poliza", "Póliza / seguro"],
  ["contrato", "Contrato"],
  ["estado_financiero", "Estado financiero"],
  ["otro", "Otro"],
] as const;

Object.assign(RESULTADO_ESCANEO, {
  vetado: { titulo: "No puede entrar", detalle: "Está en la lista de vetados. Ya se avisó a la administración." },
  punto_marcado: { titulo: "Punto de rondín marcado", detalle: "" },
  punto_invalido: { titulo: "Punto no válido", detalle: "Este QR no es un punto de rondín de este condominio." },
  pin_valido: { titulo: "PIN correcto", detalle: "Paquete registrado y residente avisado." },
  pin_invalido: { titulo: "PIN no válido", detalle: "El código no existe, ya se usó o venció." },
  bloqueado: { titulo: "Demasiados intentos", detalle: "Espera unos minutos y vuelve a intentar." },
});

// Lee el nombre de la zona legible por máquina (MRZ) del reverso de la INE: "APELLIDO<APELLIDO<<NOMBRE<NOMBRE".
export function nombreDeMRZ(texto: string) {
  const lineas = texto.toUpperCase().replace(/[«‹]/g, "<").split(/\r?\n/).map((l) => l.replace(/\s/g, ""));
  const linea = lineas.find((l) => /^[A-ZÑ]+<[A-ZÑ<]*<<[A-ZÑ<]+$/.test(l) && l.length >= 10) ?? lineas.find((l) => /<<[A-ZÑ]/.test(l) && !/\d/.test(l));
  if (!linea) return null;
  const [apellidos, nombres] = linea.split("<<");
  const limpia = (s: string) => s.split("<").filter(Boolean).map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join(" ");
  const nombre = `${limpia(nombres ?? "")} ${limpia(apellidos ?? "")}`.trim();
  return nombre.length >= 4 ? nombre : null;
}

// Periodo de indicadores: por omisión los últimos 7 días (hora de la Ciudad de México). Días inclusivos.
export function rangoIndicadores(desde?: string | null, hasta?: string | null) {
  const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d);
  const hoy = dia(new Date());
  const h = hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? hasta : hoy;
  const d = desde && /^\d{4}-\d{2}-\d{2}$/.test(desde) && desde <= h ? desde : dia(new Date(new Date(`${h}T12:00:00-06:00`).getTime() - 6 * 86400_000));
  const fin = new Date(new Date(`${h}T00:00:00-06:00`).getTime() + 86400_000);
  return { desde: `${d}T00:00:00-06:00`, hasta: fin.toISOString(), dia_desde: d, dia_hasta: h };
}
