import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Refrescar } from "@/components/vecino/Refrescar";
import { Cargando, LinkInvalido, Pantalla, Tarjeta, Titulo } from "@/components/vecino/Piezas";
import { createAdminClient } from "@/lib/supabase/admin";
import { esToken } from "@/lib/condominios";

export const metadata: Metadata = { title: "Esperando respuesta", robots: { index: false, follow: false }, referrer: "same-origin" };

export default function EstadoTimbre({ params }: { params: Promise<{ token: string }> }) {
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
  const { data } = esToken(token) ? await createAdminClient().rpc("timbre_estado", { p_token: token }) : { data: null };
  if (!data) return <LinkInvalido />;
  const d = data as { estado: string; visitante: string; vivienda: string; condominio: string; codigo: string | null };
  return (
    <Pantalla>
      {d.estado === "esperando" && <Refrescar cada={4000} />}
      <Titulo titulo={d.condominio} sub={`${d.vivienda} · ${d.visitante}`} />
      {d.estado === "esperando" && (
        <Tarjeta className="p-6 text-center">
          <p className="text-2xl font-bold">Avisamos a {d.vivienda}…</p>
          <p className="mt-2 text-lg text-[#5A5547]">Espera aquí. Esta pantalla se actualiza sola.</p>
        </Tarjeta>
      )}
      {d.estado === "autorizada" && d.codigo && (
        <div className="flex flex-col gap-4 rounded-2xl bg-[#DCE8D5] p-6 text-center">
          <p className="text-2xl font-bold">¡Te autorizaron!</p>
          <p className="text-lg">Muestra tu pase en caseta. Vale 30 minutos.</p>
          <Link href={`/pase/${d.codigo}`} className="flex min-h-16 items-center justify-center rounded-2xl bg-[#17583A] text-xl font-semibold text-white">
            Ver mi pase
          </Link>
        </div>
      )}
      {d.estado === "rechazada" && <Tarjeta className="p-6 text-center text-xl">La vivienda no autorizó el acceso. Habla con caseta.</Tarjeta>}
      {d.estado === "sin_respuesta" && <Tarjeta className="p-6 text-center text-xl">No hubo respuesta. Habla con caseta para que llamen a la vivienda.</Tarjeta>}
    </Pantalla>
  );
}
