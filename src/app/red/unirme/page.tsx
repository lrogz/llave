import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { CATEGORIAS } from "@/lib/datos";
import { ZONAS_SUGERIDAS } from "@/lib/red";
import { FormRed } from "./FormRed";

export const metadata: Metadata = { title: "Únete a la red de proveedores · Black Key", description: "Recibe trabajos de administradoras de propiedades en Querétaro. Sin cuotas para entrar." };

export default function UnirmeRed() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-6">
      <Logo />
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Únete a la red de proveedores</h1>
        <p className="mt-2 text-gris">Recibe trabajos de administradoras de casas y departamentos: reparaciones, mantenimiento y servicios. Cotizas desde tu celular, ves fotos del problema antes de ir y las citas se agendan en tus horarios.</p>
      </header>
      <ul className="grid gap-2 text-sm sm:grid-cols-3">
        <li className="rounded-2xl bg-white p-4">✓ Sin cuota para entrar</li>
        <li className="rounded-2xl bg-white p-4">✓ Tú pones tus horarios y precios</li>
        <li className="rounded-2xl bg-white p-4">✓ Perfil verificado con calificaciones</li>
      </ul>
      <section className="rounded-2xl bg-white p-5">
        <FormRed categorias={CATEGORIAS.filter(([v]) => v !== "otro") as unknown as [string, string][]} zonas={ZONAS_SUGERIDAS} />
      </section>
    </main>
  );
}
