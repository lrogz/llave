// Solicitud de renta: lo que llena el interesado para la investigación y la póliza.

export const CAMPOS_SOLICITUD = [
  { clave: "ocupacion", texto: "Ocupación", tipo: "select", opciones: ["Empleado", "Independiente / profesionista", "Empresario", "Estudiante", "Jubilado / pensionado", "Otro"] },
  { clave: "empresa", texto: "Empresa o lugar de trabajo" },
  { clave: "puesto", texto: "Puesto" },
  { clave: "antiguedad", texto: "Antigüedad en el trabajo", placeholder: "2 años" },
  { clave: "ingreso", texto: "Ingreso mensual comprobable", placeholder: "$45,000", modo: "decimal" },
  { clave: "personas", texto: "¿Cuántas personas vivirán?", placeholder: "3", modo: "numeric" },
  { clave: "mascotas", texto: "Mascotas", placeholder: "No / 1 perro mediano" },
  { clave: "mudanza", texto: "Fecha en que te quieres mudar", tipo: "date" },
  { clave: "ref1_nombre", texto: "Referencia personal 1 · nombre" },
  { clave: "ref1_tel", texto: "Referencia 1 · teléfono", modo: "tel" },
  { clave: "ref2_nombre", texto: "Referencia personal 2 · nombre" },
  { clave: "ref2_tel", texto: "Referencia 2 · teléfono", modo: "tel" },
  { clave: "aval_nombre", texto: "Aval / fiador (si tienes)" },
  { clave: "aval_tel", texto: "Aval · teléfono", modo: "tel" },
  { clave: "comentarios", texto: "¿Algo más que debamos saber?", tipo: "textarea" },
] as const;

export type DatosSolicitud = Partial<Record<(typeof CAMPOS_SOLICITUD)[number]["clave"], string>>;

export const TIPOS_ARCHIVO = [
  ["identificacion", "Identificación oficial (INE o pasaporte)"],
  ["ingresos", "Comprobantes de ingresos (3 últimos recibos o estados de cuenta)"],
  ["domicilio", "Comprobante de domicilio actual"],
  ["otro", "Otro documento"],
] as const;

export const ESTADOS_SOLICITUD = [
  ["pendiente", "Esperando que la llene"],
  ["recibida", "Recibida"],
  ["en_revision", "En investigación"],
  ["aprobada", "Aprobada"],
  ["rechazada", "No aprobada"],
] as const;

export const COLOR_SOLICITUD: Record<string, string> = {
  pendiente: "bg-fondo text-gris",
  recibida: "bg-[#E8EEFB] text-[#2A4A93]",
  en_revision: "bg-[#FFF4E0] text-[#7A4E00]",
  aprobada: "bg-verde-claro text-verde-oscuro",
  rechazada: "bg-naranja-claro text-naranja-oscuro",
};

export const MORADA_UNO_URL = "https://moradauno.com.mx";
