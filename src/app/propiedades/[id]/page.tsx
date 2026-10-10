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
import { guardarDueno } from "../actions";
import { Imprimir } from "./Imprimir";

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
    .select("id, nombre, direccion, colonia, tipo, renta_mensual, codigo_qr, duenos(id, nombre, telefono), contratos(activo, fin, inquilinos(id, nombre)), tickets(id, folio, titulo, estado, created_at)")
    .eq("id", id)
    .order("created_at", { referencedTable: "tickets", ascending: false })
    .maybeSingle();
  if (!data) notFound();
  const p = data as unknown as Propiedad;

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
          </div>
        </div>
      </main>
    </div>
  );
}
