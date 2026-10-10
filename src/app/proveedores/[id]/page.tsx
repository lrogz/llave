import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { campo, Etiqueta } from "@/components/Seguimiento";
import { CATEGORIAS, COLOR_ESTADO, ESTADOS_TICKET, etiqueta, formatoFecha, linkWhatsApp, pesos } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";
import { duracion, entre, promedio as promedioDe } from "@/lib/crm";
import { guardarProveedor } from "../actions";

export const metadata: Metadata = { title: "Proveedor · Black Key" };

type Prov = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  es_red: boolean;
  especialidades: string[];
  zonas: string[];
  calificacion: number | null;
  trabajos: number;
  created_at: string;
};
type Cot = {
  id: string;
  solicitudes_cotizacion: { enviada_at: string } | null;
  monto: number | null;
  modo: string;
  estado: string;
  created_at: string;
  tickets: { id: string; folio: number; titulo: string; estado: string; calificacion: number | null; resuelto_at: string | null; propiedades: { nombre: string } | null } | null;
};
type Sol = { id: string; estado: string; enviada_at: string; vista_at: string | null; tickets: { id: string; folio: number; titulo: string } | null };

const ESTADO_COT: Record<string, string> = {
  recibida: "Recibida",
  seleccionada: "Elegida",
  enviada_aprobacion: "Con el dueño",
  aprobada: "Aprobada",
  rechazada: "No elegida",
};

