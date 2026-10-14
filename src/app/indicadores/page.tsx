import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Menu } from "@/components/Menu";
import { campo } from "@/components/Seguimiento";
import { pesos } from "@/lib/datos";
import { calcularIndicadores, type FilaPropiedad } from "@/lib/indicadores";
import { mesTexto } from "@/lib/reporte";
import { sesionConOrg } from "@/lib/sesion";

export const metadata: Metadata = { title: "Indicadores · Black Key" };

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const mesCorto = new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" });

export default function Indicadores({ searchParams }: { searchParams: Promise<{ dueno?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<{ dueno?: string }> }) {
  const { supabase, org } = await sesionConOrg();
  const { dueno } = await searchParams;
  const duenoId = dueno && /^[0-9a-f-]{36}$/i.test(dueno) ? dueno : undefined;
  await supabase.rpc("actualizar_cobros", { org: org.id });
  const [ind, { data: ds }] = await Promise.all([calcularIndicadores(supabase, { duenoId }), supabase.from("duenos").select("id, nombre, propiedades(id)").order("nombre")]);
  const duenos = ((ds ?? []) as { id: string; nombre: string; propiedades: { id: string }[] }[]).filter((d) => d.propiedades.length);
  const filas = [...ind.propiedades].sort((a, b) => b.neto - a.neto);
  const vacias = ind.propiedades.filter((p) => !p.rentada).sort((a, b) => (b.diasVaciaHoy ?? 0) - (a.diasVaciaHoy ?? 0));
  const tope = Math.max(1, ...ind.meses.map((m) => Math.max(m.esperado, m.cobrado)));
  const topeNeto = Math.max(1, ...filas.map((f) => Math.abs(f.neto)));

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Indicadores" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris first-letter:uppercase">
              Últimos 12 meses · {mesTexto(ind.desde)} a hoy
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight">Indicadores</h1>
          </div>
          {duenos.length > 0 && (
            <form className="flex gap-2">
              <select name="dueno" defaultValue={duenoId ?? ""} aria-label="Filtrar por dueño" className={campo}>
                <option value="">Toda la cartera</option>
                {duenos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
              <button type="submit" className="min-h-11 rounded-xl border border-borde bg-white px-4 text-sm font-bold">
                Ver
              </button>
            </form>
          )}
        </header>

        {ind.propiedades.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-sm text-gris">Todavía no hay propiedades para medir.</p>
        ) : (
          <>
            <ul aria-label="Resumen" className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
              <Cifra titulo="Ocupación hoy" valor={pct(ind.ocupacionHoy)} nota={`${ind.propiedades.filter((p) => p.rentada).length} de ${ind.propiedades.length} rentadas`} />
              <Cifra titulo="Ocupación en 12 meses" valor={pct(ind.ocupacion12m)} nota="Días rentadas / días totales" />
              <Cifra titulo="Pagan a tiempo" valor={pct(ind.pagoPuntual)} nota={ind.atrasoPromedio != null ? `Los que se atrasan: ${ind.atrasoPromedio} días en promedio` : "Rentas ya vencidas"} />
              <Cifra titulo="Renta atrasada hoy" valor={pesos.format(ind.vencido)} nota={`${ind.inquilinosAtrasados} ${ind.inquilinosAtrasados === 1 ? "inquilino" : "inquilinos"}`} alerta={ind.vencido > 0} />
              <Cifra titulo="Se dejó de ganar por casas vacías" valor={pesos.format(ind.perdidoVacancia)} nota="Días vacías × renta" />
            </ul>

            <section aria-label="Rentas por mes" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold">Rentas cobradas por mes</h2>
                <p className="flex items-center gap-3 text-xs text-gris">
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded-sm bg-verde" aria-hidden="true" /> Cobrado
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded-sm bg-verde-claro ring-1 ring-borde" aria-hidden="true" /> Por cobrar
                  </span>
                </p>
              </div>
              <div className="flex h-44 items-end gap-1 border-b border-borde sm:gap-2" role="img" aria-label="Barras de renta cobrada por mes; el detalle está en la tabla de abajo">
                {ind.meses.map((m) => (
                  <div key={m.periodo} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                    <div className="relative flex w-full max-w-10 items-end justify-center rounded-t-[4px] bg-verde-claro" style={{ height: `${(m.esperado / tope) * 100}%` }}>
                      <div className="w-full rounded-t-[4px] bg-verde" style={{ height: m.esperado ? `${(m.cobrado / m.esperado) * 100}%` : 0 }} />
                    </div>
                    <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max rounded-lg bg-tinta px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
                      <span className="block font-bold first-letter:uppercase">{mesTexto(m.periodo)}</span>
                      Cobrado {pesos.format(m.cobrado)} de {pesos.format(m.esperado)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 sm:gap-2">
                {ind.meses.map((m) => (
                  <span key={m.periodo} className="flex-1 text-center text-[11px] text-gris capitalize">
                    {mesCorto.format(new Date(`${m.periodo}T00:00:00Z`)).replace(".", "")}
                  </span>
                ))}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-verde">Ver tabla</summary>
                <table className="mt-2 w-full text-left">
                  <thead className="text-xs text-gris">
                    <tr>
                      <th className="py-1 font-semibold">Mes</th>
                      <th className="py-1 text-right font-semibold">Por cobrar</th>
                      <th className="py-1 text-right font-semibold">Cobrado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ind.meses.map((m) => (
                      <tr key={m.periodo} className="border-t border-borde-suave">
                        <td className="py-1 first-letter:uppercase">{mesTexto(m.periodo)}</td>
                        <td className="py-1 text-right font-mono">{pesos.format(m.esperado)}</td>
                        <td className="py-1 text-right font-mono">{pesos.format(m.cobrado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>

            {vacias.length > 0 && (
              <section aria-label="Vacías ahora" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
                <h2 className="font-bold">Vacías ahora</h2>
                <ul className="flex flex-col divide-y divide-borde-suave text-sm">
                  {vacias.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                      <span>
                        <span className="block font-semibold">{p.nombre}</span>
                        <span className="text-xs text-gris">
                          Vacía hace {p.diasVaciaHoy} {p.diasVaciaHoy === 1 ? "día" : "días"}
                          {p.renta ? ` · se dejan de ganar ~${pesos.format(Math.round(p.renta / 30))} al día` : ""}
                        </span>
                      </span>
                      <Link href={`/propiedades/${p.id}/anuncio`} className="flex min-h-10 items-center rounded-xl bg-verde px-3 text-xs font-bold text-white">
                        Publicar anuncio
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Por propiedad" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Rentabilidad por propiedad</h2>
              <p className="text-xs text-gris">Rentas cobradas − mantenimiento a cargo del dueño − otros cargos, en los últimos 12 meses.</p>
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs text-gris">
                    <tr>
                      <th className="py-2 font-semibold">Propiedad</th>
                      <th className="py-2 text-right font-semibold">Ocupación</th>
                      <th className="py-2 text-right font-semibold">Días vacía</th>
                      <th className="py-2 text-right font-semibold">Cobrado</th>
                      <th className="py-2 text-right font-semibold">Gastos</th>
                      <th className="py-2 text-right font-semibold">Neto</th>
                      <th className="w-28 py-2" aria-label="Neto en barra" />
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <Renglon key={f.id} f={f} tope={topeNeto} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-borde font-bold">
                      <td className="py-2">Total</td>
                      <td className="py-2 text-right">{pct(ind.ocupacion12m)}</td>
                      <td />
                      <td className="py-2 text-right font-mono">{pesos.format(ind.ingresos)}</td>
                      <td className="py-2 text-right font-mono">{pesos.format(ind.ingresos - ind.neto)}</td>
                      <td className="py-2 text-right font-mono">{pesos.format(ind.neto)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Renglon({ f, tope }: { f: FilaPropiedad; tope: number }) {
  return (
    <tr className="border-t border-borde-suave">
      <td className="py-2">
        <Link href={`/propiedades/${f.id}`} className="font-semibold hover:underline">
          {f.nombre}
        </Link>
        <span className="block text-xs text-gris">
          {f.dueno ?? "Sin dueño"} · {f.tickets} {f.tickets === 1 ? "reporte" : "reportes"}
        </span>
      </td>
      <td className="py-2 text-right">{pct(f.ocupacion)}</td>
      <td className="py-2 text-right">{f.diasPeriodo - f.diasOcupada}</td>
      <td className="py-2 text-right font-mono">{pesos.format(f.ingresos)}</td>
      <td className="py-2 text-right font-mono">{pesos.format(f.mantenimiento + f.cargos)}</td>
      <td className={`py-2 text-right font-mono font-bold ${f.neto < 0 ? "text-naranja-oscuro" : ""}`}>{pesos.format(f.neto)}</td>
      <td className="py-2 pl-3">
        <div className="h-2 w-full rounded-full bg-fondo" title={`Neto ${pesos.format(f.neto)}`}>
          <div className={`h-2 rounded-full ${f.neto < 0 ? "bg-naranja" : "bg-verde"}`} style={{ width: `${(Math.abs(f.neto) / tope) * 100}%` }} />
        </div>
      </td>
    </tr>
  );
}

function Cifra({ titulo, valor, nota, alerta = false }: { titulo: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <li className="flex flex-col gap-1 rounded-2xl bg-white p-4">
      <span className="text-xs font-semibold text-gris">{titulo}</span>
      <span className={`font-display text-2xl font-bold ${alerta ? "text-naranja-oscuro" : ""}`}>{valor}</span>
      {nota && <span className="text-xs text-gris">{nota}</span>}
    </li>
  );
}
