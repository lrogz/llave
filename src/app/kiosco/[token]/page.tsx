import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Kiosco } from "@/components/caseta/Kiosco";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Cuarto de paquetes", robots: { index: false, follow: false }, referrer: "same-origin" };

export default function PaginaKiosco({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<main className="flex-1 bg-tinta" />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const { data } = /^[A-Z0-9]{24}$/.test(token) ? await createAdminClient().rpc("kiosco_datos", { p_token: token }) : { data: null };
  if (!data) return <main className="flex flex-1 items-center justify-center bg-tinta p-8 text-center text-xl text-white">Este link ya no es válido.</main>;
  return <Kiosco token={token} condominio={(data as { condominio: string }).condominio} />;
}
