import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReporteForm } from "./ReporteForm";

export const metadata: Metadata = { title: "Reportar un problema · Llave" };

export default function Reporte({ params }: { params: Promise<{ codigo: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">
      <Logo />
      <Suspense fallback={<p className="text-sm text-gris">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ codigo: string }> }) {
  await connection();
  const { codigo } = await params;
  const admin = createAdminClient();
  const { data: propiedad } = await admin
    .from("propiedades")
    .select("nombre, organizaciones(nombre)")
    .eq("codigo_qr", codigo)
    .maybeSingle();

  if (!propiedad) {
    return (
      <div className="rounded-2xl bg-white p-6">
        <h1 className="font-display text-2xl font-bold">Código no válido</h1>
        <p className="mt-2 text-sm text-gris">Pide a tu administrador un código nuevo.</p>
      </div>
    );
  }

  const org = propiedad.organizaciones as unknown as { nombre: string } | null;

  return (
    <>
      <header>
        <p className="text-sm text-gris">
          {propiedad.nombre}
          {org?.nombre ? ` · ${org.nombre}` : ""}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">¿Qué está pasando?</h1>
      </header>
      <ReporteForm codigo={codigo} />
    </>
  );
}
