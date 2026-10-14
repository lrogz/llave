// Conciliación: leer el estado de cuenta del banco (Excel/CSV) y quedarnos con los depósitos.
// Funciona en el navegador y en el servidor (sin dependencias).

export type Deposito = { fila: number; fecha: string | null; texto: string; monto: number };
type Celda = string | number | boolean | Date | null | undefined;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const COLUMNAS = {
  fecha: ["fecha", "fecha operacion", "fecha de operacion", "fecha movimiento", "dia", "date"],
  texto: ["descripcion", "concepto", "referencia", "detalle", "movimiento", "concepto / referencia", "descripcion del movimiento", "leyenda"],
  abono: ["abono", "abonos", "deposito", "depositos", "ingreso", "ingresos", "credito", "creditos", "haber", "entradas"],
  cargo: ["cargo", "cargos", "retiro", "retiros", "debito", "debitos", "salidas"],
  importe: ["importe", "monto", "cantidad", "amount"],
};

function columnas(enc: string[]) {
  const e = enc.map((x) => norm(String(x ?? "")));
  const buscar = (lista: string[]) => e.findIndex((x) => lista.some((l) => x === l || x.startsWith(`${l} `) || x.includes(l)));
  const textos = e.map((x, i) => (COLUMNAS.texto.some((l) => x.includes(l)) ? i : -1)).filter((i) => i >= 0);
  return { fecha: buscar(COLUMNAS.fecha), textos, abono: buscar(COLUMNAS.abono), cargo: buscar(COLUMNAS.cargo), importe: buscar(COLUMNAS.importe) };
}

export function aNumero(v: Celda): number | null {
  if (typeof v === "number") return v;
  if (v == null || v === "") return null;
  const s = String(v).replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const MESES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12, jan: 1, apr: 4, aug: 8, dec: 12 };
export function aFecha(v: Celda): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = norm(s).match(/^(\d{1,2})[/ .-]([a-z]{3})[a-z]*[/ .-](\d{2,4})/);
  if (m && MESES[m[2]]) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${String(MESES[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// Busca la fila de encabezados (entre las primeras 15) y devuelve solo los abonos.
export function leerDepositos(filas: Celda[][]): { depositos: Deposito[]; error?: string } {
  let inicio = -1;
  let col: ReturnType<typeof columnas> | null = null;
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const c = columnas((filas[i] ?? []).map((x) => String(x ?? "")));
    if (c.textos.length && (c.abono >= 0 || c.importe >= 0)) {
      inicio = i;
      col = c;
      break;
    }
  }
  if (!col) return { depositos: [], error: "No encontramos las columnas de descripción y abono/importe. Revisa que el archivo sea el estado de cuenta con encabezados." };
  const depositos: Deposito[] = [];
  for (let i = inicio + 1; i < filas.length && depositos.length < 2000; i++) {
    const f = filas[i] ?? [];
    let monto: number | null = null;
    if (col.abono >= 0) monto = aNumero(f[col.abono]);
    else if (col.importe >= 0) monto = aNumero(f[col.importe]);
    if (col.abono >= 0 && (monto == null || monto <= 0) && col.cargo >= 0) continue;
    if (monto == null || monto <= 0) continue;
    const texto = col.textos.map((j) => String(f[j] ?? "")).join(" ").replace(/\s+/g, " ").trim();
    depositos.push({ fila: i + 1, fecha: col.fecha >= 0 ? aFecha(f[col.fecha]) : null, texto: texto.slice(0, 300), monto: Math.round(monto * 100) / 100 });
  }
  return { depositos };
}
