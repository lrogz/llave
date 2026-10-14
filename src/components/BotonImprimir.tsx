"use client";

export function BotonImprimir({ texto = "Imprimir o guardar PDF" }: { texto?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold print:hidden">
      {texto}
    </button>
  );
}
