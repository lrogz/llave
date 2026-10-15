import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// INPC mensual del INEGI (API de Indicadores). Token gratis en inegi.org.mx › Servicios › API.
// INEGI_TOKEN obligatorio para actualizar; INEGI_INPC_ID (por omisión 628194, "Índice general",
// base 2Q jul 2018 = 100, fuente BIE). Sin token se usan los valores guardados en la tabla `inpc`.
export const inegiConfigurado = () => !!process.env.INEGI_TOKEN;

const URL_BASE = () => process.env.INEGI_URL || "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml";

type Respuesta = { Series?: { OBSERVATIONS?: { TIME_PERIOD: string; OBS_VALUE: string | null }[] }[] };

export async function actualizarINPC(db: SupabaseClient) {
  if (!inegiConfigurado()) return { ok: false, nuevos: 0 };
  const id = process.env.INEGI_INPC_ID || "628194";
  const fuente = process.env.INEGI_FUENTE || "BIE";
  const geo = fuente === "BIE" ? "0700" : "00";
  try {
    const r = await fetch(`${URL_BASE()}/INDICATOR/${id}/es/${geo}/false/${fuente}/2.0/${process.env.INEGI_TOKEN}?type=json`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return { ok: false, nuevos: 0 };
    const j = (await r.json()) as Respuesta;
    const filas = (j.Series?.[0]?.OBSERVATIONS ?? [])
      .map((o) => {
        const m = /^(\d{4})\/(\d{2})$/.exec(o.TIME_PERIOD ?? "");
        const v = Number(o.OBS_VALUE);
        return m && v > 0 ? { periodo: `${m[1]}-${m[2]}-01`, valor: Math.round(v * 1000) / 1000, fuente: "inegi", updated_at: new Date().toISOString() } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .filter((x) => x.periodo >= "2018-08-01");
    if (!filas.length) return { ok: false, nuevos: 0 };
    const { error } = await db.from("inpc").upsert(filas, { onConflict: "periodo" });
    return { ok: !error, nuevos: filas.length };
  } catch {
    return { ok: false, nuevos: 0 };
  }
}
