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
