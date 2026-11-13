import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cargando, Menu } from "@/components/Menu";
import { sesionConOrg } from "@/lib/sesion";
import { esUuid, hoyCDMX } from "@/lib/condominios";
import { origen } from "@/lib/util";
import { Accesos, Amenidades, Avisos, Caseta, Cuotas, Reportes, Resumen, Viviendas, type Ctx } from "./secciones";

export const metadata: Metadata = { title: "Condominio · Black Key" };

const VISTAS = [
  ["resumen", "Resumen"],
  ["viviendas", "Viviendas y residentes"],
  ["cuotas", "Cuotas y pagos"],
  ["accesos", "Accesos"],
  ["amenidades", "Amenidades y mudanzas"],
  ["avisos", "Avisos"],
  ["caseta", "Caseta y links"],
  ["reportes", "Reporte del mes"],
] as const;

type Busqueda = { vista?: string; mes?: string; [k: string]: string | undefined };

export default function Condominio({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Busqueda> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Busqueda> }) {
  const s = await sesionConOrg();
  const [{ id }, q] = await Promise.all([params, searchParams]);
  if (!esUuid(id)) notFound();
  const { data: c } = await s.supabase
    .from("condominios")
    .select("id, organizacion_id, propiedad_id, nombre, direccion, datos_pago, foto_path, caseta_token, comite_token, alta_token, comite_exporta, recibo_serie")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const vista = VISTAS.some(([v]) => v === q.vista) ? (q.vista as string) : "resumen";
  const ctx: Ctx = { supabase: s.supabase, c, q, base: await origen(), hoy: hoyCDMX(), email: s.user.email ?? "" };

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Condominios" nombreOrg={s.org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <header>
          <Link href="/condominios" className="text-sm font-semibold text-gris">
            ‹ Condominios
          </Link>
          <h1 className="font-display text-4xl font-bold tracking-tight">{c.nombre}</h1>
          {c.direccion && <p className="text-sm text-gris">{c.direccion}</p>}
        </header>
        <nav aria-label="Secciones del condominio" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2">
            {VISTAS.map(([v, t]) => (
              <li key={v}>
                <Link
                  href={`/condominios/${c.id}?vista=${v}`}
                  aria-current={v === vista ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-full px-4 text-sm font-bold whitespace-nowrap ${v === vista ? "bg-tinta text-white" : "border border-borde bg-white"}`}
                >
                  {t}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {vista === "resumen" && <Resumen ctx={ctx} />}
        {vista === "viviendas" && <Viviendas ctx={ctx} />}
        {vista === "cuotas" && <Cuotas ctx={ctx} />}
        {vista === "accesos" && <Accesos ctx={ctx} />}
        {vista === "amenidades" && <Amenidades ctx={ctx} />}
        {vista === "avisos" && <Avisos ctx={ctx} />}
        {vista === "caseta" && <Caseta ctx={ctx} />}
        {vista === "reportes" && <Reportes ctx={ctx} />}
      </main>
    </div>
  );
}
