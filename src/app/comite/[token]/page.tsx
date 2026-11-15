import type { Metadata } from "next";
import Link from "next/link";
import { IndicadoresPiloto } from "@/components/IndicadoresPiloto";
import { ResumenObras } from "@/components/ResumenObras";
import type { Indicadores } from "@/lib/csv";
import { Suspense } from "react";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { ReporteCondominio, type Resumen } from "@/components/ReporteCondominio";
import { createAdminClient } from "@/lib/supabase/admin";
import { esToken, hoyCDMX, mesTexto } from "@/lib/condominios";

export const metadata: Metadata = { title: "Reporte del comité", robots: { index: false, follow: false }, referrer: "same-origin" };

const mover = (mes: string, n: number) => {
  const d = new Date(`${mes}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export default function Comite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ mes?: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-5 py-6">
      <Logo />
      <Suspense fallback={<p className="text-sm text-gris">Cargando…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ mes?: string }> }) {
  await connection();
  const [{ token }, { mes: m }] = await Promise.all([params, searchParams]);
  const actual = hoyCDMX().slice(0, 7);
  const mes = m && /^\d{4}-\d{2}$/.test(m) ? m : actual;
  const { data, error } = esToken(token) ? await createAdminClient().rpc("comite_datos", { p_token: token, p_mes: `${mes}-01` }) : { data: null, error: true };
  if (error || !data) return <p className="rounded-2xl bg-white p-6 text-sm">Este link ya no es válido. Pide el nuevo a la administración.</p>;
  const d = data as Resumen & { condominio: string; administradora: string; exporta: boolean };
  // Indicadores operativos del mes elegido contra el mes anterior, y obras con cuota.
  const desde = `${mes}-01T00:00:00-06:00`;
  const hasta = `${mover(mes, 1)}-01T00:00:00-06:00`;
  const [ind, obras] = await Promise.all([
    createAdminClient().rpc("comite_indicadores", { p_token: token, p_desde: desde, p_hasta: hasta }),
    createAdminClient().rpc("comite_obras", { p_token: token }),
  ]);
  const indicadores = ind.data as { actual: Indicadores; anterior: Indicadores } | null;
  const listaObras = (obras.data ?? []) as Parameters<typeof ResumenObras>[0]["obras"];
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gris">
            Comité · {d.condominio} · administra {d.administradora}
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight">{mesTexto(mes)}</h1>
        </div>
        <nav aria-label="Mes" className="flex flex-wrap gap-2">
          <Link href={`?mes=${mover(mes, -1)}`} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold">
            ‹ Anterior
          </Link>
          {mes < actual && (
            <Link href={`?mes=${mover(mes, 1)}`} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold">
              Siguiente ›
            </Link>
          )}
          {d.exporta && (
            <a href={`/comite/${token}/movimientos?mes=${mes}`} className="flex min-h-11 items-center rounded-xl bg-verde px-4 text-sm font-bold text-white">
              Descargar movimientos (CSV)
            </a>
          )}
        </nav>
      </header>
      <ReporteCondominio r={d} />
      {listaObras.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold">Obras</h2>
          <ResumenObras obras={listaObras} />
        </section>
      )}
      {indicadores && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold">Operación de caseta y reportes</h2>
          <p className="text-sm text-gris">Comparado con el mes anterior. Verde = mejoró.</p>
          <IndicadoresPiloto actual={indicadores.actual} anterior={indicadores.anterior} />
        </section>
      )}
      <p className="text-xs text-gris">Solo lectura. Las quejas privadas aparecen solo como número.</p>
    </>
  );
}
