import { dinero, mesTexto } from "@/lib/condominios-datos";

export type Resumen = {
  mes: string;
  cargado_centavos: number;
  cobrado_centavos: number;
  gastos_centavos: number;
  adeudo_total_centavos: number;
  cobranza_pct: number | null;
  viviendas: number;
  viviendas_con_adeudo: number;
  accesos_mes: number;
  reportes_abiertos: number;
  reportes_cerrados_mes: number;
  gastos: {
    fecha: string;
    categoria: string;
    descripcion: string;
    monto_centavos: number;
  }[];
  adeudos: { vivienda: string; saldo_centavos: number }[];
  reportes: {
    folio: number;
    estado: string;
    titulo: string;
    categoria: string | null;
    responsable: string | null;
    fecha_compromiso: string | null;
  }[];
};

const ESTADO: Record<string, string> = {
  reportado: "Recibido",
  cotizando: "Cotizando",
  aprobacion: "Por aprobar",
  en_proceso: "En proceso",
};

function Dato({
  titulo,
  valor,
  nota,
}: {
  titulo: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-sm font-semibold text-gris">{titulo}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">
        {valor}
      </p>
      {nota && <p className="text-xs text-gris">{nota}</p>}
    </div>
  );
}

// Reporte de gestión: lo usan la administración y el comité (por su link).
export function ReporteCondominio({
  r,
  compacto = false,
}: {
  r: Resumen;
  compacto?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato
          titulo="Cobranza del mes"
          valor={r.cobranza_pct === null ? "—" : `${r.cobranza_pct}%`}
          nota={`${dinero(r.cobrado_centavos)} de ${dinero(r.cargado_centavos)}`}
        />
        <Dato titulo="Gastos del mes" valor={dinero(r.gastos_centavos)} />
        <Dato
          titulo="Adeudo total"
          valor={dinero(r.adeudo_total_centavos)}
          nota={`${r.viviendas_con_adeudo} de ${r.viviendas} viviendas`}
        />
        <Dato
          titulo="Reportes abiertos"
          valor={String(r.reportes_abiertos)}
          nota={`${r.reportes_cerrados_mes} resuelto(s) en ${mesTexto(r.mes).toLowerCase()} · ${r.accesos_mes} accesos`}
        />
      </div>
      {!compacto && (
        <>
          <section className="rounded-2xl bg-white p-5">
            <h2 className="font-display text-xl font-bold">
              Gastos de {mesTexto(r.mes).toLowerCase()}
            </h2>
            {r.gastos.length ? (
              <table className="mt-3 w-full text-sm">
                <tbody className="divide-y divide-borde-suave">
                  {r.gastos.map((g, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 text-gris">
                        {g.fecha.slice(8, 10)}/{g.fecha.slice(5, 7)}
                      </td>
                      <td className="py-2 pr-3">
                        <b>{g.categoria}</b> · {g.descripcion}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {dinero(g.monto_centavos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-sm text-gris">Sin gastos registrados.</p>
            )}
          </section>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl bg-white p-5">
              <h2 className="font-display text-xl font-bold">
                Saldos pendientes
              </h2>
              {r.adeudos.length ? (
                <ul className="mt-3 divide-y divide-borde-suave text-sm">
                  {r.adeudos.map((a) => (
                    <li key={a.vivienda} className="flex justify-between py-2">
                      <span>{a.vivienda}</span>
                      <span className="font-semibold tabular-nums">
                        {dinero(a.saldo_centavos)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gris">
                  Todas las viviendas al corriente.
                </p>
              )}
            </section>
            <section className="rounded-2xl bg-white p-5">
              <h2 className="font-display text-xl font-bold">
                Reportes abiertos
              </h2>
              {r.reportes.length ? (
                <ul className="mt-3 divide-y divide-borde-suave text-sm">
                  {r.reportes.map((t) => (
                    <li key={t.folio} className="py-2">
                      <span className="font-semibold">
                        #{t.folio} {t.titulo}
                      </span>
                      <span className="block text-gris">
                        {ESTADO[t.estado] ?? t.estado}
                        {t.responsable ? ` · ${t.responsable}` : ""}
                        {t.fecha_compromiso
                          ? ` · revisión ${t.fecha_compromiso.slice(8, 10)}/${t.fecha_compromiso.slice(5, 7)}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gris">
                  No hay reportes abiertos.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
