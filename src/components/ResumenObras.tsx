import { dinero } from "@/lib/condominios-datos";

type Obra = {
  id: string; nombre: string; descripcion: string | null; estado: string; aprobado_centavos: number; proveedor: string | null; asamblea: string | null;
  cuota_cargada_centavos: number; recaudado_centavos: number; pagado_proveedor_centavos: number; avance_pct: number;
  etapas: { id: string; nombre: string; monto_centavos: number; avance_pct: number; pagada: boolean }[];
};

const ESTADO: Record<string, string> = { aprobada: "Aprobada", en_curso: "En curso", terminada: "Terminada" };

function Barra({ pct, etiqueta }: { pct: number; etiqueta: string }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{etiqueta}</span>
        <span className="tabular-nums">{v}%</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[#E7E3DA]" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={etiqueta}>
        <div className="h-full rounded-full bg-[#17583A]" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

// Obra con cuota: cuánto se aprobó, cuánto se ha recaudado, cuánto se ha pagado y cómo va. Lo mismo para residentes, comité y administración.
export function ResumenObras({ obras }: { obras: Obra[] }) {
  if (!obras.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {obras.map((o) => {
        const aprobado = Number(o.aprobado_centavos);
        return (
          <article key={o.id} className="flex flex-col gap-3 rounded-2xl border border-[#E1DCD0] bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold">{o.nombre}</h3>
                {o.descripcion && <p className="text-base text-[#5A5547]">{o.descripcion}</p>}
                {(o.asamblea || o.proveedor) && <p className="text-sm text-[#5A5547]">{[o.asamblea && `Aprobada en: ${o.asamblea}`, o.proveedor && `Proveedor: ${o.proveedor}`].filter(Boolean).join(" · ")}</p>}
              </div>
              <span className="rounded-full bg-[#DCE8D5] px-3 py-1 text-sm font-semibold text-[#1E4D2B]">{ESTADO[o.estado] ?? o.estado}</span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Aprobado", aprobado],
                ["Recaudado", Number(o.recaudado_centavos)],
                ["Pagado", Number(o.pagado_proveedor_centavos)],
              ].map(([t, v]) => (
                <div key={t as string} className="rounded-xl bg-[#F7F4EE] px-2 py-2">
                  <dt className="text-xs text-[#5A5547]">{t}</dt>
                  <dd className="text-base font-bold tabular-nums">{dinero(v as number)}</dd>
                </div>
              ))}
            </dl>
            <Barra pct={aprobado ? (100 * Number(o.recaudado_centavos)) / aprobado : 0} etiqueta="Recaudado de lo aprobado" />
            <Barra pct={o.avance_pct} etiqueta="Avance de la obra" />
            {o.etapas.length > 0 && (
              <ol className="divide-y divide-[#E1DCD0] border-t border-[#E1DCD0] text-base">
                {o.etapas.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <span>{e.nombre}</span>
                    <span className="text-sm text-[#5A5547] tabular-nums">
                      {dinero(e.monto_centavos)} · {e.avance_pct}%{e.pagada ? " · pagada" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </article>
        );
      })}
    </div>
  );
}
