import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, CATEGORIAS, DISPONIBILIDAD, etiqueta, formatoFecha, formatoFechaHora, pesos } from "@/lib/datos";
import { ProveedorForm } from "./ProveedorForm";

export const metadata: Metadata = { title: "Solicitud de cotización · Black Key" };

export default function SolicitudProveedor({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="flex flex-1 justify-center bg-tinta text-white">
      <div className="flex w-full max-w-md flex-col gap-4 px-5 py-6">
        <Logo claro />
        <Suspense fallback={<p className="text-sm text-[#B9C8C1]">Cargando…</p>}>
          <Contenido params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const admin = createAdminClient();
  const { data: sol } = await admin
    .from("solicitudes_cotizacion")
    .select(
      "id, estado, vista_at, proveedores(nombre), organizaciones(nombre), tickets(id, titulo, descripcion, categoria, urgencia, disponibilidad, estado, propiedades(colonia, ciudad))",
    )
    .eq("token", token)
    .maybeSingle();

  if (!sol) return <p className="rounded-2xl bg-[#1E2D28] p-5 text-sm">Este link ya no es válido.</p>;

  const ticket = sol.tickets as unknown as {
    id: string;
    titulo: string;
    descripcion: string | null;
    categoria: string | null;
    urgencia: string;
    disponibilidad: string[];
    estado: string;
    propiedades: { colonia: string | null; ciudad: string | null } | null;
  };
  const org = sol.organizaciones as unknown as { nombre: string } | null;

  if (!sol.vista_at) {
    await admin
      .from("solicitudes_cotizacion")
      .update({ vista_at: new Date().toISOString(), estado: sol.estado === "enviada" ? "vista" : sol.estado })
      .eq("id", sol.id);
  }

  const [{ data: media }, { data: propia }] = await Promise.all([
    admin.from("ticket_media").select("id, tipo, storage_path").eq("ticket_id", ticket.id).eq("momento", "reporte").order("created_at"),
    admin.from("cotizaciones").select("modo, monto, visita_at, fechas_disponibles").eq("solicitud_id", sol.id).maybeSingle(),
  ]);
  const { data: firmadas } = media?.length
    ? await admin.storage.from(BUCKET).createSignedUrls(media.map((m) => m.storage_path as string), 3600)
    : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));

  const zona = [ticket.propiedades?.colonia, ticket.propiedades?.ciudad].filter(Boolean).join(", ");
  const cerrado = ["en_proceso", "resuelto", "cancelado"].includes(ticket.estado);

  return (
    <>
      <header className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-widest text-menta uppercase">
          Solicitud · {etiqueta(CATEGORIAS, ticket.categoria) || "Mantenimiento"}
          {ticket.urgencia === "urgente" ? " · Urgente" : ""}
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">{ticket.titulo}</h1>
        <span className="text-sm text-[#B9C8C1]">{[zona, org?.nombre ? `te lo envió ${org.nombre}` : null].filter(Boolean).join(" · ")}</span>
      </header>

      {media && media.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {media.map((m) => {
            const src = url.get(m.storage_path as string);
            if (!src) return null;
            return (
              <li key={m.id as string} className="overflow-hidden rounded-xl bg-[#2C3A35]">
                {m.tipo === "video" ? (
                  <video src={src} controls playsInline preload="metadata" className="h-40 w-full object-cover" />
                ) : (
                  <a href={src} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="Foto del problema" className="h-40 w-full object-cover" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {ticket.descripcion && <p className="text-sm leading-relaxed text-[#E7EEEA]">“{ticket.descripcion}”</p>}
      {ticket.disponibilidad?.length > 0 && (
        <p className="text-sm text-[#B9C8C1]">Pueden recibirte: {ticket.disponibilidad.map((d) => etiqueta(DISPONIBILIDAD, d)).join(", ")}</p>
      )}

      {propia ? (
        <p className="rounded-2xl bg-[#1E3B32] p-4 text-sm font-semibold text-menta">
          {propia.modo === "visita"
            ? `Visita agendada: ${formatoFechaHora(propia.visita_at)}. Te confirmamos por WhatsApp.`
            : `Cotización enviada: ${propia.monto != null ? pesos.format(propia.monto) : ""}${propia.fechas_disponibles?.length ? ` · ${propia.fechas_disponibles.map(formatoFecha).join(", ")}` : ""}. Te avisamos si la aprueban.`}
        </p>
      ) : sol.estado === "descartada" ? (
        <p className="rounded-2xl bg-[#1E2D28] p-4 text-sm">Marcaste que no es tu especialidad. Gracias por avisar.</p>
      ) : cerrado ? (
        <p className="rounded-2xl bg-[#1E2D28] p-4 text-sm">Este trabajo ya fue asignado o cerrado.</p>
      ) : (
        <ProveedorForm token={token} />
      )}
    </>
  );
}
