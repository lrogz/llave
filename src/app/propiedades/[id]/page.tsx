import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import QRCode from "qrcode";
import { Boton } from "@/components/Boton";
import { Logo } from "@/components/Logo";
import { Cargando, Menu } from "@/components/Menu";
import { sesion } from "@/lib/sesion";
import { COLOR_ESTADO, ESTADOS_TICKET, etiqueta, formatoFecha, origen, pesos } from "@/lib/util";
import { borrarPropiedad, editarPropiedad, guardarDueno } from "../actions";
import { campo, Etiqueta } from "@/components/Seguimiento";
import { Imprimir } from "./Imprimir";
import { SeccionDocumentos } from "@/components/Documentos";
import { SeccionServicios } from "@/components/Servicios";

const TIPOS_PROP = [
  ["casa", "Casa"],
  ["departamento", "Departamento"],
  ["local", "Local"],
  ["oficina", "Oficina"],
  ["unidad_condominio", "Unidad en condominio"],
  ["otro", "Otro"],
] as const;

export const metadata: Metadata = { title: "Propiedad · Black Key" };

type Propiedad = {
  id: string;
  nombre: string;
  direccion: string | null;
  colonia: string | null;
  tipo: string;
  renta_mensual: number | null;
  codigo_qr: string;
  duenos: { id: string; nombre: string; telefono: string | null } | null;
  ciudad: string | null;
  estado: string;
  notas: string | null;
  contratos: { activo: boolean; fin: string; inquilinos: { id: string; nombre: string } | null }[];
  tickets: { id: string; folio: number; titulo: string; estado: string; created_at: string }[];
};

