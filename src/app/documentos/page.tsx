import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AvisoVence, conLinks, type Doc } from "@/components/Documentos";
import { Cargando, Menu } from "@/components/Menu";
import { TIPOS_DOCUMENTO, etiqueta, formatoFecha } from "@/lib/datos";
import { hoyMX } from "@/lib/crm";
import { sesionConOrg } from "@/lib/sesion";

export const metadata: Metadata = { title: "Documentos · Black Key" };

type Fila = Doc & {
  propiedades: { id: string; nombre: string } | null;
  duenos: { id: string; nombre: string } | null;
  inquilinos: { id: string; nombre: string } | null;
};

export default function Documentos({ searchParams }: { searchParams: Promise<{ tipo?: string; ver?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<{ tipo?: string; ver?: string }> }) {
  const { supabase, org } = await sesionConOrg();
  const { tipo, ver } = await searchParams;
  const filtro = TIPOS_DOCUMENTO.some(([v]) => v === tipo) ? tipo : undefined;
  const porVencer = ver === "vencen";

  let q = supabase
    .from("documentos")
    .select("id, tipo, nombre, storage_path, vence, created_at, propiedades(id, nombre), duenos(id, nombre), inquilinos(id, nombre)")
    .order(porVencer ? "vence" : "created_at", { ascending: porVencer })
    .limit(200);
  if (filtro) q = q.eq("tipo", filtro);
  if (porVencer) q = q.not("vence", "is", null).lte("vence", hoyMX(60));
  const { data } = await q;
  const docs = await conLinks(supabase, (data ?? []) as unknown as Fila[]);

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Documentos" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <header>
          <h1 className="font-display text-4xl font-bold tracking-tight">Documentos</h1>
          <p className="mt-1 text-gris">Contratos, identificaciones, escrituras y pólizas. Súbelos desde la ficha de cada propiedad o persona.</p>
        </header>
        <nav aria-label="Tipo" className="flex flex-wrap gap-2">
          <Filtro href="/documentos" activo={!filtro && !porVencer} texto="Todos" />
          <Filtro href="/documentos?ver=vencen" activo={porVencer} texto="Vencen pronto" />
          {TIPOS_DOCUMENTO.map(([v, t]) => (
            <Filtro key={v} href={`/documentos?tipo=${v}`} activo={filtro === v} texto={t} />
          ))}
        </nav>
        <section aria-label="Lista de documentos" className="overflow-hidden rounded-2xl bg-white">
          {docs.length === 0 ? (
            <p className="p-5 text-sm text-gris">{porVencer ? "Nada vence en los próximos 60 días." : "Aún no hay documentos."}</p>
          ) : (
            <ul className="divide-y divide-borde-suave">
              {docs.map((d) => {
                const de = d.propiedades
                  ? { href: `/propiedades/${d.propiedades.id}`, nombre: d.propiedades.nombre }
                  : d.inquilinos
                    ? { href: `/personas/inquilinos/${d.inquilinos.id}`, nombre: d.inquilinos.nombre }
                    : d.duenos
                      ? { href: `/personas/duenos/${d.duenos.id}`, nombre: d.duenos.nombre }
                      : null;
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0 text-sm">
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noreferrer" className="block truncate font-semibold text-verde hover:underline">
                          {d.nombre}
                        </a>
                      ) : (
                        <span className="block font-semibold">{d.nombre}</span>
                      )}
                      <span className="text-xs text-gris">
                        {etiqueta(TIPOS_DOCUMENTO, d.tipo)} · subido {formatoFecha(d.created_at)}{" "}
                      </span>
                      <AvisoVence vence={d.vence} />
                    </span>
                    {de && (
                      <Link href={de.href} className="flex-none text-sm font-semibold hover:underline">
                        {de.nombre}
                      </Link>
                    )}
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

function Filtro({ href, activo, texto }: { href: string; activo: boolean; texto: string }) {
  return (
    <Link href={href} aria-current={activo ? "page" : undefined} className={`flex min-h-10 items-center rounded-full px-4 text-sm font-bold ${activo ? "bg-tinta text-white" : "bg-white text-tinta"}`}>
      {texto}
    </Link>
  );
}
