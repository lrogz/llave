import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { FormAlta } from "@/components/vecino/FormAlta";
import { Cargando, LinkInvalido } from "@/components/vecino/Piezas";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Alta de residente", robots: { index: false, follow: false }, referrer: "same-origin" };

export default function Alta({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#F7F4EE] text-[#1F1E1A]">
      <Suspense fallback={<Cargando />}>
        <Contenido params={params} />
      </Suspense>
    </div>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const { data, error } = /^[A-Z0-9]{12,40}$/.test(token) ? await createAdminClient().rpc("alta_datos", { p_token: token }) : { data: null, error: true };
  if (error || !data) return <LinkInvalido />;
  const d = data as { condominio: string; administradora: string; viviendas: { id: string; numero: string }[] };
  return <FormAlta token={token} condominio={d.condominio} administradora={d.administradora} viviendas={d.viviendas} />;
}
