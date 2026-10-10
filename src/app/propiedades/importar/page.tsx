import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Menu } from "@/components/Menu";
import { sesionConOrg } from "@/lib/sesion";
import { Importador } from "./Importador";

export const metadata: Metadata = { title: "Importar propiedades · Black Key" };

export default function Importar() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const { org } = await sesionConOrg();
  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Propiedades" nombreOrg={org.nombre} />
      <main className="min-w-0 flex-[999_1_560px] px-5 py-8 sm:px-10">
        <Link href="/" className="text-sm font-semibold text-gris hover:text-tinta">
          ← Mis propiedades
        </Link>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Importar desde Excel</h1>
        <p className="mt-1 text-gris">Trae toda tu cartera de una vez, sin capturar una por una.</p>
        <Importador />
      </main>
    </div>
  );
}
