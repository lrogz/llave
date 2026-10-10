import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Avance } from "@/components/Avance";
import { Boton } from "@/components/Boton";
import { InputComprimido } from "@/components/InputComprimido";
import { Cargando, Menu } from "@/components/Menu";
import { sesion } from "@/lib/sesion";
import {
  BUCKET,
  CATEGORIAS,
  COLOR_ESTADO,
  DISPONIBILIDAD,
  ESTADOS_TICKET,
  QUIEN_PAGA,
  etiqueta,
  formatoFecha,
  formatoFechaHora,
  linkWhatsApp,
  origen,
  pesos,
} from "@/lib/util";
import { aprobarYo, cancelarTicket, enviarAlDueno, invitarProveedor, marcarResuelto, subirCotizacion } from "../actions";

export const metadata: Metadata = { title: "Ticket · Black Key" };

type Proveedor = { id: string; nombre: string; telefono: string | null; es_red: boolean; calificacion: number | null; trabajos: number };
type Cotizacion = {
  id: string;
  modo: "remota" | "visita";
  monto: number | null;
  incluye_materiales: boolean | null;
  garantia_dias: number | null;
  fechas_disponibles: string[];
  visita_at: string | null;
  archivo_path: string | null;
  subida_por_admin: boolean;
  notas: string | null;
  estado: string;
  created_at: string;
  proveedores: Proveedor | null;
};
type Solicitud = { id: string; estado: string; token: string; enviada_at: string; vista_at: string | null; proveedores: Proveedor | null };
type Aprobacion = { id: string; token: string; decision: string | null; comentario: string | null; decidida_at: string | null; cotizacion_id: string; created_at: string };
type Ticket = {
  id: string;
  folio: number;
  titulo: string;
  descripcion: string | null;
  categoria: string | null;
  urgencia: string;
  estado: string;
  quien_paga: string | null;
  disponibilidad: string[];
  canal_origen: string;
  token_publico: string;
  calificacion: number | null;
  created_at: string;
  propiedades: {
    id: string;
    nombre: string;
    direccion: string | null;
    colonia: string | null;
    duenos: { nombre: string; telefono: string | null } | null;
  } | null;
  inquilinos: { nombre: string; telefono: string | null } | null;
};

