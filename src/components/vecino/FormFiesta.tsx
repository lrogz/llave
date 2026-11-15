"use client";

import { useActionState } from "react";
import { agregarInvitados, crearEvento } from "@/app/vecino/actions";
import { Aviso, CAMPO, ETIQUETA } from "./Piezas";

const BOTON = "min-h-16 rounded-2xl bg-[#17583A] px-5 text-xl font-semibold text-white disabled:opacity-60";

// Fiesta: un pase de un solo uso por invitado, con cajones apartados para los primeros de la lista.
export function FormFiesta({ token, hoy, maxCajones, maxInvitados }: { token: string; hoy: string; maxCajones: number; maxInvitados: number | null }) {
  const [estado, accion, pendiente] = useActionState(crearEvento, null);
  return (
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <label className={ETIQUETA}>
        ¿Qué celebras?
        <input name="nombre" required minLength={2} maxLength={120} placeholder="Cumpleaños de Sofía" className={CAMPO} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={`${ETIQUETA} col-span-2`}>
          Día
          <input type="date" name="fecha" required defaultValue={hoy} min={hoy} className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          Desde
          <input type="time" name="hora_desde" required defaultValue="18:00" className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          Hasta
          <input type="time" name="hora_hasta" required defaultValue="23:00" className={CAMPO} />
        </label>
      </div>
      <label className={ETIQUETA}>
        Invitados (uno por renglón){maxInvitados ? ` · máximo ${maxInvitados}` : ""}
        <textarea name="invitados" required rows={6} placeholder={"Andrea Gómez\nBruno Castillo\nCarla Rivas"} className={`${CAMPO} py-3`} />
      </label>
      {maxCajones > 0 && (
        <label className={ETIQUETA}>
          Cajones de visita para los primeros de la lista (máximo {maxCajones})
          <input type="number" name="cajones" min={0} max={maxCajones} defaultValue={0} className={CAMPO} />
        </label>
      )}
      <label className={ETIQUETA}>
        Indicaciones para tus invitados (opcional)
        <textarea name="instrucciones" maxLength={500} rows={2} placeholder="Estaciónate fuera de la privada." className={`${CAMPO} py-3`} />
      </label>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <button type="submit" disabled={pendiente} className={BOTON}>
        {pendiente ? "Creando pases…" : "Crear pases para la fiesta"}
      </button>
    </form>
  );
}

export function FormMasInvitados({ token, evento }: { token: string; evento: string }) {
  const [estado, accion, pendiente] = useActionState(agregarInvitados, null);
  return (
    <form action={accion} className="flex flex-col gap-3 px-4 py-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="evento_id" value={evento} />
      <label className={ETIQUETA}>
        Agregar invitados
        <textarea name="invitados" required rows={2} placeholder="Un nombre por renglón" className={`${CAMPO} py-3`} />
      </label>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso>{estado.ok}</Aviso>}
      <button type="submit" disabled={pendiente} className="min-h-13 rounded-xl border border-[#17583A] px-4 text-lg font-semibold text-[#17583A] disabled:opacity-60">
        {pendiente ? "Agregando…" : "Agregar"}
      </button>
    </form>
  );
}
