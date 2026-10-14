import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { BotonImprimir } from "@/components/BotonImprimir";
import { Firma, VistaInspeccion } from "@/components/Inspeccion";
import { Logo } from "@/components/Logo";
import { PieLegal } from "@/components/PieLegal";
import { formatoFecha } from "@/lib/datos";
import { etiquetaTipo } from "@/lib/inspeccion";
import { cargarInspeccion } from "@/lib/inspeccion-datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { FirmaForm } from "./FirmaForm";

export const metadata: Metadata = { title: "Entrega de la casa · Black Key", robots: { index: false } };

export default function EntregaInquilino({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-6 print:max-w-none">
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
  const i = /^[0-9a-f]{32}$/.test(token) ? await cargarInspeccion(createAdminClient(), { token }) : null;
  if (!i) {
    return (
      <div className="rounded-2xl bg-white p-6">
        <h1 className="font-display text-2xl font-bold">Link no válido</h1>
        <p className="mt-2 text-sm text-gris">Pide a tu administradora el link de nuevo.</p>
      </div>
    );
  }
  return (
    <>
      <header>
        <p className="text-sm text-gris">
          {i.org} · {formatoFecha(i.fecha)}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{etiquetaTipo(i.tipo)}</h1>
        <p className="text-gris">{[i.propiedad.nombre, i.propiedad.direccion].filter(Boolean).join(" · ")}</p>
      </header>
      {!i.firmada_at && <p className="rounded-2xl bg-[#FFF4E0] p-4 text-sm text-[#7A4E00]">Revisa cada cuarto y sus fotos. Si estás de acuerdo, firma al final. Si algo no coincide, escríbelo en observaciones.</p>}
      <VistaInspeccion i={i} />
      {i.firmada_at ? (
        <>
          <Firma i={i} />
          <BotonImprimir />
        </>
      ) : (
        <section aria-label="Firmar" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
          <h2 className="font-display text-2xl font-bold">Firma de conformidad</h2>
          <FirmaForm token={token} nombre={i.inquilino?.nombre ?? ""} />
          <PieLegal accion="Al firmar" />
        </section>
      )}
    </>
  );
}
