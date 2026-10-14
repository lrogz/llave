import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { BotonCopiar } from "@/components/BotonCopiar";
import { BotonImprimir } from "@/components/BotonImprimir";
import { Estado, Firma, Fotos, Previa, VistaInspeccion } from "@/components/Inspeccion";
import { InputComprimido } from "@/components/InputComprimido";
import { Cargando, Menu } from "@/components/Menu";
import { campo } from "@/components/Seguimiento";
import { primerNombre } from "@/lib/crm";
import { formatoFecha, linkWhatsApp, origen } from "@/lib/util";
import { ESTADOS_PARTIDA, etiquetaTipo } from "@/lib/inspeccion";
import { cargarInspeccion } from "@/lib/inspeccion-datos";
import { sesionConOrg } from "@/lib/sesion";
import { agregarCuarto, borrarFotoInspeccion, borrarInspeccion, guardarInspeccion, quitarCuarto, subirFotosCuarto } from "../actions";

export const metadata: Metadata = { title: "Entrega de la casa · Black Key" };

export default function PaginaInspeccion({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, org } = await sesionConOrg();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const i = await cargarInspeccion(supabase, { id });
  if (!i) notFound();
  const link = `${await origen()}/i/${i.token}`;
  const revisados = i.partidas.filter((p) => p.estado).length;
  const mensaje = `Hola ${primerNombre(i.inquilino?.nombre ?? "")}, te comparto la ${i.tipo === "salida" ? "recepción" : "entrega"} de ${i.propiedad.nombre} cuarto por cuarto, con fotos. Revísala y fírmala aquí: ${link}`;

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <div className="contents print:hidden">
        <Menu activo="Propiedades" nombreOrg={org.nombre} />
      </div>
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10 print:p-0">
        <Link href={`/propiedades/${i.propiedad_id}`} className="text-sm font-semibold text-verde print:hidden">
          ‹ {i.propiedad.nombre}
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris">
              {i.org} · {formatoFecha(i.fecha)}
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight">{etiquetaTipo(i.tipo)}</h1>
            <p className="text-gris">
              {i.propiedad.nombre}
              {i.inquilino ? ` · ${i.inquilino.nombre}` : ""}
            </p>
          </div>
          {i.firmada_at ? (
            <span className="rounded-full bg-verde-claro px-3 py-1 text-sm font-bold text-verde-oscuro">✓ Firmada</span>
          ) : (
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-gris">
              {revisados} de {i.partidas.length} revisados
            </span>
          )}
        </header>

        {i.firmada_at ? (
          <>
            <div className="flex flex-wrap gap-2 print:hidden">
              <BotonImprimir />
            </div>
            <VistaInspeccion i={i} />
            <Firma i={i} />
          </>
        ) : (
          <>
            <section aria-label="Firma del inquilino" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Mándasela al inquilino para firmar</h2>
              <p className="text-sm text-gris">Al terminar de revisar, mándale el link: ve cada cuarto con fotos, puede dejar observaciones y firma desde su celular. Ya firmada, nadie puede cambiarla.</p>
              <div className="flex flex-wrap gap-2">
                <a href={linkWhatsApp(i.inquilino?.telefono, mensaje)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-xl bg-verde px-4 text-sm font-bold text-white">
                  Mandar por WhatsApp
                </a>
                <BotonCopiar texto={link} etiqueta="Copiar link" />
                <a href={link} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-xl border border-borde px-4 text-sm font-bold">
                  Firmar aquí en persona
                </a>
              </div>
            </section>

            <form id="principal" action={guardarInspeccion} />
            <input type="hidden" name="id" value={i.id} form="principal" />
            <section aria-label="Datos generales" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Fecha
                  <input type="date" name="fecha" defaultValue={i.fecha} form="principal" className={`${campo} font-normal`} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Medidor de luz
                  <input name="luz" defaultValue={i.lecturas.luz ?? ""} form="principal" placeholder="Lectura" className={`${campo} font-normal`} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Medidor de agua
                  <input name="agua" defaultValue={i.lecturas.agua ?? ""} form="principal" placeholder="Lectura" className={`${campo} font-normal`} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Gas
                  <input name="gas" defaultValue={i.lecturas.gas ?? ""} form="principal" placeholder="% del tanque o lectura" className={`${campo} font-normal`} />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Llaves y controles entregados
                <input name="llaves" defaultValue={i.lecturas.llaves ?? ""} form="principal" placeholder="3 llaves de la puerta, 1 control del portón, 1 tarjeta de acceso" className={`${campo} font-normal`} />
              </label>
            </section>

            <ul aria-label="Cuartos" className="flex flex-col gap-3">
              {i.partidas.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 rounded-2xl bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-bold">{p.cuarto}</h2>
                    <Estado estado={p.estado} />
                  </div>
                  <fieldset className="flex flex-wrap gap-2">
                    <legend className="sr-only">Estado de {p.cuarto}</legend>
                    {ESTADOS_PARTIDA.map(([v, t]) => (
                      <label key={v} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-borde px-3 text-sm has-checked:border-verde has-checked:bg-verde-claro has-checked:font-bold">
                        <input type="radio" name={`estado_${p.id}`} value={v} defaultChecked={p.estado === v} form="principal" className="accent-verde" aria-label={`${p.cuarto}: ${t}`} />
                        {t}
                      </label>
                    ))}
                  </fieldset>
                  <textarea name={`nota_${p.id}`} defaultValue={p.nota} form="principal" rows={2} maxLength={1000} placeholder="Detalles: rayones, manchas, focos fundidos, qué muebles hay…" aria-label={`Notas de ${p.cuarto}`} className={`${campo} py-2`} />
                  <Fotos fotos={i.fotos[p.id] ?? []} />
                  {(i.fotos[p.id] ?? []).length > 0 && (
                    <details className="text-xs text-gris">
                      <summary className="cursor-pointer">Quitar fotos</summary>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(i.fotos[p.id] ?? []).map((f, n) => (
                          <form key={f.id} action={borrarFotoInspeccion}>
                            <input type="hidden" name="foto_id" value={f.id} />
                            <button type="submit" className="min-h-9 rounded-lg border border-borde px-2">
                              Quitar foto {n + 1}
                            </button>
                          </form>
                        ))}
                      </div>
                    </details>
                  )}
                  <form action={subirFotosCuarto} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="partida" value={p.id} />
                    <InputComprimido name="fotos" accept="image/jpeg,image/png,image/webp,image/heic" multiple required className="max-w-full text-sm" />
                    <Boton estilo="claro" enviando="Subiendo…">
                      Subir fotos de {p.cuarto.toLowerCase()}
                    </Boton>
                  </form>
                  <Previa previa={i.previa} partida={p} />
                  <form action={quitarCuarto} className="self-end">
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="partida" value={p.id} />
                    <button type="submit" className="text-xs text-gris underline">
                      Quitar este cuarto
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            <section aria-label="Agregar cuarto" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <form action={agregarCuarto} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={i.id} />
                <input name="cuarto" required maxLength={60} placeholder="Estudio, terraza, cuarto de servicio…" aria-label="Nombre del cuarto" className={`${campo} flex-1`} />
                <Boton estilo="claro">Agregar cuarto</Boton>
              </form>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Notas generales
                <textarea name="notas" defaultValue={i.notas ?? ""} form="principal" rows={2} maxLength={2000} className={`${campo} py-2 font-normal`} />
              </label>
            </section>

            <div className="sticky bottom-20 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-tinta p-3 shadow-xl md:bottom-4">
              <span className="px-2 text-sm text-white/80">Guarda antes de mandar a firmar.</span>
              <button type="submit" form="principal" className="min-h-11 rounded-xl bg-menta px-5 text-sm font-bold text-tinta">
                Guardar cambios
              </button>
            </div>

            <form action={borrarInspeccion} className="self-start">
              <input type="hidden" name="id" value={i.id} />
              <Boton estilo="peligro" enviando="Borrando…">
                Borrar esta entrega
              </Boton>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