export default function FichaProveedor({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await sesionConOrg();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await supabase
    .from("proveedores")
    .select("id, nombre, telefono, email, es_red, especialidades, zonas, calificacion, trabajos, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as Prov;

  const [cq, sq] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select("id, monto, modo, estado, created_at, solicitudes_cotizacion(enviada_at), tickets(id, folio, titulo, estado, calificacion, resuelto_at, propiedades(nombre))")
      .eq("proveedor_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("solicitudes_cotizacion").select("id, estado, enviada_at, vista_at, tickets(id, folio, titulo)").eq("proveedor_id", id).order("enviada_at", { ascending: false }).limit(50),
  ]);
  const cotizaciones = (cq.data ?? []) as unknown as Cot[];
  const solicitudes = (sq.data ?? []) as unknown as Sol[];

  const ganadas = cotizaciones.filter((c) => c.estado === "aprobada");
  const pagado = ganadas.filter((c) => c.tickets?.estado === "resuelto").reduce((s, c) => s + Number(c.monto ?? 0), 0);
  const enCurso = ganadas.filter((c) => c.tickets && c.tickets.estado !== "resuelto" && c.tickets.estado !== "cancelado");
  const respondio = solicitudes.filter((s) => s.estado === "cotizada" || s.estado === "visita_agendada").length;
  const conMonto = cotizaciones.filter((c) => c.monto != null);
  const promedio = conMonto.length ? conMonto.reduce((s, c) => s + Number(c.monto), 0) / conMonto.length : null;
  const ahora = new Date().toISOString();
  const tarda = promedioDe(cotizaciones.map((c) => entre(c.solicitudes_cotizacion?.enviada_at, c.created_at)));
  const sinResponder = solicitudes.filter((s) => s.estado === "enviada" || s.estado === "vista");

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Proveedores" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-7 sm:px-10">
        <Link href="/proveedores" className="text-sm font-semibold text-verde">
          ‹ Proveedores
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris">{p.es_red ? "Red Black Key" : "Tu proveedor"}</p>
            <h1 className="font-display text-4xl font-bold tracking-tight">{p.nombre}</h1>
            <p className="text-sm text-gris">
              {p.especialidades.map((e) => etiqueta(CATEGORIAS, e)).join(" · ") || "Sin especialidad"}
              {p.zonas.length > 0 && ` · ${p.zonas.join(", ")}`}
            </p>
          </div>
          {p.telefono && (
            <a
              href={linkWhatsApp(p.telefono, `Hola ${p.nombre.split(" ")[0]}, `)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center rounded-xl bg-verde px-4 text-sm font-bold text-white"
            >
              Escribir por WhatsApp
            </a>
          )}
        </header>

        <ul aria-label="Desempeño" className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          <Cifra titulo="Calificación" valor={p.calificacion != null ? `★ ${Number(p.calificacion).toFixed(1)}` : "—"} nota={`${p.trabajos} ${p.trabajos === 1 ? "trabajo" : "trabajos"}`} />
          <Cifra titulo="Responde" valor={solicitudes.length ? `${Math.round((respondio / solicitudes.length) * 100)}%` : "—"} nota={`${respondio} de ${solicitudes.length} invitaciones`} />
          <Cifra titulo="Cotiza en" valor={tarda != null ? duracion(tarda) : "—"} nota="promedio desde que lo invitas" />
          <Cifra titulo="Gana" valor={cotizaciones.length ? `${Math.round((ganadas.length / cotizaciones.length) * 100)}%` : "—"} nota={`${ganadas.length} de ${cotizaciones.length} cotizaciones`} />
          <Cifra titulo="Le has pagado" valor={pesos.format(pagado)} nota={promedio != null ? `cotiza ~${pesos.format(promedio)}` : undefined} />
        </ul>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-5">
            {(enCurso.length > 0 || sinResponder.length > 0) && (
              <section aria-label="Pendiente con este proveedor" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
                <h2 className="font-bold">Pendiente con este proveedor</h2>
                <ul className="flex flex-col divide-y divide-borde-suave text-sm">
                  {enCurso.map((c) => (
                    <li key={c.id}>
                      <Link href={`/tickets/${c.tickets!.id}`} className="flex min-h-11 items-center justify-between gap-2 py-1 hover:underline">
                        <span>
                          Trabajo aprobado: #{c.tickets!.folio} {c.tickets!.titulo}
                        </span>
                        <span className="font-mono">{c.monto != null ? pesos.format(c.monto) : ""}</span>
                      </Link>
                    </li>
                  ))}
                  {sinResponder.map((s) => (
                    <li key={s.id}>
                      <Link href={s.tickets ? `/tickets/${s.tickets.id}` : "#"} className="flex min-h-11 items-center justify-between gap-2 py-1 hover:underline">
                        <span>
                          No ha cotizado: #{s.tickets?.folio} {s.tickets?.titulo}
                        </span>
                        <span className="text-xs text-gris">
                          {s.vista_at ? "Vio el link · " : ""}invitado hace {duracion(entre(s.enviada_at, ahora)!)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Historial de cotizaciones" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Historial de cotizaciones</h2>
              {cotizaciones.length === 0 ? (
                <p className="text-sm text-gris">Todavía no ha cotizado contigo. Invítalo desde un ticket.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-borde-suave">
                  {cotizaciones.map((c) => (
                    <li key={c.id}>
                      <Link href={c.tickets ? `/tickets/${c.tickets.id}` : "#"} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:bg-fondo">
                        <span className="min-w-0">
                          <span className="block font-semibold">
                            #{c.tickets?.folio} {c.tickets?.titulo}
                          </span>
                          <span className="text-xs text-gris">
                            {c.tickets?.propiedades?.nombre} · {formatoFecha(c.created_at)}
                            {c.modo === "visita" ? " · visita" : ""}
                            {c.tickets?.calificacion ? ` · ★ ${c.tickets.calificacion}` : ""}
                          </span>
                        </span>
                        <span className="flex flex-none items-center gap-2">
                          <span className="font-mono">{c.monto != null ? pesos.format(c.monto) : "—"}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c.estado === "aprobada" ? "bg-verde-claro text-verde-oscuro" : c.estado === "rechazada" ? "bg-fondo text-gris" : "bg-[#FFF4E0] text-[#7A4E00]"}`}>
                            {ESTADO_COT[c.estado] ?? c.estado}
                          </span>
                          {c.tickets && (
                            <span className={`hidden rounded-full px-2.5 py-0.5 text-xs font-bold sm:inline ${COLOR_ESTADO[c.tickets.estado] ?? ""}`}>
                              {etiqueta(ESTADOS_TICKET, c.tickets.estado) || "Cancelado"}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section aria-label="Datos del proveedor" className="flex-[1_1_300px] rounded-2xl bg-white p-5">
            <h2 className="font-bold">Datos</h2>
            {p.es_red ? (
              <p className="mt-2 text-sm text-gris">Proveedor de la red Black Key. Sus datos los mantiene Black Key.</p>
            ) : (
              <form action={guardarProveedor} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="id" value={p.id} />
                <Etiqueta texto="Nombre">
                  <input name="nombre" required defaultValue={p.nombre} className={campo} />
                </Etiqueta>
                <Etiqueta texto="WhatsApp">
                  <input name="telefono" type="tel" defaultValue={p.telefono ?? ""} className={campo} />
                </Etiqueta>
                <Etiqueta texto="Correo">
                  <input name="email" type="email" defaultValue={p.email ?? ""} className={campo} />
                </Etiqueta>
                <fieldset className="flex flex-wrap gap-1.5 pt-1">
                  <legend className="mb-1.5 text-xs font-semibold text-gris">¿Qué hace?</legend>
                  {CATEGORIAS.map(([v, t]) => (
                    <label key={v} className="flex min-h-9 cursor-pointer items-center rounded-full border border-borde px-3 text-xs font-semibold has-checked:border-verde has-checked:bg-verde-claro has-checked:text-verde-oscuro">
                      <input type="checkbox" name="especialidades" value={v} defaultChecked={p.especialidades.includes(v)} className="sr-only" />
                      {t}
                    </label>
                  ))}
                </fieldset>
                <Etiqueta texto="Zonas donde trabaja">
                  <input name="zonas" defaultValue={p.zonas.join(", ")} placeholder="Jurica, Juriquilla" className={campo} />
                </Etiqueta>
                <Boton className="mt-1 self-start" estilo="claro">
                  Guardar cambios
                </Boton>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Cifra({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <li className="flex flex-col gap-1 rounded-2xl bg-white p-4">
      <span className="text-sm text-gris">{titulo}</span>
      <span className="font-mono text-2xl font-bold">{valor}</span>
      {nota && <span className="text-xs text-gris">{nota}</span>}
    </li>
  );
}
