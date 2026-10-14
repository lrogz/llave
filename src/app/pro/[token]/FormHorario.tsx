"use client";

import { useActionState } from "react";
import { guardarHorario } from "./actions";

const campo = "min-h-11 min-w-0 rounded-xl border border-borde bg-white px-3 text-sm outline-none focus:border-verde";
const DIAS = [
  [1, "Lun"],
  [2, "Mar"],
  [3, "Mié"],
  [4, "Jue"],
  [5, "Vie"],
  [6, "Sáb"],
  [0, "Dom"],
] as const;

export function FormHorario({ token, horario }: { token: string; horario: { dias?: number[]; desde?: string; hasta?: string; duracion?: number } }) {
  const [estado, accion, pendiente] = useActionState(guardarHorario, null);
  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-sm font-semibold">Días que trabajas</legend>
        {DIAS.map(([v, t]) => (
          <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-borde px-3 text-sm has-checked:border-verde has-checked:bg-verde-claro has-checked:font-bold">
            <input type="checkbox" name="dias" value={v} defaultChecked={horario.dias?.includes(v) ?? (v >= 1 && v <= 5)} className="accent-verde" />
            {t}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
          Desde
          <input type="time" name="desde" defaultValue={horario.desde ?? "09:00"} step={1800} className={`${campo} text-tinta`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
          Hasta
          <input type="time" name="hasta" defaultValue={horario.hasta ?? "18:00"} step={1800} className={`${campo} text-tinta`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
          Cada visita dura
          <select name="duracion" defaultValue={String(horario.duracion ?? 60)} className={`${campo} text-tinta`}>
            <option value="30">30 min</option>
            <option value="60">1 hora</option>
            <option value="90">1 h 30</option>
            <option value="120">2 horas</option>
            <option value="180">3 horas</option>
          </select>
        </label>
      </div>
      <button type="submit" disabled={pendiente} className="min-h-11 self-start rounded-xl bg-verde px-4 text-sm font-bold text-white disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar horario"}
      </button>
      {estado && (
        <p role="status" className={`text-sm ${estado.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
