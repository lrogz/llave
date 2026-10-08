"use client";

export function Imprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl bg-verde px-4 text-sm font-bold text-white">
      Imprimir cartel
    </button>
  );
}
