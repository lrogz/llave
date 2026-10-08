import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, CATEGORIAS, QUIEN_PAGA, etiqueta, formatoFecha, formatoFechaHora, pesos } from "@/lib/datos";
import { DecisionForm } from "./DecisionForm";

export const metadata: Metadata = { title: "Aprobar cotización · Llave" };

export default function AprobacionDueno({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">
      <Logo />
      <Suspense fallback={<p className="text-sm text-gris">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

type Datos = {
  id: string;
  decision: string | null;
  comentario: string | null;
  duenos: { nombre: string } | null;
  organizaciones: { nombre: string } | null;
  cotizaciones: {
    id: string;
    ticket_id: string;
    monto: number | null;
    incluye_materiales: boolean | null;
    garantia_dias: number | null;
    fechas_disponibles: string[];
    visita_at: string | null;
    notas: string | null;
    archivo_path: string | null;
    proveedores: { nombre: string; calificacion: number | null; trabajos: number } | null;
    tickets: {
      titulo: string;
      descripcion: string | null;
      categoria: string | null;
      quien_paga: string | null;
      folio: number;
      propiedades: { nombre: string } | null;
    } | null;
  } | null;
};

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("aprobaciones")
    .select(
      "id, decision, comentario, duenos(nombre), organizaciones(nombre), cotizaciones(id, ticket_id, monto, incluye_materiales, garantia_dias, fechas_disponibles, visita_at, notas, archivo_path, proveedores(nombre, calificacion, trabajos), tickets(titulo, descripcion, categoria, quien_paga, folio, propiedades(nombre)))",
    )
    .eq("token", token)
    .maybeSingle();

  const ap = data as unknown as Datos | null;
  const cot = ap?.cotizaciones;
  const ticket = cot?.tickets;
  if (!ap || !cot || !ticket) return <p className="rounded-2xl bg-white p-6 text-sm">Este link ya no es válido.</p>;

  const [{ data: media }, { count: comparadas }] = await Promise.all([
    admin.from("ticket_media").select("id, tipo, storage_path").eq("ticket_id", cot.ticket_id).eq("momento", "reporte").order("created_at"),
    admin.from("cotizaciones").select("id", { count: "exact", head: true }).eq("ticket_id", cot.ticket_id).eq("modo", "remota"),
  ]);
  const rutas = [...(media ?? []).map((m) => m.storage_path as string), ...(cot.archivo_path ? [cot.archivo_path] : [])];
  const { data: firmadas } = rutas.length ? await admin.storage.from(BUCKET).createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  const fecha = cot.visita_at ? formatoFechaHora(cot.visita_at) : (cot.fechas_disponibles ?? []).map(formatoFecha).join(", ");

  return (
    <>
      <header>
        <p className="text-sm text-gris">
          {ticket.propiedades?.nombre} · {ap.organizaciones?.nombre}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {ap.duenos?.nombre ? `${ap.duenos.nombre.split(" ")[0]}, ` : ""}¿apruebas este trabajo?
        </h1>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-5">
        <span className="text-xs font-bold tracking-widest text-gris uppercase">
          {etiqueta(CATEGORIAS, ticket.categoria)} · #{ticket.folio}
        </span>
        <h2 className="text-lg font-bold">{ticket.titulo}</h2>
        {media && media.length > 0 && (
          <ul className="grid grid-cols-2 gap-2">
            {media.map((m) => {
              const src = url.get(m.storage_path as string);
              if (!src) return null;
              return (
                <li key={m.id as string} className="overflow-hidden rounded-xl bg-[#D8E3DE]">
                  {m.tipo === "video" ? (
                    <video src={src} controls playsInline preload="metadata" className="h-36 w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="Foto del problema" className="h-36 w-full object-cover" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 ring-2 ring-verde">
        <span className="text-sm text-gris">
          Cotización recomendada{comparadas && comparadas > 1 ? ` (de ${comparadas} comparadas)` : ""}
        </span>
        <span className="font-bold">{cot.proveedores?.nombre}</span>
        <span className="font-mono text-3xl">{cot.monto != null ? pesos.format(cot.monto) : "Ver archivo"}</span>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-borde-suave pt-3 text-sm">
          {fecha && (
            <>
              <dt className="text-gris">Fecha</dt>
              <dd className="text-right font-semibold">{fecha}</dd>
            </>
          )}
          {cot.garantia_dias != null && (
            <>
              <dt className="text-gris">Garantía</dt>
              <dd className="text-right font-semibold">{cot.garantia_dias} días</dd>
            </>
          )}
          {cot.incluye_materiales != null && (
            <>
              <dt className="text-gris">Materiales</dt>
              <dd className="text-right font-semibold">{cot.incluye_materiales ? "Incluidos" : "Aparte"}</dd>
            </>
          )}
          {ticket.quien_paga && (
            <>
              <dt className="text-gris">Paga</dt>
              <dd className="text-right font-semibold">{etiqueta(QUIEN_PAGA, ticket.quien_paga)}</dd>
            </>
          )}
        </dl>
        {cot.notas && <p className="text-sm text-gris">{cot.notas}</p>}
        {cot.archivo_path && url.get(cot.archivo_path) && (
          <a href={url.get(cot.archivo_path) ?? undefined} target="_blank" rel="noreferrer" className="text-sm font-semibold text-verde">
            Ver cotización original
          </a>
        )}
      </section>

      {ap.decision ? (
        <p
          className={`rounded-2xl p-4 text-sm font-semibold ${ap.decision === "aprobada" ? "bg-verde-claro text-verde-oscuro" : "bg-naranja-claro text-naranja-oscuro"}`}
        >
          {ap.decision === "aprobada" ? "Aprobaste este trabajo. Tu administradora ya lo está coordinando." : "Rechazaste esta propuesta. Tu administradora buscará otra opción."}
        </p>
      ) : (
        <DecisionForm token={token} />
      )}
    </>
  );
}
