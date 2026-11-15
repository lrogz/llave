import { INDICADORES, type Indicadores } from "@/lib/csv";

// Menor es mejor en estos indicadores (tiempos y fricción).
const MENOR_MEJOR = new Set(["aclaraciones", "aclaraciones_por_100", "mediana_validacion_seg", "mediana_registro_paquete_seg", "paquetes_pendientes_cambio_turno", "mediana_primer_aviso_min", "mediana_primer_aviso_reporte_min"]);

function Cambio({ k, a, b }: { k: string; a: number | null; b: number | null }) {
  if (a == null || b == null || a === b) return <span className="text-xs text-gris">{b == null ? "sin dato previo" : "igual"}</span>;
  const mejor = MENOR_MEJOR.has(k) ? a < b : a > b;
  const pct = b ? Math.round((100 * (a - b)) / Math.abs(b)) : null;
  return (
    <span className={`text-xs font-bold ${mejor ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
      {a > b ? "▲" : "▼"} {pct != null ? `${Math.abs(pct)}%` : ""} vs. {b}
    </span>
  );
}

// Indicadores del piloto: lo que se mide para saber si la app redujo llamadas, esperas y pendientes.
export function IndicadoresPiloto({ actual, anterior }: { actual: Indicadores; anterior: Indicadores }) {
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {INDICADORES.map(([k, t]) => {
        const a = num(actual[k]);
        return (
          <div key={k} className="flex flex-col gap-1 rounded-2xl border border-borde-suave bg-white p-4">
            <dt className="text-sm text-gris">{t}</dt>
            <dd className="font-display text-3xl font-bold tabular-nums">{a ?? "—"}</dd>
            <dd>
              <Cambio k={k} a={a} b={num(anterior[k])} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
