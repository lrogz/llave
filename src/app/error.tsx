"use client";

import Link from "next/link";
import { useEffect } from "react";

// Pantalla amable cuando algo falla (en vez del error en inglés de Next).
export default function ErrorApp({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const propio = error.message && !/server components render|digest/i.test(error.message) ? error.message : "";
  return (
    <main className="flex flex-1 items-center justify-center bg-fondo px-4 py-16">
      <div className="w-full max-w-md rounded-3xl bg-white p-8">
        <h1 className="font-display text-2xl font-bold">Algo no salió bien</h1>
        <p className="mt-2 text-sm text-gris">{propio || "No pudimos completar lo que pediste. Revisa los datos e intenta de nuevo."}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => retry()} className="min-h-11 rounded-xl bg-verde px-4 text-sm font-bold text-white">
            Intentar de nuevo
          </button>
          <Link href="/hoy" className="flex min-h-11 items-center rounded-xl border border-borde px-4 text-sm font-bold">
            Ir a Hoy
          </Link>
        </div>
        {error.digest && <p className="mt-4 text-xs text-gris">Código: {error.digest}</p>}
      </div>
    </main>
  );
}
