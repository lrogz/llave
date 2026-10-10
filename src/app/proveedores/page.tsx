import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { campo } from "@/components/Seguimiento";
import { CATEGORIAS, etiqueta, linkWhatsApp, pesos } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";
import { duracion, entre, promedio } from "@/lib/crm";
import { agregarProveedor } from "./actions";

export const metadata: Metadata = { title: "Proveedores · Black Key" };

type Prov = {
  id: string;
  nombre: string;
  telefono: string | null;
  es_red: boolean;
  especialidades: string[];
  zonas: string[];
  calificacion: number | null;
  trabajos: number;
  cotizaciones: { monto: number | null; estado: string; created_at: string; tickets: { estado: string } | null; solicitudes_cotizacion: { enviada_at: string } | null }[];
  solicitudes_cotizacion: { estado: string }[];
};

export default function Proveedores({ searchParams }: { searchParams: Promise<{ esp?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<{ esp?: string }> }) {
  const { supabase, org } = await sesionConOrg();
  const { esp } = await searchParams;
  const filtro = CATEGORIAS.some(([v]) => v === esp) ? esp : undefined;

  let q = supabase
    .from("proveedores")
    .select("id, nombre, telefono, es_red, especialidades, zonas, calificacion, trabajos, cotizaciones(monto, estado, created_at, tickets(estado), solicitudes_cotizacion(enviada_at)), solicitudes_cotizacion(estado)")
    .order("calificacion", { ascending: false, nullsFirst: false })
    .order("nombre");
  if (filtro) q = q.contains("especialidades", [filtro]);
  const { data } = await q;
  const todos = (data ?? []) as unknown as Prov[];
  const mios = todos.filter((p) => !p.es_red);
  const red = todos.filter((p) => p.es_red);

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Proveedores" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <header>
          <h1 className="font-display text-4xl font-bold tracking-tight">Proveedores</h1>
          <p className="mt-1 text-gris">Tus proveedores de siempre, con su calificación y lo que les has pagado.</p>
        </header>

        <nav aria-label="Especialidad" className="flex flex-wrap gap-2">
          <Filtro href="/proveedores" activo={!filtro} texto="Todos" />
          {CATEGORIAS.map(([v, t]) => (
            <Filtro key={v} href={`/proveedores?esp=${v}`} activo={filtro === v} texto={t} />
          ))}
        </nav>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-5">
            <section aria-label="Mis proveedores" className="overflow-hidden rounded-2xl bg-white">
              {mios.length === 0 ? (
                <p className="p-5 text-sm text-gris">
                  {filtro ? `No tienes proveedores de ${etiqueta(CATEGORIAS, filtro).toLowerCase()}.` : "Agrega a tus proveedores de siempre para invitarlos a cotizar con un clic."}
                </p>
              ) : (
                <ul className="divide-y divide-borde-suave">
                  {mios.map((p) => (
                    <Fila key={p.id} p={p} />
                  ))}
                </ul>
              )}
            </section>
            {red.length > 0 && (
              <section aria-label="Red Black Key" className="overflow-hidden rounded-2xl bg-white">
                <h2 className="px-5 pt-5 font-bold">Red Black Key</h2>
                <p className="px-5 text-sm text-gris">Proveedores verificados por si no tienes uno de confianza.</p>
                <ul className="mt-2 divide-y divide-borde-suave">
                  {red.map((p) => (
                    <Fila key={p.id} p={p} />
                  ))}
                </ul>
              </section>
            )}
          </div>

          <form action={agregarProveedor} className="flex flex-[1_1_280px] flex-col gap-3 rounded-2xl border-2 border-dashed border-borde bg-white p-5">
            <h2 className="font-bold">Agregar proveedor</h2>
            <input name="nombre" required placeholder="Raúl G. Plomería" aria-label="Nombre" className={campo} />
            <input name="telefono" type="tel" placeholder="WhatsApp" aria-label="WhatsApp" className={campo} />
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="mb-1.5 text-sm font-semibold">¿Qué hace?</legend>
              {CATEGORIAS.map(([v, t]) => (
                <label key={v} className="flex min-h-9 cursor-pointer items-center rounded-full border border-borde px-3 text-xs font-semibold has-checked:border-verde has-checked:bg-verde-claro has-checked:text-verde-oscuro">
                  <input type="checkbox" name="especialidades" value={v} defaultChecked={filtro === v} className="sr-only" />
                  {t}
                </label>
              ))}
            </fieldset>
            <input name="zonas" placeholder="Zonas (ej. Jurica, Juriquilla)" aria-label="Zonas" className={campo} />
            <Boton enviando="Agregando…">+ Agregar proveedor</Boton>
          </form>
        </div>
      </main>
    </div>
  );
}

function Filtro({ href, activo, texto }: { href: string; activo: boolean; texto: string }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`flex min-h-10 items-center rounded-full px-4 text-sm font-bold ${activo ? "bg-tinta text-white" : "bg-white text-tinta"}`}
    >
      {texto}
    </Link>
  );
}

function Fila({ p }: { p: Prov }) {
  const pagado = p.cotizaciones.filter((c) => c.estado === "aprobada" && c.tickets?.estado === "resuelto").reduce((s, c) => s + Number(c.monto ?? 0), 0);
  const respondio = p.solicitudes_cotizacion.filter((s) => s.estado === "cotizada" || s.estado === "visita_agendada").length;
  const invitaciones = p.solicitudes_cotizacion.length;
  const tarda = promedio(p.cotizaciones.map((c) => entre(c.solicitudes_cotizacion?.enviada_at, c.created_at)));
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <Link href={`/proveedores/${p.id}`} className="min-w-0 flex-1 hover:underline">
        <span className="block font-bold">{p.nombre}</span>
        <span className="flex flex-wrap gap-1 pt-1">
          {p.especialidades.map((e) => (
            <span key={e} className="rounded-full bg-fondo px-2 py-0.5 text-xs font-semibold text-gris">
              {etiqueta(CATEGORIAS, e)}
            </span>
          ))}
        </span>
      </Link>
      <span className="flex flex-none flex-wrap items-center gap-4 text-sm">
        <Dato titulo="Calificación" valor={p.calificacion != null ? `★ ${Number(p.calificacion).toFixed(1)}` : "—"} />
        <Dato titulo="Trabajos" valor={String(p.trabajos)} />
        {!p.es_red && <Dato titulo="Responde" valor={invitaciones ? `${Math.round((respondio / invitaciones) * 100)}%` : "—"} />}
        {!p.es_red && <Dato titulo="Cotiza en" valor={tarda != null ? duracion(tarda) : "—"} />}
        {!p.es_red && <Dato titulo="Pagado" valor={pesos.format(pagado)} />}
        {p.telefono && (
          <a href={linkWhatsApp(p.telefono, `Hola ${p.nombre.split(" ")[0]}, `)} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded-xl border border-borde px-3 text-xs font-bold hover:border-verde">
            WhatsApp
          </a>
        )}
      </span>
    </li>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-xs text-gris">{titulo}</span>
      <span className="font-mono font-bold">{valor}</span>
    </span>
  );
}
