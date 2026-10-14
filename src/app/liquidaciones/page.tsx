import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Menu } from "@/components/Menu";
import { hoyMX } from "@/lib/crm";
import { pesos } from "@/lib/datos";
import { armarReporte, inicioDeMes, mesAnterior, mesTexto, periodoALiquidar, siguienteMes } from "@/lib/reporte";
import { sesionConOrg } from "@/lib/sesion";

export const metadata: Metadata = { title: "Liquidaciones · Black Key" };

export default function Liquidaciones({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { supabase, org } = await sesionConOrg();
  const { mes } = await searchParams;
  const hoy = hoyMX();
  const periodo = mes && /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : periodoALiquidar(hoy);
  await supabase.rpc("actualizar_cobros", { org: org.id });

  const { data } = await supabase.from("duenos").select("id, nombre, clabe, propiedades(id)").order("nombre");
  const duenos = ((data ?? []) as { id: string; nombre: string; clabe: string | null; propiedades: { id: string }[] }[]).filter((d) => d.propiedades.length);
  const filas = (await Promise.all(duenos.map(async (d) => ({ d, r: await armarReporte(supabase, d.id, periodo) })))).filter((x) => x.r);

  const pendientes = filas.filter((x) => !x.r!.liquidacion && x.r!.totales.saldo > 0);
  const porTransferir = pendientes.reduce((s, x) => s + x.r!.totales.saldo, 0);
  const transferido = filas.reduce((s, x) => s + (x.r!.liquidacion?.total ?? 0), 0);
  const comisiones = filas.reduce((s, x) => s + x.r!.totales.comision, 0);
  const q = (p: string) => `/liquidaciones?mes=${p.slice(0, 7)}`;

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Liquidaciones" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris">Liquidaciones a dueños</p>
            <h1 className="font-display text-4xl font-bold tracking-tight first-letter:uppercase">{mesTexto(periodo)}</h1>
          </div>
          <nav aria-label="Mes" className="flex gap-2">
            <Link href={q(mesAnterior(periodo))} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold">
              ‹ Anterior
            </Link>
            {periodo < inicioDeMes(hoy) && (
              <Link href={q(siguienteMes(periodo))} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold">
                Siguiente ›
              </Link>
            )}
          </nav>
        </header>

        <ul aria-label="Resumen de liquidaciones" className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
          <Cifra titulo="Por transferir" valor={pesos.format(porTransferir)} nota={`${pendientes.length} ${pendientes.length === 1 ? "dueño" : "dueños"}`} />
          <Cifra titulo="Ya transferido" valor={pesos.format(transferido)} />
          <Cifra titulo="Tus comisiones" valor={pesos.format(comisiones)} verde />
        </ul>

        <section aria-label="Dueños" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
          {filas.length === 0 ? (
            <p className="text-sm text-gris">Todavía no tienes dueños con propiedades.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-borde-suave">
              {filas.map(({ d, r }) => {
                const t = r!.totales;
                const falta = t.rentaEsperada - t.rentaCobrada;
                return (
                  <li key={d.id}>
                    <Link href={`/liquidaciones/${d.id}?mes=${periodo.slice(0, 7)}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:opacity-80">
                      <span className="min-w-0">
                        <span className="block font-semibold">{d.nombre}</span>
                        <span className="text-xs text-gris">
                          Cobrado {pesos.format(t.rentaCobrada)} · comisión {pesos.format(t.comision)}
                          {t.gastos + t.cargos ? ` · gastos ${pesos.format(t.gastos + t.cargos)}` : ""}
                          {falta > 0 ? ` · faltan ${pesos.format(falta)} por cobrar` : ""}
                          {!d.clabe ? " · sin CLABE" : ""}
                        </span>
                      </span>
                      <span className="flex flex-none items-center gap-2">
                        <span className="font-mono font-bold">{pesos.format(r!.liquidacion?.total ?? t.saldo)}</span>
                        <Estado r={r!} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function Estado({ r }: { r: NonNullable<Awaited<ReturnType<typeof armarReporte>>> }) {
  if (r.liquidacion) return <span className="rounded-full bg-verde-claro px-2.5 py-0.5 text-xs font-bold text-verde-oscuro">Transferida</span>;
  if (r.totales.saldo < 0) return <span className="rounded-full bg-naranja-claro px-2.5 py-0.5 text-xs font-bold text-naranja-oscuro">El dueño debe</span>;
  if (r.totales.saldo === 0) return <span className="rounded-full bg-fondo px-2.5 py-0.5 text-xs font-bold text-gris">Sin saldo</span>;
  return <span className="rounded-full bg-[#FFF4E0] px-2.5 py-0.5 text-xs font-bold text-[#7A4E00]">Por transferir</span>;
}

function Cifra({ titulo, valor, nota, verde = false }: { titulo: string; valor: string; nota?: string; verde?: boolean }) {
  return (
    <li className={`flex flex-col gap-1 rounded-2xl p-4 ${verde ? "bg-verde text-white" : "bg-white"}`}>
      <span className={`text-xs font-semibold ${verde ? "text-white/80" : "text-gris"}`}>{titulo}</span>
      <span className="font-display text-2xl font-bold">{valor}</span>
      {nota && <span className={`text-xs ${verde ? "text-white/80" : "text-gris"}`}>{nota}</span>}
    </li>
  );
}
