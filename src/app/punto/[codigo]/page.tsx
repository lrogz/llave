import type { Metadata } from "next";

export const metadata: Metadata = { title: "Punto de rondín", robots: { index: false, follow: false } };

export default function Punto() {
  return (
    <main className="flex flex-1 items-center justify-center bg-tinta p-8 text-center text-lg text-white">
      Punto de rondín. Escanéalo desde la app de caseta (Escanear) para marcar tu recorrido.
    </main>
  );
}
