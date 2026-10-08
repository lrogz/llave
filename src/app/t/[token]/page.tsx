import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Avance } from "@/components/Avance";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatoFecha, formatoFechaHora } from "@/lib/datos";

export const metadata: Metadata = { title: "Avance de tu reporte · Llave" };

export default function SeguimientoTicket({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">
      <Logo />
      <Suspense fallback={<p className="text-sm text-gris">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select("id, folio, titulo, estado, created_at, propiedades(nombre)")
    .eq("token_publico", token)
    .maybeSingle();

  if (!ticket) {
    return <p className="rounded-2xl bg-white p-6 text-sm">No encontramos este reporte.</p>;
  }

  const { data: aprobada } = await admin
    .from("cotizaciones")
    .select("visita_at, fechas_disponibles, proveedores(nombre)")
    .eq("ticket_id", ticket.id)
    .eq("estado", "aprobada")
    .maybeSingle();

  const propiedad = ticket.propiedades as unknown as { nombre: string } | null;
  const proveedor = aprobada?.proveedores as unknown as { nombre: string } | null;
  const fecha = aprobada?.visita_at
    ? formatoFechaHora(aprobada.visita_at)
    : aprobada?.fechas_disponibles?.[0]
      ? formatoFecha(aprobada.fechas_disponibles[0])
      : null;

  const mensajes: Record<string, string> = {
    reportado: "Tu administrador ya recibió el reporte.",
    cotizando: "Estamos pidiendo cotizaciones a los proveedores.",
    aprobacion: "Ya hay cotización; está esperando la aprobación del dueño.",
    en_proceso: "Aprobado. El proveedor va a resolverlo.",
    resuelto: "Listo, se marcó como resuelto.",
    cancelado: "Este reporte se canceló.",
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5">
      <div>
        <p className="text-sm text-gris">
          {propiedad?.nombre} · #{ticket.folio} · {formatoFecha(ticket.created_at)}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold">{ticket.titulo}</h1>
      </div>
      <Avance estado={ticket.estado} />
      <p className="text-sm">{mensajes[ticket.estado] ?? ""}</p>
      {fecha && (
        <p className="rounded-xl bg-verde-claro px-3 py-2.5 text-sm text-verde-oscuro">
          {proveedor?.nombre ? `${proveedor.nombre} · ` : ""}
          {fecha}
        </p>
      )}
    </section>
  );
}
