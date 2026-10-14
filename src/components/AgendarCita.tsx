"use client";

import { useActionState, useState } from "react";
import { agendarCita, pedirAlInquilino } from "@/app/citas/actions";

export type EspacioUI = { valor: string; dia: string; hora: string };
const campo = "min-h-11 min-w-0 rounded-xl border border-borde bg-white px-3 text-sm outline-none focus:border-verde";

export function AgendarCita({ ticketId, proveedorId, espacios, conHorario }: { ticketId: string; proveedorId: string; espacios: EspacioUI[]; conHorario: boolean }) {
  const [estado, accion, pendiente] = useActionState(agendarCita, null);
  const [estadoLink, accionLink, pendienteLink] = useActionState(pedirAlInquilino, null);
  const [elegido, setElegido] = useState(espacios.length ? "" : "otro");
  const dias = [...new Set(espacios.map((e) => e.dia))].slice(0, 7);
  return (
    <div className="flex flex-col gap-3">
      <form action={accion} className="flex flex-col gap-3">
        <input type="hidden" name="ticket_id" value={ticketId} />
        <input type="hidden" name="proveedor_id" value={proveedorId} />
        {dias.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Horarios libres del proveedor</legend>
            {dias.map((d) => (
              <div key={d} className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gris first-letter:uppercase">{d}</span>
                <div className="flex flex-wrap gap-1.5">
                  {espacios
                    .filter((e) => e.dia === d)
                    .map((e) => (
                      <label key={e.valor} className="flex min-h-10 cursor-pointer items-center rounded-full border border-borde px-3 text-xs font-semibold has-checked:border-verde has-checked:bg-verde-claro has-checked:text-verde-oscuro">
                        <input type="radio" name="espacio" value={e.valor} checked={elegido === e.valor} onChange={() => setElegido(e.valor)} className="sr-only" />
                        {e.hora}
                      </label>
                    ))}
                </div>
              </div>
            ))}
            <label className="flex min-h-10 cursor-pointer items-center gap-2 self-start rounded-full border border-borde px-3 text-xs font-semibold has-checked:border-verde has-checked:bg-verde-claro">
              <input type="radio" name="espacio" value="otro" checked={elegido === "otro"} onChange={() => setElegido("otro")} className="sr-only" />
              Otra fecha que ya acordamos
            </label>
          </fieldset>
        )}
        {elegido === "otro" && (
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
              Fecha
              <input type="date" name="fecha" required className={`${campo} text-tinta`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
              Hora
              <input type="time" name="hora" required className={`${campo} text-tinta`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
              Dura
              <select name="duracion" defaultValue="60" className={`${campo} text-tinta`}>
                <option value="30">30 min</option>
                <option value="60">1 hora</option>
                <option value="120">2 horas</option>
                <option value="240">4 horas</option>
                <option value="480">Todo el día</option>
              </select>
            </label>
          </div>
        )}
        <input name="notas" maxLength={300} placeholder="Nota para el proveedor (opcional)" aria-label="Nota para el proveedor" className={campo} />
        <button type="submit" disabled={pendiente || !elegido} className="min-h-11 self-start rounded-xl bg-verde px-4 text-sm font-bold text-white disabled:opacity-50">
          {pendiente ? "Agendando…" : "Agendar visita"}
        </button>
        {estado && (
          <p role="status" className={`text-sm ${estado.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
            {estado.mensaje}
          </p>
        )}
      </form>
      {conHorario && (
        <form action={accionLink} className="flex flex-col gap-1 border-t border-borde-suave pt-3">
          <input type="hidden" name="ticket_id" value={ticketId} />
          <input type="hidden" name="proveedor_id" value={proveedorId} />
          <button type="submit" disabled={pendienteLink} className="min-h-11 self-start rounded-xl border border-borde bg-white px-4 text-sm font-bold disabled:opacity-50">
            {pendienteLink ? "Creando…" : "Que el inquilino elija el horario"}
          </button>
          {estadoLink && (
            <p role="status" className={`text-sm ${estadoLink.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
              {estadoLink.mensaje}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
