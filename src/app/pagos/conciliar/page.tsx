import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Menu } from "@/components/Menu";
import { sesionConOrg } from "@/lib/sesion";
import { Conciliador } from "./Conciliador";

export const metadata: Metadata = { title: "Conciliar pagos · Black Key" };

export default function Conciliar() {
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
      <Menu activo="Pagos" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <Link href="/pagos" className="text-sm font-semibold text-verde">
          ‹ Pagos
        </Link>
        <header>
          <h1 className="font-display text-4xl font-bold tracking-tight">Conciliar con el banco</h1>
          <p className="mt-1 max-w-2xl text-gris">
            Sube el estado de cuenta y marcamos solas las rentas pagadas: cada inquilino tiene una <strong>referencia numérica</strong> de 7 dígitos que pone en su transferencia. Sin referencia, te sugerimos por monto y nombre para que tú confirmes.
          </p>
        </header>
        <Conciliador />
      </main>
    </div>
  );
}
