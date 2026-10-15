import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Ajuste = { ajuste_tipo: "inpc" | "fijo" | "ninguno"; ajuste_pct: number; ajuste_tope: number | null };
export type Calculo = {
  metodo: "inpc" | "fijo" | "ninguno";
  pct: number;
  rentaNueva: number;
  inflacion: number | null;
  inpcInicial: number | null;
  inpcFinal: number | null;
  periodoInicial: string | null;
  periodoFinal: string | null;
  fuente: string | null;
  topado: boolean;
  falta: string | null;
};

const mesAntes = (periodo: string, meses: number) => {
  const [a, m] = periodo.split("-").map(Number);
  const t = a * 12 + (m - 1) - meses;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
};

// Aumento al renovar. INPC: variación de los últimos 12 meses publicados antes de que entre la renta nueva
// (p. ej. renueva en noviembre → INPC de octubre contra octubre del año pasado; si octubre no sale aún, septiembre).
// Nunca baja la renta. Se redondea al peso.
export async function calcularAumento(db: SupabaseClient, renta: number, ajuste: Ajuste, desde: string): Promise<Calculo> {
  const base = { inflacion: null, inpcInicial: null, inpcFinal: null, periodoInicial: null, periodoFinal: null, fuente: null, topado: false, falta: null };
  const redondea = (pct: number) => Math.round(renta * (1 + pct / 100));
  if (ajuste.ajuste_tipo === "ninguno") return { ...base, metodo: "ninguno", pct: 0, rentaNueva: renta };
  if (ajuste.ajuste_tipo === "fijo") {
    const pct = Number(ajuste.ajuste_pct) || 0;
    return { ...base, metodo: "fijo", pct, rentaNueva: redondea(pct) };
  }
  const mesDesde = `${desde.slice(0, 7)}-01`;
  const { data: ult } = await db.from("inpc").select("periodo, valor, fuente").lt("periodo", mesDesde).order("periodo", { ascending: false }).limit(1).maybeSingle();
  if (!ult) return { ...base, metodo: "inpc", pct: 0, rentaNueva: renta, falta: "No hay INPC publicado para esa fecha." };
  const inicialPer = mesAntes(ult.periodo, 12);
  const { data: ini } = await db.from("inpc").select("valor").eq("periodo", inicialPer).maybeSingle();
  if (!ini) return { ...base, metodo: "inpc", pct: 0, rentaNueva: renta, falta: `Falta el INPC de ${inicialPer.slice(0, 7)}.` };
  const inflacion = Math.round((Number(ult.valor) / Number(ini.valor) - 1) * 100_000) / 1000;
  let pct = Math.max(0, inflacion + (Number(ajuste.ajuste_pct) || 0));
  let topado = false;
  if (ajuste.ajuste_tope != null && pct > Number(ajuste.ajuste_tope)) {
    pct = Number(ajuste.ajuste_tope);
    topado = true;
  }
  pct = Math.round(pct * 1000) / 1000;
  return {
    metodo: "inpc",
    pct,
    rentaNueva: redondea(pct),
    inflacion,
    inpcInicial: Number(ini.valor),
    inpcFinal: Number(ult.valor),
    periodoInicial: inicialPer,
    periodoFinal: ult.periodo,
    fuente: ult.fuente,
    topado,
    falta: null,
  };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const mesINPC = (periodo: string) => `${MESES[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(0, 4)}`;
export const pctTexto = (n: number) => `${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
