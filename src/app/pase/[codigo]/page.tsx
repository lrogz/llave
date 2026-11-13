import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import QRCode from "qrcode";
import { Chip, Fila, Pantalla, Tarjeta } from "@/components/vecino/Piezas";
import { createAdminClient } from "@/lib/supabase/admin";
import { estadoPase, esToken, vigencia } from "@/lib/condominios";
import { origen } from "@/lib/util";

export const metadata: Metadata = { title: "Tu pase de acceso", robots: { index: false, follow: false }, referrer: "same-origin" };

// Lo que ve la visita al abrir el link que le mandaron: solo su QR, su nombre y la vigencia.
export default function PaseVisita({ params }: { params: Promise<{ codigo: string }> }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#F7F4EE] text-[#1F1E1A]">
      <Suspense fallback={<p className="p-10 text-center">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </div>
  );
}

async function Contenido({ params }: { params: Promise<{ codigo: string }> }) {
  await connection();
  const { codigo } = await params;
  const { data: p } = esToken(codigo)
    ? await createAdminClient()
        .from("pases")
        .select("codigo, visitante, desde, hasta, estado, usos, max_usos, modalidad, metodo_acceso, condominios(nombre, direccion)")
        .eq("codigo", codigo)
        .maybeSingle()
    : { data: null };
  if (!p || p.metodo_acceso !== "qr") {
    return (
      <Pantalla>
        <Tarjeta className="p-6 text-lg">Este pase no existe. Pide uno nuevo a quien te invitó.</Tarjeta>
      </Pantalla>
    );
  }
  const c = p.condominios as unknown as { nombre: string; direccion: string | null } | null;
  const e = estadoPase(p);
  const qr = await QRCode.toString(`${await origen()}/pase/${p.codigo}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return (
    <Pantalla>
      <header className="text-center">
        <p className="text-lg text-[#5A5547]">Pase de acceso</p>
        <h1 className="font-display text-3xl font-bold">{c?.nombre}</h1>
      </header>
      <div className="flex justify-center">
        <Chip texto={e.texto} clase={e.clase} />
      </div>
      <div className={`mx-auto w-full max-w-80 rounded-2xl border border-[#E1DCD0] bg-white p-6 ${e.vigente ? "" : "opacity-40 grayscale"}`}>
        <div className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="Código QR" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="mt-3 text-center font-mono text-lg tracking-[0.2em]">{p.codigo}</p>
      </div>
      <div className="divide-y divide-[#E1DCD0] border-y border-[#E1DCD0]">
        <Fila icono="persona">{p.visitante}</Fila>
        <Fila icono="calendario">{vigencia(p.desde, p.hasta)}</Fila>
        {c?.direccion && <Fila icono="inicio">{c.direccion}</Fila>}
      </div>
      <p className="text-center text-base text-[#5A5547]">Muestra este código en caseta. Sube el brillo de tu pantalla.</p>
    </Pantalla>
  );
}
