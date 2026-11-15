// CSV con BOM para que Excel en español respete acentos. Montos en pesos con dos decimales.
type Mov = { fecha: string; vivienda: string; tipo: string; concepto: string; referencia: string | null; cargo_centavos: number; abono_centavos: number };

const celda = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
// Evita que una celda que empieza con = + - @ se ejecute como fórmula al abrirla en Excel.
const segura = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function csvMovimientos(filas: Mov[]) {
  const enc = ["Fecha", "Vivienda", "Tipo", "Concepto", "Referencia", "Cargo", "Abono"];
  const cuerpo = filas.map((m) =>
    [m.fecha, m.vivienda, m.tipo, m.concepto, m.referencia ?? "", (Number(m.cargo_centavos) / 100).toFixed(2), (Number(m.abono_centavos) / 100).toFixed(2)].map((x) => celda(segura(String(x)))).join(","),
  );
  return "﻿" + [enc.join(","), ...cuerpo].join("\r\n");
}

// Indicadores del piloto: periodo actual contra el anterior.
export type Indicadores = Record<string, number | string | null | Record<string, number>>;
export const INDICADORES: [string, string][] = [
  ["accesos", "Accesos registrados"],
  ["aclaraciones", "Aclaraciones (llamadas para aclarar una visita)"],
  ["aclaraciones_por_100", "Aclaraciones por cada 100 accesos"],
  ["mediana_validacion_seg", "Mediana llegada → validación (segundos)"],
  ["paquetes", "Paquetes recibidos"],
  ["mediana_registro_paquete_seg", "Mediana para registrar un paquete (segundos)"],
  ["paquetes_pendientes_cambio_turno", "Paquetes pendientes en cambios de turno"],
  ["cambios_turno", "Cambios de turno"],
  ["cambios_turno_confirmados", "Turnos recibidos con confirmación"],
  ["reportes", "Reportes de residentes"],
  ["reportes_agrupados", "Reportes agrupados en un incidente"],
  ["incidentes", "Incidentes generales"],
  ["mediana_primer_aviso_min", "Mediana al primer aviso de un incidente (min)"],
  ["mediana_primer_aviso_reporte_min", "Mediana al primer aviso de un reporte (min)"],
];

export function csvIndicadores(actual: Indicadores, anterior: Indicadores) {
  const filas = INDICADORES.map(([k, t]) => [t, String(actual[k] ?? ""), String(anterior[k] ?? "")].map((x) => celda(segura(x))).join(","));
  return "﻿" + [["Indicador", `${String(actual.desde).slice(0, 10)} a ${String(actual.hasta).slice(0, 10)}`, "Periodo anterior"].join(","), ...filas].join("\r\n");
}
