import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Menu } from "@/components/Menu";
import { sesion } from "@/lib/sesion";
import { CATEGORIAS, COLOR_ESTADO, ESTADOS_TICKET, etiqueta, formatoFecha } from "@/lib/datos";
import { redirect } from "next/navigation";
import { duracion, entre, haceHoras, promedio } from "@/lib/crm";

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

  const desde = haceHoras(90 * 24);
  const [{ data }, { data: hist }, { data: aps }] = await Promise.all([
    consulta,
    supabase
      .from("tickets")
      .select("created_at, resuelto_at, estado, solicitudes_cotizacion(enviada_at), cotizaciones(created_at)")
      .gte("created_at", desde)
      .neq("estado", "cancelado"),
    supabase.from("aprobaciones").select("created_at, decidida_at").gte("created_at", desde).not("decidida_at", "is", null),
  ]);
  const tickets = (data ?? []) as unknown as Fila[];

  // Tiempos de respuesta (últimos 90 días)
  const h = (hist ?? []) as { created_at: string; resuelto_at: string | null; estado: string; solicitudes_cotizacion: { enviada_at: string }[]; cotizaciones: { created_at: string }[] }[];
  const ahora = new Date().toISOString();
  const tResolver = promedio(h.map((x) => entre(x.created_at, x.resuelto_at)));
  const tCotizar = promedio(
    h.map((x) => {
      const c = x.cotizaciones.map((y) => y.created_at).sort()[0];
      const s = x.solicitudes_cotizacion.map((y) => y.enviada_at).sort()[0];
      return entre(s ?? x.created_at, c);
    }),
  );
  const tAprobar = promedio((aps ?? []).map((a) => entre(a.created_at, a.decidida_at)));
  const abiertos = h.filter((x) => x.estado !== "resuelto");
  const masViejo = abiertos.length ? Math.max(...abiertos.map((x) => entre(x.created_at, ahora)!)) : null;

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

        <ul aria-label="Tiempos de respuesta" className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          <Tiempo titulo="Se resuelven en" valor={tResolver} nota="promedio, 90 días" />
          <Tiempo titulo="Primera cotización en" valor={tCotizar} nota="desde que invitas" />
          <Tiempo titulo="Dueños aprueban en" valor={tAprobar} nota="promedio" />
          <Tiempo titulo="Abierto más antiguo" valor={masViejo} nota={`${abiertos.length} abiertos`} alerta={masViejo != null && masViejo > 7 * 86_400_000} />
        </ul>

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
                  {t.estado === "resuelto" || t.estado === "cancelado" ? (
                    <span className="text-sm text-gris">{formatoFecha(t.created_at)}</span>
                  ) : (
                    <span className={`text-sm ${entre(t.created_at, ahora)! > 7 * 86_400_000 ? "font-semibold text-naranja-oscuro" : "text-gris"}`}>
                      hace {duracion(entre(t.created_at, ahora)!)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Tiempo({ titulo, valor, nota, alerta }: { titulo: string; valor: number | null; nota: string; alerta?: boolean }) {
  return (
    <li className={`flex flex-col gap-1 rounded-2xl p-4 ${alerta ? "bg-naranja-claro" : "bg-white"}`}>
      <span className="text-sm text-gris">{titulo}</span>
      <span className={`font-display text-2xl font-bold ${alerta ? "text-naranja-oscuro" : ""}`}>{valor == null ? "—" : duracion(valor)}</span>
      <span className="text-xs text-gris">{nota}</span>
    </li>
  );
}
