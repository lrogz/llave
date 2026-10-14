"use client";

import { useActionState, useState } from "react";
import { guardarBanco } from "../actions";

const campo = "min-h-11 min-w-0 rounded-xl border border-borde bg-white px-3 text-sm outline-none focus:border-verde";

export function Copiar({ texto, etiqueta = "Copiar datos para transferir" }: { texto: string; etiqueta?: string }) {
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
      className="mt-1 min-h-10 self-start rounded-xl border border-borde bg-white px-3 text-xs font-bold"
    >
      {listo ? "✓ Copiado" : etiqueta}
    </button>
  );
}

export function FormBanco({ duenoId, banco, clabe }: { duenoId: string; banco: string; clabe: string }) {
  const [estado, accion, pendiente] = useActionState(guardarBanco, null);
  return (
    <form action={accion} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="dueno_id" value={duenoId} />
      <input name="banco" maxLength={60} key={`b${estado?.banco}`} defaultValue={estado?.banco ?? banco} placeholder="Banco" aria-label="Banco" className={campo} />
      <input name="clabe" inputMode="numeric" maxLength={22} key={`c${estado?.clabe}${estado?.mensaje}`} defaultValue={estado?.clabe ?? clabe} placeholder="CLABE (18 dígitos)" aria-label="CLABE" className={campo} />
      <button type="submit" disabled={pendiente} className="min-h-11 self-start rounded-xl border border-borde bg-white px-4 text-sm font-bold disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
      {estado && (
        <p role="status" className={`text-sm ${estado.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
