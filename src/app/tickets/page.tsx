import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Menu } from "@/components/Menu";
import { sesion } from "@/lib/sesion";
import { CATEGORIAS, COLOR_ESTADO, ESTADOS_TICKET, etiqueta, formatoFecha } from "@/lib/datos";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Tickets · Black Key" };

type Fila = {
  id: string;
  folio: number;
  titulo: string;
  categoria: string | null;
  urgencia: string;
  estado: string;
  created_at: string;
  propiedades: { nombre: string } | null;
  cotizaciones: { id: string }[];
};


export default function Tickets({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { supabase, org } = await sesion();
  if (!org) redirect("/");
  const { estado } = await searchParams;
  const filtro = estado === "todos" || ESTADOS_TICKET.some(([v]) => v === estado) ? estado : "abiertos";

  let consulta = supabase
    .from("tickets")
    .select("id, folio, titulo, categoria, urgencia, estado, created_at, propiedades(nombre), cotizaciones(id)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filtro === "abiertos") consulta = consulta.not("estado", "in", "(resuelto,cancelado)");
  else if (filtro && filtro !== "todos") consulta = consulta.eq("estado", filtro);

  const { data } = await consulta;
  const tickets = (data ?? []) as unknown as Fila[];

  const filtros: [string, string][] = [["abiertos", "Abiertos"], ...ESTADOS_TICKET.map(([v, t]) => [v, t] as [string, string]), ["todos", "Todos"]];

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Tickets" nombreOrg={org.nombre} />
      <main className="min-w-0 flex-[999_1_560px] px-5 py-8 sm:px-10">
        <header>
          <p className="text-sm font-semibold text-gris">
            {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight">Tickets</h1>
        </header>

        <nav aria-label="Filtros" className="mt-5 flex flex-wrap gap-2">
          {filtros.map(([valor, texto]) => (
            <Link
              key={valor}
              href={valor === "abiertos" ? "/tickets" : `/tickets?estado=${valor}`}
              aria-current={filtro === valor ? "page" : undefined}
              className={
                filtro === valor
                  ? "flex min-h-10 items-center rounded-full bg-tinta px-4 text-sm font-bold text-white"
                  : "flex min-h-10 items-center rounded-full border border-borde bg-white px-4 text-sm font-semibold"
              }
            >
              {texto}
            </Link>
          ))}
        </nav>

        {tickets.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-white p-8 text-center">
            <h2 className="font-bold">Sin tickets aquí</h2>
            <p className="mt-1 text-sm text-gris">
              Los reportes llegan cuando tus inquilinos escanean el QR de su casa. Imprímelo desde la ficha de cada propiedad.
            </p>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tickets/${t.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white px-4 py-3.5 hover:ring-2 hover:ring-verde/30"
                >
                  <span className={`size-2.5 flex-none rounded-full ${t.urgencia === "urgente" ? "bg-naranja" : "bg-[#9AA8A2]"}`} aria-hidden="true" />
                  <span className="flex min-w-0 flex-[1_1_240px] flex-col">
                    <span className="truncate font-bold">{t.titulo}</span>
                    <span className="text-sm text-gris">
                      #{t.folio} · {t.propiedades?.nombre} · {etiqueta(CATEGORIAS, t.categoria)}
                    </span>
                  </span>
                  {t.urgencia === "urgente" && <span className="text-xs font-bold text-naranja-oscuro">Urgente</span>}
                  <span className="text-sm text-gris">
                    {t.cotizaciones.length} {t.cotizaciones.length === 1 ? "cotización" : "cotizaciones"}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${COLOR_ESTADO[t.estado] ?? ""}`}>
                    {etiqueta(ESTADOS_TICKET, t.estado) || "Cancelado"}
                  </span>
                  <span className="text-sm text-gris">{formatoFecha(t.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
