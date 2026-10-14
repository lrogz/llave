import "server-only";

// Administradoras de la plataforma Black Key (revisan las solicitudes a la red). Correos separados por coma.
export const esPlataforma = (email: string | null | undefined) =>
  !!email &&
  (process.env.PLATAFORMA_ADMINS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());

export const ZONAS_SUGERIDAS = ["Querétaro centro", "Jurica", "Juriquilla", "Zibatá", "El Refugio", "Milenio III", "Corregidora", "El Marqués", "Pedro Escobedo", "San Juan del Río"];

export const TIPOS_DOC_PROVEEDOR = [
  ["ine", "Identificación oficial (INE)"],
  ["domicilio", "Comprobante de domicilio"],
  ["constancia", "Constancia de situación fiscal (si factura)"],
] as const;
