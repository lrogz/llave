import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Chip, Fila, Pantalla, Tarjeta } from "@/components/vecino/Piezas";
import { createAdminClient } from "@/lib/supabase/admin";
import { cuando, esToken } from "@/lib/condominios";

export const metadata: Metadata = { title: "Recoger paquete", robots: { index: false, follow: false }, referrer: "same-origin" };

type Recogida = { nombre: string; pin: string | null; estado: string; vivienda: string; condominio: string; expira: string; paquetes: number };

// Lo que ve la persona autorizada: su PIN y a qué vivienda corresponde. Nada más del residente.
export default function Recoger({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#F7F4EE] text-[#1F1E1A]">
      <Suspense fallback={<p className="p-10 text-center">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </div>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const { data } = esToken(token) ? await createAdminClient().rpc("recogida_publica", { p_token: token }) : { data: null };
  const r = data as Recogida | null;
  if (!r) {
    return (
      <Pantalla>
        <Tarjeta className="p-6 text-lg">Este link no existe. Pide uno nuevo a quien te autorizó.</Tarjeta>
      </Pantalla>
    );
  }
  const activa = r.estado === "activa";
  return (
    <Pantalla>
      <header className="text-center">
        <p className="text-lg text-[#5A5547]">Recoger paquete</p>
        <h1 className="font-display text-3xl font-bold">{r.condominio}</h1>
      </header>
      <div className="flex justify-center">
        <Chip texto={activa ? "Activa" : r.estado === "usada" ? "Ya se recogió" : r.estado === "revocada" ? "Cancelada" : "Vencida"} clase={activa ? "bg-[#D5E6CF] text-[#1E4D2B]" : "bg-[#E7E3DA] text-[#5A5547]"} />
      </div>
      {activa && (
        <div className="rounded-2xl border border-[#E1DCD0] bg-white p-6 text-center">
          <p className="text-lg text-[#5A5547]">Dile este PIN al guardia</p>
          <p className="mt-2 font-mono text-5xl font-bold tracking-[0.3em]">{r.pin}</p>
        </div>
      )}
      <div className="divide-y divide-[#E1DCD0] border-y border-[#E1DCD0]">
        <Fila icono="persona">{r.nombre}</Fila>
        <Fila icono="inicio">Paquetes de {r.vivienda}</Fila>
        <Fila icono="paquete">{r.paquetes === 1 ? "1 paquete en caseta" : `${r.paquetes} paquetes en caseta`}</Fila>
        {activa && <Fila icono="reloj">Válido hasta {cuando(r.expira)}</Fila>}
      </div>
      <p className="text-center text-base text-[#5A5547]">Lleva una identificación. El PIN sirve una sola vez.</p>
    </Pantalla>
  );
}
