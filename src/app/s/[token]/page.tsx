import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Boton } from "@/components/Boton";
import { InputComprimido } from "@/components/InputComprimido";
import { Logo } from "@/components/Logo";
import { PieLegal } from "@/components/PieLegal";
import { TIPOS_ARCHIVO, type DatosSolicitud } from "@/lib/solicitud";
import { createAdminClient } from "@/lib/supabase/admin";
import { subirDocumentoSolicitud } from "./actions";
import { SolicitudForm } from "./SolicitudForm";

export const metadata: Metadata = { title: "Solicitud de renta · Black Key", robots: { index: false } };

export default function Solicitud({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-6">
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
  const { data } = /^[0-9a-f]{32}$/.test(token)
    ? await admin.from("solicitudes_renta").select("id, nombre, telefono, email, datos, estado, recibida_at, propiedades(nombre, colonia), organizaciones(nombre), solicitud_archivos(id, tipo, nombre)").eq("token", token).maybeSingle()
    : { data: null };
  if (!data) {
    return (
      <div className="rounded-2xl bg-white p-6">
        <h1 className="font-display text-2xl font-bold">Link no válido</h1>
        <p className="mt-2 text-sm text-gris">Pide el link de nuevo a la administración.</p>
      </div>
    );
  }
  const s = data as unknown as {
    nombre: string;
    telefono: string | null;
    email: string | null;
    datos: DatosSolicitud;
    estado: string;
    recibida_at: string | null;
    propiedades: { nombre: string; colonia: string | null } | null;
    organizaciones: { nombre: string } | null;
    solicitud_archivos: { id: string; tipo: string; nombre: string | null }[];
  };
  const org = s.organizaciones?.nombre ?? "la administración";
  const cerrada = s.estado === "aprobada" || s.estado === "rechazada";
  const iniciales: Record<string, string> = { nombre: s.nombre, telefono: s.telefono ?? "", email: s.email ?? "", ...(s.datos as Record<string, string>) };

  return (
    <>
      <header>
        <p className="text-sm text-gris">{org}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">Solicitud de renta</h1>
        <p className="text-gris">{[s.propiedades?.nombre, s.propiedades?.colonia].filter(Boolean).join(" · ")}</p>
      </header>
      {cerrada ? (
        <p className="rounded-2xl bg-white p-5">Esta solicitud ya se revisó. Si tienes dudas, contacta a {org}.</p>
      ) : (
        <>
          <section aria-label="Tus datos" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
            <h2 className="font-bold">1. Tus datos</h2>
            {s.recibida_at && <p className="rounded-xl bg-verde-claro p-3 text-sm text-verde-oscuro">✓ Ya recibimos tus datos. Puedes corregirlos y volver a enviarlos.</p>}
            <SolicitudForm token={token} iniciales={iniciales} org={org} />
          </section>
          <section aria-label="Tus documentos" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
            <h2 className="font-bold">2. Tus documentos</h2>
            <p className="text-sm text-gris">PDF o fotos claras. Las fotos se reducen solas antes de subir.</p>
            <ul className="flex flex-col gap-3">
              {TIPOS_ARCHIVO.map(([tipo, texto]) => {
                const subidos = s.solicitud_archivos.filter((a) => a.tipo === tipo);
                return (
                  <li key={tipo} className="flex flex-col gap-2 rounded-xl border border-borde-suave p-3">
                    <span className="text-sm font-semibold">
                      {texto} {subidos.length > 0 && <span className="text-verde-oscuro">· ✓ {subidos.length} subido{subidos.length === 1 ? "" : "s"}</span>}
                    </span>
                    <form action={subirDocumentoSolicitud} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="tipo" value={tipo} />
                      <InputComprimido name="archivos" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" multiple required className="max-w-full text-sm" />
                      <Boton estilo="claro" enviando="Subiendo…">
                        Subir
                      </Boton>
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>
          <PieLegal accion="Al enviar" />
        </>
      )}
    </>
  );
}