export default function FichaPropiedad({ params }: { params: Promise<{ id: string }> }) {
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

  const { data } = await supabase
    .from("propiedades")
    .select("id, nombre, direccion, colonia, tipo, renta_mensual, codigo_qr, ciudad, estado, notas, duenos(id, nombre, telefono), contratos(activo, fin, inquilinos(id, nombre)), tickets(id, folio, titulo, estado, created_at)")
    .eq("id", id)
    .order("created_at", { referencedTable: "tickets", ascending: false })
    .maybeSingle();
  if (!data) notFound();
  const p = data as unknown as Propiedad;
  const { data: listaDuenos } = await supabase.from("duenos").select("id, nombre").order("nombre");
  const duenos = (listaDuenos ?? []) as { id: string; nombre: string }[];

  const linkReporte = `${await origen()}/r/${p.codigo_qr}`;
  const qr = await QRCode.toString(linkReporte, { type: "svg", margin: 1, color: { dark: "#14201C", light: "#FFFFFF" } });

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <div className="contents print:hidden">
        <Menu activo="Propiedades" nombreOrg={org.nombre} />
      </div>
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-7 sm:px-10 print:p-0">
        <Link href="/" className="text-sm font-semibold text-verde print:hidden">
          ‹ Propiedades
        </Link>
        <header className="print:hidden">
          <p className="text-sm text-gris capitalize">{p.tipo.replace("_", " ")}</p>
          <h1 className="font-display text-4xl font-bold tracking-tight">{p.nombre}</h1>
          {(p.direccion || p.colonia) && <p className="text-sm text-gris">{[p.direccion, p.colonia].filter(Boolean).join(", ")}</p>}
        </header>

        <div className="flex flex-wrap items-start gap-5">
          {/* Cartel con QR: se imprime y se pega en la cocina o junto al medidor */}
          <section
            aria-label="Código QR para reportar"
            className="flex flex-[1_1_300px] flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center print:fixed print:inset-0 print:justify-center print:rounded-none"
          >
            <Logo />
            <h2 className="font-display text-2xl font-bold">¿Algo no funciona en la casa?</h2>
            <p className="text-sm text-gris print:text-base">Escanea con la cámara de tu celular, toma una foto o video y listo.</p>
            <div className="w-56 print:w-80" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="text-xs text-gris">{p.nombre}</p>
            <div className="flex flex-wrap justify-center gap-2 print:hidden">
              <Imprimir />
              <a href={linkReporte} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-xl border border-borde px-4 text-sm font-bold">
                Levantar reporte yo
              </a>
            </div>
          </section>

          <div className="flex flex-[1.4_1_340px] flex-col gap-5 print:hidden">
            <section aria-label="Dueño" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Dueño</h2>
              {p.duenos ? (
                <p className="text-sm">
                  <Link href={`/personas/duenos/${p.duenos.id}`} className="font-semibold text-verde hover:underline">
                    {p.duenos.nombre}
                  </Link>
                  {p.duenos.telefono ? <span className="text-gris"> · {p.duenos.telefono}</span> : null}
                </p>
              ) : (
                <form action={guardarDueno} className="flex flex-col gap-2">
                  <input type="hidden" name="propiedad_id" value={p.id} />
                  <div className="grid grid-cols-2 gap-2">
                    <input name="nombre" required placeholder="Nombre" className="min-h-11 min-w-0 rounded-xl border border-borde px-3 text-sm outline-none focus:border-verde" aria-label="Nombre del dueño" />
                    <input name="telefono" type="tel" placeholder="WhatsApp" className="min-h-11 min-w-0 rounded-xl border border-borde px-3 text-sm outline-none focus:border-verde" aria-label="WhatsApp del dueño" />
                  </div>
                  <Boton className="self-start">Guardar dueño</Boton>
                </form>
              )}
              {(() => {
                const c = p.contratos.find((x) => x.activo);
                return (
                  <p className="border-t border-borde-suave pt-3 text-sm">
                    <span className="text-gris">Inquilino: </span>
                    {c?.inquilinos ? (
                      <>
                        <Link href={`/personas/inquilinos/${c.inquilinos.id}`} className="font-semibold text-verde hover:underline">
                          {c.inquilinos.nombre}
                        </Link>
                        <span className="text-gris"> · hasta {formatoFecha(c.fin)}</span>
                      </>
                    ) : (
                      <Link href="/personas?ver=inquilinos" className="font-semibold text-verde hover:underline">
                        Agregar inquilino
                      </Link>
                    )}
                  </p>
                );
              })()}
              {p.renta_mensual != null && (
                <p className="border-t border-borde-suave pt-3 text-sm">
                  Renta <span className="font-mono">{pesos.format(p.renta_mensual)}</span>
                </p>
              )}
            </section>

            <section aria-label="Editar propiedad" className="rounded-2xl bg-white p-5">
              <details>
                <summary className="cursor-pointer font-bold">Editar datos de la propiedad</summary>
                <form action={editarPropiedad} className="mt-3 grid grid-cols-2 gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="col-span-2">
                    <Etiqueta texto="Nombre">
                      <input name="nombre" required defaultValue={p.nombre} className={campo} />
                    </Etiqueta>
                  </div>
                  <div className="col-span-2">
                    <Etiqueta texto="Calle y número">
                      <input name="direccion" defaultValue={p.direccion ?? ""} className={campo} />
                    </Etiqueta>
                  </div>
                  <Etiqueta texto="Colonia">
                    <input name="colonia" defaultValue={p.colonia ?? ""} className={campo} />
                  </Etiqueta>
                  <Etiqueta texto="Ciudad">
                    <input name="ciudad" defaultValue={p.ciudad ?? ""} className={campo} />
                  </Etiqueta>
                  <Etiqueta texto="Tipo">
                    <select name="tipo" defaultValue={p.tipo} className={campo}>
                      {TIPOS_PROP.map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Etiqueta>
                  <Etiqueta texto="Estado">
                    <select name="estado" defaultValue={p.estado} className={campo}>
                      <option value="rentada">Rentada</option>
                      <option value="vacia">Vacía</option>
                      <option value="en_mantenimiento">En mantenimiento</option>
                    </select>
                  </Etiqueta>
                  <Etiqueta texto="Renta mensual">
                    <input name="renta" inputMode="decimal" defaultValue={p.renta_mensual ?? ""} className={campo} />
                  </Etiqueta>
                  <Etiqueta texto="Dueño">
                    <select name="dueno_id" defaultValue={p.duenos?.id ?? ""} className={campo}>
                      <option value="">Sin dueño</option>
                      {duenos.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nombre}
                        </option>
                      ))}
                    </select>
                  </Etiqueta>
                  <div className="col-span-2">
                    <Etiqueta texto="Notas">
                      <textarea name="notas" rows={2} defaultValue={p.notas ?? ""} className={`${campo} py-2`} />
                    </Etiqueta>
                  </div>
                  <Boton className="col-span-2 justify-self-start" enviando="Guardando…">
                    Guardar cambios
                  </Boton>
                </form>
                <details className="mt-5 border-t border-borde-suave pt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-naranja-oscuro">Borrar propiedad</summary>
                  <form action={borrarPropiedad} className="mt-2 flex flex-col gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <p className="text-sm text-gris">Se borran también sus tickets, contratos, cobros, servicios y documentos. No se puede deshacer.</p>
                    <input name="confirmar" required pattern={p.nombre.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")} title="Escribe el nombre exacto de la propiedad" placeholder={`Escribe: ${p.nombre}`} aria-label="Escribe el nombre para confirmar" className={campo} />
                    <Boton estilo="peligro" enviando="Borrando…" className="self-start">
                      Borrar para siempre
                    </Boton>
                  </form>
                </details>
              </details>
            </section>

            <section aria-label="Tickets de esta propiedad" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Tickets</h2>
              {p.tickets.length === 0 ? (
                <p className="text-sm text-gris">Sin reportes todavía.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {p.tickets.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tickets/${t.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 text-sm hover:bg-fondo">
                        <span className="truncate">
                          <span className="font-semibold">{t.titulo}</span>
                          <span className="text-gris"> · {formatoFecha(t.created_at)}</span>
                        </span>
                        <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-bold ${COLOR_ESTADO[t.estado] ?? ""}`}>
                          {etiqueta(ESTADOS_TICKET, t.estado) || "Cancelado"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <SeccionServicios db={supabase} propiedadId={p.id} />
            <SeccionDocumentos db={supabase} ctx={{ propiedad_id: p.id }} volver={`/propiedades/${p.id}`} tipoSugerido="escrituras" />
          </div>
        </div>
      </main>
    </div>
  );
}
