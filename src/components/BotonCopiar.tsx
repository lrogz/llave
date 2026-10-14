"use client";

import { useState } from "react";

export function BotonCopiar({ texto, etiqueta, className = "" }: { texto: string; etiqueta: string; className?: string }) {
  const [listo, setListo] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setListo(true);
          setTimeout(() => setListo(false), 2000);
        } catch {
          /* el navegador no permitió copiar */
        }
      }}
      className={`flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold ${className}`}
    >
      {listo ? "✓ Copiado" : etiqueta}
    </button>
  );
}
