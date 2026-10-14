import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { BotonCopiar } from "@/components/BotonCopiar";
import { BotonImprimir } from "@/components/BotonImprimir";
import { HojaFirmas, TextoContrato } from "@/components/ContratoFirmado";
import { Cargando, Menu } from "@/components/Menu";
import { campo } from "@/components/Seguimiento";
import { ROL, cargarContrato } from "@/lib/contrato-datos";
import { primerNombre } from "@/lib/crm";
import { formatoFechaHora, linkWhatsApp, origen } from "@/lib/util";
import { sesionConOrg } from "@/lib/sesion";
import { guardarTexto, mandarAFirmar, regresarABorrador } from "../actions";

export const metadata: Metadata = { title: "Contrato · Black Key" };

export default function PaginaContrato({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, org, user } = await sesionConOrg();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await cargarContrato(supabase, id);
  if (!d) notFound();
  const base = await origen();
  const { data: dueno } = await supabase.from("documentos_contrato").select("contratos(propiedades(duenos(nombre)))").eq("id", d.id).single();
  const nombreDueno = (dueno as unknown as { contratos: { propiedades: { duenos: { nombre: string } | null } | null } | null })?.contratos?.propiedades?.duenos?.nombre;
  const firmadas = d.firmantes.filter((f) => f.firmada_at).length;
  const { data: aval } = d.inquilino ? await supabase.from("inquilinos").select("aval_nombre, aval_telefono").eq("id", d.inquilino.id).maybeSingle() : { data: null };

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <div className="contents print:hidden">
        <Menu activo="Personas" nombreOrg={org.nombre} />
      </div>
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10 print:p-0">
        {d.inquilino && (
          <Link href={`/personas/inquilinos/${d.inquilino.id}`} className="text-sm font-semibold text-verde print:hidden">
            ‹ {d.inquilino.nombre}
          </Link>
        )}
        <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
          <div>
            <p className="text-sm font-semibold text-gris">
              {d.propiedad} · {d.inquilino?.nombre}
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight">Contrato de arrendamiento</h1>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${d.estado === "firmado" ? "bg-verde-claro text-verde-oscuro" : d.estado === "enviado" ? "bg-[#FFF4E0] text-[#7A4E00]" : "bg-white text-gris"}`}>
            {d.estado === "firmado" ? "✓ Firmado por todos" : d.estado === "enviado" ? `Firmas: ${firmadas} de ${d.firmantes.length}` : "Borrador"}
          </span>
        </header>

        {d.estado === "borrador" ? (
          <>
            <p className="rounded-2xl bg-[#FFF4E0] p-4 text-sm text-[#7A4E00] print:hidden">
              Es un modelo general llenado con los datos del contrato. Revísalo (y de preferencia con tu abogado) y ajusta lo que necesites antes de mandarlo a firmar. Después de la primera firma ya no se puede cambiar.
            </p>
            <form action={guardarTexto} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={d.id} />
              <textarea name="contenido" defaultValue={d.contenido} rows={28} aria-label="Texto del contrato" className={`${campo} py-3 font-serif text-[15px] leading-relaxed`} />
              <Boton estilo="claro" className="self-start">
                Guardar texto
              </Boton>
            </form>
            <section aria-label="Mandar a firmar" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">¿Quién firma?</h2>
              <form action={mandarAFirmar} className="flex flex-col gap-3 text-sm">
                <input type="hidden" name="id" value={d.id} />
                <p>✓ {d.inquilino?.nombre} (arrendatario)</p>
                {nombreDueno && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="con_dueno" defaultChecked className="size-4 accent-verde" /> {nombreDueno} (arrendador / dueño)
                  </label>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <input name="fiador" defaultValue={aval?.aval_nombre ?? ""} maxLength={120} placeholder="Fiador / aval (opcional)" aria-label="Nombre del fiador" className={campo} />
                  <input name="fiador_tel" defaultValue={aval?.aval_telefono ?? ""} type="tel" maxLength={30} placeholder="WhatsApp del fiador" aria-label="WhatsApp del fiador" className={campo} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="con_admin" className="size-4 accent-verde" /> Firmo yo también como administradora:
                  </label>
                  <input name="admin_nombre" maxLength={120} placeholder="Tu nombre completo" defaultValue={user.email?.split("@")[0] ?? ""} aria-label="Tu nombre" className={`${campo} flex-1`} />
                </div>
                <Boton className="self-start">Mandar a firmar</Boton>
              </form>
            </section>
          </>
        ) : (
          <>
            <section aria-label="Firmantes" className="flex flex-col gap-3 rounded-2xl bg-white p-5 print:hidden">
              <h2 className="font-bold">{d.estado === "firmado" ? "Firmado" : "Links para firmar"}</h2>
              <ul className="flex flex-col divide-y divide-borde-suave text-sm">
                {d.firmantes.map((f) => {
                  const link = `${base}/f/${f.token}`;
                  return (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <span>
                        <span className="block font-semibold">{f.nombre}</span>
                        <span className="text-xs text-gris">
                          {ROL[f.rol]} · {f.firmada_at ? `✓ firmó el ${formatoFechaHora(f.firmada_at)}` : "pendiente"}
                        </span>
                      </span>
                      {!f.firmada_at && (
                        <span className="flex flex-wrap gap-2">
                          <a
                            href={linkWhatsApp(f.telefono, `Hola ${primerNombre(f.nombre)}, te comparto el contrato de arrendamiento de ${d.propiedad} para que lo leas y lo firmes desde tu celular: ${link}`)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex min-h-10 items-center rounded-xl bg-verde px-3 text-xs font-bold text-white"
                          >
                            Mandar por WhatsApp
                          </a>
                          <BotonCopiar texto={link} etiqueta="Copiar link" className="min-h-10 px-3 text-xs" />
                          <a href={link} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded-xl border border-borde px-3 text-xs font-bold">
                            Firmar aquí
                          </a>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <BotonImprimir />
                {firmadas === 0 && (
                  <form action={regresarABorrador}>
                    <input type="hidden" name="id" value={d.id} />
                    <Boton estilo="claro" enviando="…">
                      Regresar a borrador para corregir
                    </Boton>
                  </form>
                )}
              </div>
            </section>
            <TextoContrato texto={d.contenido} />
            <HojaFirmas d={d} />
          </>
        )}
      </main>
    </div>
  );
}
