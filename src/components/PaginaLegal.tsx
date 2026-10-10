import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { LEGAL } from "@/lib/legal";

export function PaginaLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-fondo text-tinta">
      <header className="border-b border-borde-suave">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/conoce" aria-label="Inicio">
            <Logo />
          </Link>
          <nav className="flex gap-4 text-sm font-semibold text-gris">
            <Link href="/privacidad" className="hover:text-tinta">Privacidad</Link>
            <Link href="/terminos" className="hover:text-tinta">Términos</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-5 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{titulo}</h1>
        <p className="mt-2 text-sm text-gris">Última actualización: {LEGAL.actualizado}</p>
        <div className="legal mt-8 flex flex-col gap-4 leading-relaxed">{children}</div>
      </main>
    </div>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="mt-4 font-display text-xl font-bold">{titulo}</h2>
      {children}
    </section>
  );
}

export function Lista({ items }: { items: ReactNode[] }) {
  return (
    <ul className="ml-5 flex list-disc flex-col gap-1">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}
