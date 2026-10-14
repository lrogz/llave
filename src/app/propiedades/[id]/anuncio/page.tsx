import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { BotonCopiar } from "@/components/BotonCopiar";
import { InputComprimido } from "@/components/InputComprimido";
import { Cargando, Menu } from "@/components/Menu";
import { campo } from "@/components/Seguimiento";
import { descripcionSugerida, textoPortales, tituloAnuncio, type DatosAnuncio } from "@/lib/anuncio";
import { primerNombre } from "@/lib/crm";
import { BUCKET, formatoFecha, linkWhatsApp, origen, pesos } from "@/lib/util";
import { sesionConOrg } from "@/lib/sesion";
import { borrarFoto, estadoProspecto, guardarAnuncio, publicarAnuncio, subirFotos } from "./actions";

export const metadata: Metadata = { title: "Anuncio · Black Key" };

type Propiedad = DatosAnuncio & { id: string; anuncio_token: string; anuncio_publicado: boolean; anuncio_whatsapp: string | null; foto_path: string | null };
type Prospecto = { id: string; nombre: string; telefono: string; email: string | null; mensaje: string | null; mudanza: string | null; estado: string; created_at: string };

const ESTADOS = [
  ["nuevo", "Nuevo"],
  ["contactado", "Contactado"],
  ["visita", "Visita agendada"],
  ["descartado", "Descartado"],
  ["rentado", "Rentó"],
] as const;

