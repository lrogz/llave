"use client";

import { useActionState } from "react";
import type { EspacioUI } from "@/components/AgendarCita";
import { elegirHorario } from "./actions";

export function ElegirHorario({ token, espacios }: { token: string; espacios: EspacioUI[] }) {
  const [estado, accion, pendiente] = useActionState(elegirHorario, null);
  const dias = [...new Set(espacios.map((e) => e.dia))];
  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {dias.map((d) => (
        <fieldset key={d} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold first-letter:uppercase">{d}</legend>
          <div className="flex flex-wrap gap-2">
            {espacios
              .filter((e) => e.dia === d)
              .map((e) => (
                <label key={e.valor} className="flex min-h-11 cursor-pointer items-center rounded-full border border-borde bg-white px-4 text-sm font-semibold has-checked:border-verde has-checked:bg-verde-claro has-checked:text-verde-oscuro">
                  <input type="radio" name="espacio" value={e.valor} required className="sr-only" />
                  {e.hora}
                </label>
              ))}
          </div>
        </fieldset>
      ))}
      <button type="submit" disabled={pendiente} className="min-h-13 rounded-xl bg-verde text-base font-bold text-white disabled:opacity-60">
        {pendiente ? "Guardando…" : "Confirmar horario"}
      </button>
      {estado && !estado.ok && (
        <p role="alert" className="text-sm text-naranja-oscuro">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
