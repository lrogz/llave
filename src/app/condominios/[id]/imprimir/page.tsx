import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import QRCode from "qrcode";
import { BotonImprimir } from "@/components/BotonImprimir";
import { sesionConOrg } from "@/lib/sesion";
import { esUuid } from "@/lib/condominios";
import { origen } from "@/lib/util";

export const metadata: Metadata = { title: "Imprimir QR · Black Key" };

// Hojas para imprimir: el QR del timbre (entrada) o los QR de los puntos de rondín.
export default function Imprimir({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ que?: string }> }) {
  return (
    <Suspense fallback={<p className="p-10">Cargando…</p>}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const qr = (url: string) => QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

async function Contenido({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ que?: string }> }) {
  const { supabase } = await sesionConOrg();
  const [{ id }, { que }] = await Promise.all([params, searchParams]);
  if (!esUuid(id)) notFound();
  const { data: c } = await supabase.from("condominios").select("id, nombre, timbre_token").eq("id", id).maybeSingle();
  if (!c) notFound();
  const base = await origen();
  if (que === "rondin") {
    const { data: puntos } = await supabase.from("puntos_rondin").select("nombre, codigo, orden").eq("condominio_id", c.id).eq("activo", true).order("orden");
    const svgs = await Promise.all((puntos ?? []).map((p) => qr(`${base}/punto/${p.codigo}`)));
    return (
      <main className="mx-auto grid max-w-4xl gap-6 bg-white p-8 sm:grid-cols-2 print:grid-cols-2">
        <div className="sm:col-span-2 print:hidden">
          <BotonImprimir />
        </div>
        {(puntos ?? []).map((p, i) => (
          <Hoja key={p.codigo} condominio={c.nombre} titulo={`Punto ${p.orden}: ${p.nombre}`} sub="Escanéalo desde la app de caseta en cada rondín." svg={svgs[i]} />
        ))}
      </main>
    );
  }
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 bg-white p-8">
      <div className="print:hidden">
        <BotonImprimir />
      </div>
      <Hoja condominio={c.nombre} titulo="¿Vienes de visita?" sub="Escanea con la cámara de tu celular, elige la vivienda y avisa que llegaste." svg={await qr(`${base}/timbre/${c.timbre_token}`)} />
    </main>
  );
}

function Hoja({ titulo, sub, svg, condominio }: { titulo: string; sub: string; svg: string; condominio: string }) {
  return (
    <section className="flex break-inside-avoid flex-col items-center gap-4 rounded-3xl border-2 border-tinta p-10 text-center">
      <h1 className="font-display text-4xl font-bold">{titulo}</h1>
      <div className="w-72 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="text-xl">{sub}</p>
      <p className="text-sm text-gris">{condominio}</p>
    </section>
  );
}