export default function Anuncio({ params }: { params: Promise<{ id: string }> }) {
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
  const { data } = await supabase
    .from("propiedades")
    .select("id, nombre, tipo, colonia, ciudad, renta_mensual, recamaras, banos, m2, estacionamientos, amueblada, mascotas, descripcion_anuncio, requisitos, anuncio_token, anuncio_publicado, anuncio_whatsapp, foto_path")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as unknown as Propiedad;
  const [{ data: fs }, { data: pr }] = await Promise.all([
    supabase.from("fotos_propiedad").select("id, storage_path").eq("propiedad_id", p.id).order("created_at"),
    supabase.from("prospectos").select("id, nombre, telefono, email, mensaje, mudanza, estado, created_at").eq("propiedad_id", p.id).order("created_at", { ascending: false }),
  ]);
  const fotos = (fs ?? []) as { id: string; storage_path: string }[];
  const prospectos = (pr ?? []) as Prospecto[];
  const rutas = [p.foto_path, ...fotos.map((f) => f.storage_path)].filter((x): x is string => !!x);
  const { data: firmadas } = rutas.length ? await supabase.storage.from(BUCKET).createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  const link = `${await origen()}/v/${p.anuncio_token}`;
  const titulo = tituloAnuncio(p);

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Propiedades" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <Link href={`/propiedades/${p.id}`} className="text-sm font-semibold text-verde">
          ‹ {p.nombre}
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris">Anuncio para rentar</p>
            <h1 className="font-display text-4xl font-bold tracking-tight">{p.nombre}</h1>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${p.anuncio_publicado ? "bg-verde-claro text-verde-oscuro" : "bg-white text-gris"}`}>
            {p.anuncio_publicado ? "● Publicado" : "No publicado"}
          </span>
        </header>

        <section aria-label="Publicación" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
          <h2 className="font-bold">Publicar y compartir</h2>
          {p.anuncio_publicado ? (
            <>
              <p className="text-sm text-gris">Cualquiera con el link ve fotos, precio y características (sin la dirección exacta) y puede dejar sus datos.</p>
              <p className="rounded-xl bg-fondo px-3 py-2 font-mono text-sm break-all">{link}</p>
              <div className="flex flex-wrap gap-2">
                <a href={link} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-xl border border-borde px-4 text-sm font-bold">
                  Ver anuncio
                </a>
                <BotonCopiar texto={link} etiqueta="Copiar link" />
                <a href={linkWhatsApp(null, `${titulo}. ${p.renta_mensual ? `${pesos.format(Number(p.renta_mensual))} al mes. ` : ""}Fotos e informes: ${link}`)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-xl bg-verde px-4 text-sm font-bold text-white">
                  Compartir por WhatsApp
                </a>
                <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-xl border border-borde px-4 text-sm font-bold">
                  Compartir en Facebook
                </a>
                <BotonCopiar texto={textoPortales(p, link)} etiqueta="Copiar texto para portales" />
              </div>
              <p className="text-xs text-gris">&quot;Copiar texto para portales&quot; te da título, precio, características, descripción y link listos para pegar en Inmuebles24, EasyBroker, Lamudi o Marketplace.</p>
              <form action={publicarAnuncio}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="publicar" value="no" />
                <Boton estilo="peligro" enviando="Pausando…">
                  Pausar anuncio
                </Boton>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-gris">
                {fotos.length || p.foto_path ? "Revisa los datos y publícalo: te damos un link para compartir." : "Agrega fotos y datos abajo; luego publícalo y te damos un link para compartir."}
              </p>
              {p.renta_mensual ? (
                <form action={publicarAnuncio}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="publicar" value="si" />
                  <Boton enviando="Publicando…">Publicar anuncio</Boton>
                </form>
              ) : (
                <p className="rounded-xl bg-[#FFF4E0] p-3 text-sm text-[#7A4E00]">Pon la renta mensual en los datos del anuncio para poder publicarlo.</p>
              )}
            </>
          )}
        </section>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-5">
            <section aria-label="Datos del anuncio" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Datos del anuncio</h2>
              <form action={guardarAnuncio} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={p.id} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Campo etiqueta="Renta mensual" name="renta" valor={p.renta_mensual} placeholder="$18,000" />
                  <Campo etiqueta="Recámaras" name="recamaras" valor={p.recamaras} placeholder="3" />
                  <Campo etiqueta="Baños" name="banos" valor={p.banos} placeholder="2.5" />
                  <Campo etiqueta="m² de construcción" name="m2" valor={p.m2} placeholder="160" />
                  <Campo etiqueta="Estacionamientos" name="estacionamientos" valor={p.estacionamientos} placeholder="2" />
                  <Campo etiqueta="WhatsApp para informes" name="whatsapp" valor={p.anuncio_whatsapp} placeholder="442 123 4567" />
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="amueblada" defaultChecked={p.amueblada} className="size-4 accent-verde" /> Amueblada
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="mascotas" defaultChecked={p.mascotas} className="size-4 accent-verde" /> Acepta mascotas
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Descripción
                  <textarea name="descripcion" rows={5} maxLength={3000} defaultValue={p.descripcion_anuncio ?? ""} placeholder={descripcionSugerida(p)} className={`${campo} py-2 font-normal`} />
                  <span className="text-xs font-normal text-gris">Si la dejas vacía usamos: “{descripcionSugerida(p)}”</span>
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Requisitos
                  <textarea name="requisitos" rows={2} maxLength={1000} defaultValue={p.requisitos ?? ""} placeholder="Depósito de 1 mes, aval o póliza jurídica, comprobante de ingresos" className={`${campo} py-2 font-normal`} />
                </label>
                <Boton className="self-start">Guardar datos</Boton>
              </form>
            </section>

            <section aria-label="Fotos del anuncio" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Fotos ({fotos.length + (p.foto_path ? 1 : 0)})</h2>
              <p className="text-sm text-gris">La foto de portada de la propiedad va primero. Agrega fachada, sala, cocina, recámaras y baños con buena luz.</p>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                {p.foto_path && url.get(p.foto_path) && (
                  <li className="relative overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada */}
                    <img src={url.get(p.foto_path)!} alt="Portada" className="aspect-[4/3] w-full object-cover" />
                    <span className="absolute top-1.5 left-1.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold">Portada</span>
                  </li>
                )}
                {fotos.map((f) => (
                  <li key={f.id} className="relative overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada */}
                    <img src={url.get(f.storage_path) ?? ""} alt="" className="aspect-[4/3] w-full object-cover" />
                    <form action={borrarFoto} className="absolute top-1.5 right-1.5">
                      <input type="hidden" name="foto_id" value={f.id} />
                      <button type="submit" aria-label="Quitar foto" className="flex size-8 items-center justify-center rounded-full bg-white/90 text-sm font-bold shadow">
                        ✕
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={subirFotos} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <InputComprimido name="fotos" accept="image/jpeg,image/png,image/webp,image/heic" multiple required className="max-w-full text-sm" />
                <Boton estilo="claro" enviando="Subiendo…">
                  Subir fotos
                </Boton>
              </form>
            </section>
          </div>

          <section aria-label="Prospectos" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-2xl bg-white p-5">
            <h2 className="font-bold">Prospectos ({prospectos.length})</h2>
            {prospectos.length === 0 ? (
              <p className="text-sm text-gris">Quien pida informes en el anuncio aparece aquí y te avisamos por correo.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-borde-suave text-sm">
                {prospectos.map((x) => (
                  <li key={x.id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <span>
                        <span className="block font-semibold">{x.nombre}</span>
                        <span className="text-xs text-gris">
                          {x.telefono}
                          {x.email ? ` · ${x.email}` : ""} · {formatoFecha(x.created_at)}
                          {x.mudanza ? ` · se muda el ${formatoFecha(x.mudanza)}` : ""}
                        </span>
                      </span>
                      {x.estado === "nuevo" && <span className="rounded-full bg-naranja px-2 py-0.5 text-[11px] font-bold text-white">Nuevo</span>}
                    </div>
                    {x.mensaje && <p className="rounded-lg bg-fondo px-3 py-2 text-gris">“{x.mensaje}”</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={linkWhatsApp(x.telefono, `Hola ${primerNombre(x.nombre)}, te escribo por tu interés en ${titulo}. ¿Cuándo te gustaría verla?`)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-10 items-center rounded-xl bg-verde px-3 text-xs font-bold text-white"
                      >
                        WhatsApp
                      </a>
                      <form action={estadoProspecto} className="flex gap-1">
                        <input type="hidden" name="prospecto_id" value={x.id} />
                        <select name="estado" defaultValue={x.estado} aria-label={`Estado de ${x.nombre}`} className="min-h-10 rounded-xl border border-borde bg-white px-2 text-xs">
                          {ESTADOS.map(([v, t]) => (
                            <option key={v} value={v}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <Boton estilo="claro" enviando="…" className="min-h-10 px-3 text-xs">
                          Guardar
                        </Boton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Campo({ etiqueta, name, valor, placeholder }: { etiqueta: string; name: string; valor: number | string | null; placeholder: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {etiqueta}
      <input name={name} inputMode={name === "whatsapp" ? "tel" : "decimal"} defaultValue={valor != null ? String(Number(valor) || valor) : ""} placeholder={placeholder} className={`${campo} font-normal`} />
    </label>
  );
}
