import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { BotonImprimir } from "@/components/BotonImprimir";
import { HojaFirmas, TextoContrato } from "@/components/ContratoFirmado";
import { Logo } from "@/components/Logo";
import { PieLegal } from "@/components/PieLegal";
import { ROL, cargarContrato } from "@/lib/contrato-datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { FirmarContrato } from "./FirmarContrato";

export const metadata: Metadata = { title: "Firma de contrato · Black Key", robots: { index: false } };

export default function FirmaPublica({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-5 py-6 print:max-w-none">
      <div className="print:hidden">
        <Logo />
      </div>
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
  const { data: firma } = /^[0-9a-f]{32}$/.test(token) ? await admin.from("firmas_contrato").select("id, documento_id, rol, nombre, firmada_at").eq("token", token).maybeSingle() : { data: null };
  const d = firma ? await cargarContrato(admin, firma.documento_id) : null;
  if (!firma || !d || d.estado === "borrador") {
    return (
      <div className="rounded-2xl bg-white p-6">
        <h1 className="font-display text-2xl font-bold">Link no válido</h1>
        <p className="mt-2 text-sm text-gris">Pide a tu administradora el link de nuevo.</p>
      </div>
    );
  }
  return (
    <>
      <header className="print:hidden">
        <p className="text-sm text-gris">
          {d.org} · {d.propiedad}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">Contrato de arrendamiento</h1>
        <p className="text-gris">
          Firmas como: <strong>{firma.nombre}</strong> · {ROL[firma.rol]}
        </p>
      </header>
      <TextoContrato texto={d.contenido} />
      <HojaFirmas d={d} />
      {firma.firmada_at ? (
        <div className="flex flex-col gap-3 print:hidden">
          <p className="rounded-2xl bg-verde-claro p-4 font-semibold text-verde-oscuro">✓ Ya firmaste este contrato.</p>
          <BotonImprimir texto="Imprimir o guardar PDF" />
        </div>
      ) : (
        <section aria-label="Firmar" className="flex flex-col gap-3 rounded-2xl bg-white p-5 print:hidden">
          <h2 className="font-display text-2xl font-bold">Firma</h2>
          <FirmarContrato token={token} />
          <PieLegal accion="Al firmar" />
        </section>
      )}
    </>
  );
}
