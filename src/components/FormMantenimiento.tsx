"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { programarMantenimiento } from "@/app/mantenimiento/actions";
import { DIAS_ANTES, PLANTILLAS_MANT } from "@/lib/mantenimiento";
import { QuienPaga } from "./QuienPaga";

const campo = "min-h-11 w-full min-w-0 rounded-xl border border-borde bg-white px-3 text-sm outline-none focus:border-verde";
const cada = (n: number) => (n === 1 ? "cada mes" : n === 12 ? "cada año" : n === 24 ? "cada 2 años" : `cada ${n} meses`);

export function FormMantenimiento({ propiedades, propiedadId, volver, hoy }: { propiedades?: { id: string; nombre: string }[]; propiedadId?: string; volver: string; hoy: string }) {
  const [estado, accion, pendiente] = useActionState(programarMantenimiento, null);
  const [tarea, setTarea] = useState("impermeabilizar");
  const plantilla = PLANTILLAS_MANT.find((p) => p.clave === tarea);
  const ref = useRef<HTMLFormElement>(null);
  // Se limpia solo cuando se guardó; si hubo un error, se conserva lo escrito.
  useEffect(() => {
    if (estado?.ok) ref.current?.reset();
  }, [estado]);
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => accion(datos));
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="volver" value={volver} />
      {propiedadId ? (
        <input type="hidden" name="propiedad_id" value={propiedadId} />
      ) : (
        <select name="propiedad_id" required defaultValue="" aria-label="Propiedad" className={campo}>
          <option value="" disabled>
            Propiedad…
          </option>
          <option value="todas">Todas mis propiedades</option>
          {(propiedades ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <select name="tarea" value={tarea} onChange={(e) => setTarea(e.target.value)} aria-label="Tarea" className={campo}>
          {PLANTILLAS_MANT.map((p) => (
            <option key={p.clave} value={p.clave}>
              {p.titulo} ({cada(p.meses)})
            </option>
          ))}
          <option value="otra">Otra (escríbela)</option>
        </select>
        {tarea === "otra" && <input name="titulo" required maxLength={120} placeholder="¿Qué tarea?" aria-label="Otra tarea" className={campo} />}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
          Cada cuántos meses
          <input name="cada_meses" inputMode="numeric" required={!plantilla} placeholder={plantilla ? String(plantilla.meses) : "Ej. 6"} className={`${campo} text-tinta`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
          Próxima vez
          <input name="proxima" type="date" required defaultValue={hoy} className={`${campo} text-tinta`} />
        </label>
      </div>
      <QuienPaga defaultValue="dueno" />
      <input name="notas" maxLength={500} placeholder="Notas para el ticket (proveedor de siempre, medidas…)" aria-label="Notas" className={campo} />
      <p className="text-xs text-gris">El ticket se crea solo {DIAS_ANTES} días antes de la fecha y la siguiente se programa sola.</p>
      <button type="submit" disabled={pendiente} className="min-h-11 self-start rounded-xl bg-verde px-4 text-sm font-bold text-white disabled:opacity-60">
        {pendiente ? "Programando…" : "Programar"}
      </button>
      {estado && (
        <p role={estado.ok ? "status" : "alert"} className={`text-sm ${estado.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
