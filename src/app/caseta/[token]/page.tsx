import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { CasetaApp, type AgendaCaseta, type DatosCaseta, type ExtraCaseta } from "@/components/caseta/CasetaApp";
import { FormTurno } from "@/components/caseta/FormTurno";
import { createAdminClient } from "@/lib/supabase/admin";
import { esToken, sesionCaseta } from "@/lib/condominios";

export const metadata: Metadata = { title: "Caseta", robots: { index: false, follow: false }, referrer: "same-origin" };
export const viewport: Viewport = { themeColor: "#14201c" };

export default function Caseta({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ cerrado?: string }> }) {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center bg-tinta p-10 text-white">Cargando…</div>}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ cerrado?: string }> }) {
  await connection();
  const [{ token }, { cerrado }] = await Promise.all([params, searchParams]);
  const admin = createAdminClient();
  const invalido = (
    <main className="flex flex-1 items-center justify-center bg-tinta p-6 text-center text-lg text-white">Este link de caseta ya no es válido. Pide el nuevo a la administración.</main>
  );
  if (!esToken(token)) return invalido;

  const sesion = await sesionCaseta(token);
  if (sesion) {
    const [d, a, x] = await Promise.all([
      admin.rpc("caseta_datos", { p_turno: sesion.turno, p_hash: sesion.hash }),
      admin.rpc("agenda_caseta", { p_turno: sesion.turno, p_hash: sesion.hash }),
      admin.rpc("caseta_extra", { p_turno: sesion.turno, p_hash: sesion.hash }),
    ]);
    if (!d.error && d.data)
      return (
        <CasetaApp
          token={token}
          datos={d.data as DatosCaseta}
          agenda={(a.data as AgendaCaseta) ?? { mudanzas: [], eventos: [] }}
          extra={(x.data as ExtraCaseta) ?? { alertas: [], timbre: [], rondin: [], tiene_pluma: false, vetados: [] }}
        />
      );
  }

  // Sin turno: elegir guardia y PIN. Solo se muestran nombres.
  const { data: c } = await admin.from("condominios").select("id, nombre").eq("caseta_token", token).maybeSingle();
  if (!c) return invalido;
  const { data: guardias } = await admin.from("guardias").select("id, nombre").eq("condominio_id", c.id).eq("activo", true).order("nombre");
  return <FormTurno token={token} condominio={c.nombre} guardias={guardias ?? []} cerrado={!!cerrado} />;
}