export default function DetalleTicket({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await sesion();
  if (!org) redirect("/");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: t } = await supabase
    .from("tickets")
    .select(
      "id, folio, titulo, descripcion, categoria, urgencia, estado, quien_paga, disponibilidad, canal_origen, token_publico, calificacion, created_at, propiedades(id, nombre, direccion, colonia, duenos(nombre, telefono)), inquilinos(nombre, telefono)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();
  const ticket = t as unknown as Ticket;

  const [{ data: media }, { data: sol }, { data: cot }, { data: provs }] = await Promise.all([
    supabase.from("ticket_media").select("id, tipo, storage_path, momento").eq("ticket_id", id).order("created_at"),
    supabase
      .from("solicitudes_cotizacion")
      .select("id, estado, token, enviada_at, vista_at, proveedores(id, nombre, telefono, es_red, calificacion, trabajos)")
      .eq("ticket_id", id)
      .order("enviada_at"),
    supabase
      .from("cotizaciones")
      .select("id, modo, monto, incluye_materiales, garantia_dias, fechas_disponibles, visita_at, archivo_path, subida_por_admin, notas, estado, created_at, proveedores(id, nombre, telefono, es_red, calificacion, trabajos)")
      .eq("ticket_id", id)
      .order("created_at"),
    supabase.from("proveedores").select("id, nombre").eq("organizacion_id", org.id).order("nombre"),
  ]);
  const solicitudes = (sol ?? []) as unknown as Solicitud[];
  const cotizaciones = (cot ?? []) as unknown as Cotizacion[];
  const misProveedores = (provs ?? []) as { id: string; nombre: string }[];

  const { data: aps } = cotizaciones.length
    ? await supabase
        .from("aprobaciones")
        .select("id, token, decision, comentario, decidida_at, cotizacion_id, created_at")
        .in("cotizacion_id", cotizaciones.map((c) => c.id))
        .order("created_at", { ascending: false })
    : { data: [] };
  const aprobaciones = (aps ?? []) as Aprobacion[];

  // URLs firmadas (1 hora) para ver fotos, videos y archivos de cotización.
  const rutas = [...(media ?? []).map((m) => m.storage_path as string), ...cotizaciones.flatMap((c) => (c.archivo_path ? [c.archivo_path] : []))];
  const { data: firmadas } = rutas.length ? await supabase.storage.from(BUCKET).createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));

  const base = await origen();
  const propiedad = ticket.propiedades;
  const dueno = propiedad?.duenos ?? null;
  const categoria = etiqueta(CATEGORIAS, ticket.categoria);
  const abierto = ticket.estado !== "resuelto" && ticket.estado !== "cancelado";

  // Etiquetas de comparación.
  const conMonto = cotizaciones.filter((c) => c.monto != null);
  const minMonto = conMonto.length > 1 ? Math.min(...conMonto.map((c) => c.monto!)) : null;
  const fechaDe = (c: Cotizacion) => c.visita_at ?? c.fechas_disponibles?.[0] ?? null;
  const conFecha = cotizaciones.filter((c) => fechaDe(c));
  const masPronto = conFecha.length > 1 ? conFecha.reduce((a, b) => (fechaDe(a)! <= fechaDe(b)! ? a : b)).id : null;
  const conCalif = cotizaciones.filter((c) => c.proveedores?.calificacion != null);
  const mejorCalif = conCalif.length > 1 ? conCalif.reduce((a, b) => (a.proveedores!.calificacion! >= b.proveedores!.calificacion! ? a : b)).id : null;

  const elegida = cotizaciones.find((c) => c.estado === "aprobada") ?? cotizaciones.find((c) => c.estado === "enviada_aprobacion");
  const aprobacionVigente = elegida ? aprobaciones.find((a) => a.cotizacion_id === elegida.id) : undefined;

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Tickets" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-7 sm:px-10">
        <Link href="/tickets" className="text-sm font-semibold text-verde">
          ‹ Tickets
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {ticket.urgencia === "urgente" && (
                <span className="rounded-full bg-naranja-claro px-2.5 py-1 text-xs font-bold text-naranja-oscuro">Urgente</span>
              )}
              {categoria && <span className="rounded-full bg-[#E8EEFB] px-2.5 py-1 text-xs font-bold text-[#2A4A93]">{categoria}</span>}
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold">#{ticket.folio}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${COLOR_ESTADO[ticket.estado] ?? ""}`}>
                {etiqueta(ESTADOS_TICKET, ticket.estado) || "Cancelado"}
              </span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight">{ticket.titulo}</h1>
            <p className="text-sm text-gris">
              {propiedad?.nombre}
              {ticket.inquilinos?.nombre ? ` · reportó ${ticket.inquilinos.nombre}` : ""} · {formatoFechaHora(ticket.created_at)}
            </p>
          </div>
          <div className="flex min-w-52 flex-col gap-1 rounded-xl bg-white px-4 py-3">
            <span className="text-xs font-semibold text-gris">Dueño</span>
            <span className="font-bold">{dueno?.nombre ?? "Sin registrar"}</span>
            {ticket.quien_paga && <span className="text-xs text-gris">Paga: {etiqueta(QUIEN_PAGA, ticket.quien_paga)}</span>}
          </div>
        </header>

        {ticket.estado !== "cancelado" && <Avance estado={ticket.estado} />}

        <div className="flex flex-wrap items-start gap-5">
          {/* Evidencia */}
          <section aria-label="Evidencia" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-2xl bg-white p-5">
            <h2 className="font-bold">Evidencia</h2>
            {(media ?? []).length === 0 ? (
              <p className="text-sm text-gris">Sin fotos ni video.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {(media ?? []).map((m) => {
                  const src = url.get(m.storage_path as string);
                  return (
                    <li key={m.id as string} className="overflow-hidden rounded-xl bg-[#D8E3DE]">
                      {!src ? (
                        <span className="block p-4 text-xs text-gris">No disponible</span>
                      ) : m.tipo === "video" ? (
                        <video src={src} controls playsInline preload="metadata" className="h-36 w-full object-cover" />
                      ) : m.tipo === "foto" ? (
                        <a href={src} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="Foto del reporte" className="h-36 w-full object-cover" />
                        </a>
                      ) : (
                        <a href={src} target="_blank" rel="noreferrer" className="block p-4 text-sm font-semibold text-verde">
                          Abrir {m.tipo}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {ticket.descripcion && <p className="text-sm leading-relaxed">“{ticket.descripcion}”</p>}
            {ticket.disponibilidad?.length > 0 && (
              <p className="text-sm text-gris">
                Disponible: {ticket.disponibilidad.map((d) => etiqueta(DISPONIBILIDAD, d)).join(", ")}
              </p>
            )}
            <div className="flex flex-col gap-1 border-t border-borde-suave pt-3 text-sm">
              <span className="text-gris">Link de seguimiento para el inquilino</span>
              <a
                href={linkWhatsApp(ticket.inquilinos?.telefono, `Recibimos tu reporte. Aquí puedes ver el avance: ${base}/t/${ticket.token_publico}`)}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-verde"
              >
                Mandar por WhatsApp
              </a>
            </div>
          </section>

          {/* Cotizaciones */}
          <section aria-label="Cotizaciones" className="flex min-w-0 flex-[2.4_1_520px] flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl font-bold">Compara cotizaciones</h2>
              <span className="text-sm text-gris">Elige una y mándala al dueño</span>
            </div>

            {abierto && (
              <div className="flex flex-wrap items-start gap-3">
                <details className="group flex-[1_1_260px] rounded-2xl bg-white">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-bold text-verde-oscuro">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" /></svg>
                    Mandar a mi proveedor
                  </summary>
                  <form action={invitarProveedor} className="flex flex-col gap-3 px-4 pb-4">
                    <input type="hidden" name="ticket_id" value={ticket.id} />
                    <SelectorProveedor proveedores={misProveedores} />
                    <Boton enviando="Creando link…">Crear link de cotización</Boton>
                    <p className="text-xs text-gris">Recibe fotos y video; responde sin cuenta ni app.</p>
                  </form>
                </details>

                <details className="group flex-[1_1_260px] rounded-2xl bg-white">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-bold">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
                    Subir cotización
                  </summary>
                  <form action={subirCotizacion} className="flex flex-col gap-3 px-4 pb-4">
                    <input type="hidden" name="ticket_id" value={ticket.id} />
                    <SelectorProveedor proveedores={misProveedores} />
                    <div className="grid grid-cols-2 gap-2">
                      <Campo nombre="monto" etiqueta="Monto (MXN)" placeholder="$1,450" />
                      <Campo nombre="garantia_dias" etiqueta="Garantía (días)" placeholder="30" />
                    </div>
                    <Campo nombre="fecha" etiqueta="Puede ir" tipo="date" />
                    <label className="flex min-h-10 items-center gap-2 text-sm">
                      <input type="checkbox" name="incluye_materiales" className="size-5 accent-verde" /> Incluye materiales
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-semibold">
                      Archivo (PDF, foto o nota de voz · máx. 4 MB)
                      <InputComprimido name="archivo" accept="application/pdf,image/*,audio/*" className="text-sm font-normal" />
                    </label>
                    <Boton enviando="Subiendo…">Agregar a la comparación</Boton>
                  </form>
                </details>
              </div>
            )}

            {solicitudes.length > 0 && (
              <ul className="flex flex-col gap-2 rounded-2xl bg-white p-4">
                {solicitudes.map((s) => {
                  const p = s.proveedores;
                  const link = `${base}/c/${s.token}`;
                  const mensaje = `Hola ${p?.nombre ?? ""}, te comparto un trabajo de ${categoria.toLowerCase() || "mantenimiento"} en ${propiedad?.colonia || "Querétaro"}. Ve las fotos y el video y mándame tu cotización o agenda una visita aquí: ${link}`;
                  const estados: Record<string, string> = {
                    enviada: "Link creado",
                    vista: "Ya lo vio",
                    cotizada: "Cotizó",
                    visita_agendada: "Agendó visita",
                    descartada: "No es su especialidad",
                  };
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        <span className="font-bold">{p?.nombre}</span>
                        <span className="text-gris"> · {estados[s.estado] ?? s.estado}</span>
                      </span>
                      {abierto && (s.estado === "enviada" || s.estado === "vista") && (
                        <a
                          href={linkWhatsApp(p?.telefono, mensaje)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-h-10 items-center rounded-xl bg-verde px-3 font-bold text-white"
                        >
                          Abrir WhatsApp
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {cotizaciones.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-sm text-gris">
                Aún no hay cotizaciones. Manda el ticket a tus proveedores o sube una que ya tengas.
              </p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                {cotizaciones.map((c) => {
                  const p = c.proveedores;
                  const etiquetas = [
                    c.monto != null && c.monto === minMonto ? "Mejor precio" : null,
                    c.id === masPronto ? "Más rápido" : null,
                    c.id === mejorCalif ? "Mejor calificado" : null,
                  ].filter(Boolean) as string[];
                  const destacada = c.estado === "aprobada" || c.estado === "enviada_aprobacion";
                  const archivo = c.archivo_path ? url.get(c.archivo_path) : null;
                  return (
                    <li
                      key={c.id}
                      className={`flex flex-col gap-2 rounded-2xl bg-white p-4 ${destacada ? "ring-2 ring-verde" : ""}`}
                    >
                      <span className="font-bold">{p?.nombre ?? "Proveedor"}</span>
                      <span className="flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p?.es_red ? "bg-[#E8EEFB] text-[#2A4A93]" : "bg-tinta text-white"}`}>
                          {p?.es_red ? "Red Black Key" : "Tu proveedor"}
                        </span>
                        {etiquetas.map((e) => (
                          <span key={e} className="rounded-full bg-verde-claro px-2.5 py-0.5 text-xs font-bold text-verde-oscuro">
                            {e}
                          </span>
                        ))}
                      </span>
                      <span className="font-mono text-2xl">
                        {c.modo === "visita" ? "Visita para cotizar" : c.monto != null ? pesos.format(c.monto) : "Ver archivo"}
                      </span>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-borde-suave pt-2 text-sm">
                        <dt className="text-gris">{c.modo === "visita" ? "Visita" : "Puede ir"}</dt>
                        <dd className="text-right font-semibold">
                          {c.visita_at ? formatoFechaHora(c.visita_at) : c.fechas_disponibles?.length ? c.fechas_disponibles.map(formatoFecha).join(", ") : "—"}
                        </dd>
                        {c.garantia_dias != null && (
                          <>
                            <dt className="text-gris">Garantía</dt>
                            <dd className="text-right font-semibold">{c.garantia_dias} días</dd>
                          </>
                        )}
                        {c.incluye_materiales != null && c.modo === "remota" && (
                          <>
                            <dt className="text-gris">Materiales</dt>
                            <dd className="text-right font-semibold">{c.incluye_materiales ? "Incluidos" : "Aparte"}</dd>
                          </>
                        )}
                        <dt className="text-gris">Calificación</dt>
                        <dd className="text-right font-semibold">
                          {p?.calificacion != null ? `${p.calificacion} · ${p.trabajos} trabajos` : "Sin calificar"}
                        </dd>
                      </dl>
                      {c.notas && <p className="text-sm text-gris">{c.notas}</p>}
                      {archivo && (
                        <a href={archivo} target="_blank" rel="noreferrer" className="text-sm font-semibold text-verde">
                          Ver archivo{c.subida_por_admin ? " (subido por ti)" : ""}
                        </a>
                      )}
                      {abierto && ticket.estado !== "en_proceso" && c.modo === "remota" && c.estado !== "rechazada" && (
                        <details className="mt-1">
                          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-xl bg-tinta text-sm font-bold text-white">
                            Elegir esta
                          </summary>
                          <form className="mt-3 flex flex-col gap-2">
                            <input type="hidden" name="ticket_id" value={ticket.id} />
                            <input type="hidden" name="cotizacion_id" value={c.id} />
                            <label className="flex flex-col gap-1 text-sm font-semibold">
                              ¿Quién paga?
                              <select name="quien_paga" defaultValue={ticket.quien_paga ?? "dueno"} className="min-h-11 rounded-xl border border-borde bg-white px-3 font-normal">
                                {QUIEN_PAGA.map(([v, t]) => (
                                  <option key={v} value={v}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {!dueno && (
                              <>
                                <Campo nombre="dueno_nombre" etiqueta="Nombre del dueño" placeholder="Marta Ríos" />
                                <Campo nombre="dueno_telefono" etiqueta="WhatsApp del dueño" placeholder="442 123 4567" tipo="tel" />
                              </>
                            )}
                            <Boton formAction={enviarAlDueno} enviando="Creando link…">Mandar al dueño</Boton>
                            <Boton formAction={aprobarYo} estilo="claro" enviando="Aprobando…">Aprobar yo</Boton>
                          </form>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {elegida && ticket.estado === "aprobacion" && aprobacionVigente && (
              <AvisoAprobacion
                base={base}
                token={aprobacionVigente.token}
                dueno={dueno}
                propiedad={propiedad?.nombre ?? ""}
                titulo={ticket.titulo}
                proveedor={elegida.proveedores?.nombre ?? ""}
                monto={elegida.monto}
              />
            )}
            {aprobaciones.some((a) => a.decision === "rechazada") && ticket.estado === "cotizando" && (
              <p className="rounded-2xl bg-naranja-claro p-4 text-sm text-naranja-oscuro">
                El dueño rechazó la última propuesta
                {aprobaciones.find((a) => a.decision === "rechazada")?.comentario
                  ? `: “${aprobaciones.find((a) => a.decision === "rechazada")?.comentario}”`
                  : "."}
              </p>
            )}

            {ticket.estado === "en_proceso" && (
              <form action={marcarResuelto} className="flex flex-col gap-3 rounded-2xl bg-tinta p-5 text-white">
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <span className="font-bold">
                  Aprobado{elegida?.proveedores?.nombre ? ` · ${elegida.proveedores.nombre}` : ""}
                  {elegida?.monto != null ? ` · ${pesos.format(elegida.monto)}` : ""}
                </span>
                <fieldset className="flex flex-wrap items-center gap-2">
                  <legend className="mb-2 text-sm text-[#B9C8C1]">¿Cómo quedó el trabajo?</legend>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border border-[#3D4D47] px-3 text-sm font-bold has-checked:border-menta has-checked:bg-[#1E3B32]">
                      <input type="radio" name="calificacion" value={n} className="sr-only" defaultChecked={n === 5} />
                      {n}
                    </label>
                  ))}
                </fieldset>
                <label className="flex flex-col gap-1 text-sm text-[#B9C8C1]">
                  Fotos de cómo quedó (opcional, hasta 3) — el dueño las ve en su reporte
                  <InputComprimido
                    name="fotos_despues"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    multiple
                    className="text-sm text-white file:mr-3 file:min-h-10 file:rounded-xl file:border-0 file:bg-white/10 file:px-3 file:font-bold file:text-white"
                  />
                </label>
                <Boton estilo="menta" enviando="Cerrando…" className="self-start">
                  Marcar como resuelto
                </Boton>
              </form>
            )}

            {ticket.estado === "resuelto" && (
              <p className="rounded-2xl bg-verde-claro p-4 text-sm font-semibold text-verde-oscuro">
                Resuelto{ticket.calificacion ? ` · calificación ${ticket.calificacion} de 5` : ""}.
              </p>
            )}

            {abierto && (
              <form action={cancelarTicket} className="self-end">
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <Boton estilo="peligro" enviando="Cancelando…">
                  Cancelar ticket
                </Boton>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function AvisoAprobacion({
  base,
  token,
  dueno,
  propiedad,
  titulo,
  proveedor,
  monto,
}: {
  base: string;
  token: string;
  dueno: { nombre: string; telefono: string | null } | null;
  propiedad: string;
  titulo: string;
  proveedor: string;
  monto: number | null;
}) {
  const mensaje = `Hola ${dueno?.nombre ?? ""}, en ${propiedad}: ${titulo}. Te recomiendo la cotización de ${proveedor}${monto != null ? ` por ${pesos.format(monto)}` : ""}. Revisa las fotos y apruébala aquí: ${base}/a/${token}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-tinta p-5 text-white">
      <span className="flex flex-col">
        <span className="text-sm text-[#B9C8C1]">Esperando aprobación de</span>
        <span className="font-bold">{dueno?.nombre ?? "el dueño"}</span>
      </span>
      <a
        href={linkWhatsApp(dueno?.telefono, mensaje)}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-12 items-center rounded-xl bg-menta px-5 font-bold text-tinta"
      >
        Mandar por WhatsApp
      </a>
    </div>
  );
}

function SelectorProveedor({ proveedores }: { proveedores: { id: string; nombre: string }[] }) {
  return (
    <>
      {proveedores.length > 0 && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Proveedor
          <select name="proveedor_id" defaultValue="nuevo" className="min-h-11 rounded-xl border border-borde bg-white px-3 font-normal">
            <option value="nuevo">Uno nuevo…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Campo nombre="proveedor_nombre" etiqueta={proveedores.length ? "o nombre nuevo" : "Nombre"} placeholder="Raúl G. Plomería" />
        <Campo nombre="proveedor_telefono" etiqueta="WhatsApp" placeholder="442 123 4567" tipo="tel" />
      </div>
    </>
  );
}

function Campo({ nombre, etiqueta: texto, placeholder, tipo = "text" }: { nombre: string; etiqueta: string; placeholder?: string; tipo?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
      {texto}
      <input
        name={nombre}
        type={tipo}
        placeholder={placeholder}
        className="min-h-11 min-w-0 rounded-xl border border-borde px-3 font-normal outline-none focus:border-verde"
      />
    </label>
  );
}
