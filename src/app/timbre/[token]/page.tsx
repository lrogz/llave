import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { FormTimbre } from "@/components/vecino/FormTimbre";
import { Cargando, LinkInvalido, Pantalla, Titulo } from "@/components/vecino/Piezas";
import { createAdminClient } from "@/lib/supabase/admin";
import { esToken } from "@/lib/condominios";

export const metadata: Metadata = { title: "Timbre", robots: { index: false, follow: false }, referrer: "same-origin" };

// QR pegado en la entrada: la visita avisa a la vivienda desde su celular.
export default function Timbre({ params }: { params: Promise<{ token: string }> }) {
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
  const { data, error } = esToken(token) ? await createAdminClient().rpc("timbre_datos", { p_token: token }) : { data: null, error: true };
  if (error || !data) return <LinkInvalido />;
  const d = data as { condominio: string; viviendas: { id: string; numero: string }[] };
  return (
    <Pantalla>
      <Titulo titulo="Timbre" sub={d.condominio} />
      <p className="text-lg text-[#5A5547]">Avisamos a la vivienda. Cuando te autoricen verás tu pase para mostrarlo en caseta.</p>
      <FormTimbre token={token} viviendas={d.viviendas} />
    </Pantalla>
  );
}
