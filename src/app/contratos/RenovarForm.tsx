"use client";

import { useActionState } from "react";
import { linkWhatsApp } from "@/lib/datos";
import { renovar } from "./renovar";

const campo = "min-h-11 w-full min-w-0 rounded-xl border border-borde bg-white px-3 text-sm outline-none focus:border-verde";

export function RenovarForm({
  id,
  fin,
  desde,
  renta,
  sugerida,
  detalle,
}: {
  id: string;
  fin: string;
  desde: string;
  renta: number;
  sugerida: number;
  detalle: React.ReactNode;
}) {
  const [estado, accion, pendiente] = useActionState(renovar, null);
  if (estado?.ok)
    return (
      <div role="status" className="mt-2 flex flex-col gap-2 rounded-xl bg-verde-claro p-3 text-verde-oscuro">
        <p className="font-semibold">{estado.mensaje}</p>
        <div className="flex flex-wrap gap-2">
          {estado.aviso && (
            <a href={estado.aviso} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded-xl border border-verde bg-white px-3 text-xs font-bold">
              Ver aviso para el inquilino
            </a>
          )}
          {estado.textoWA && estado.telefono && (
            <a href={linkWhatsApp(estado.telefono, estado.textoWA)} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded-xl bg-verde px-3 text-xs font-bold text-white">
              Mandar por WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  return (
    <form action={accion} className="mt-2 grid grid-cols-2 gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="col-span-2">{detalle}</div>
      <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
        Nuevo fin
        <input type="date" name="fin" required defaultValue={fin} className={`${campo} text-tinta`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
        Renta nueva desde
        <input type="date" name="desde" required defaultValue={desde} className={`${campo} text-tinta`} />
      </label>
      <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-gris">
        Renta nueva {sugerida !== renta ? "(sugerida)" : ""}
        <input name="renta" inputMode="decimal" required defaultValue={sugerida} className={`${campo} font-mono text-tinta`} />
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" name="avisar" defaultChecked className="size-4 accent-verde" />
        Avisar al inquilino (correo y WhatsApp, con el cálculo)
      </label>
      <button type="submit" disabled={pendiente} className="col-span-2 min-h-11 justify-self-start rounded-xl bg-verde px-4 text-sm font-bold text-white disabled:opacity-60">
        {pendiente ? "Renovando…" : "Renovar contrato"}
      </button>
      {estado && !estado.ok && (
        <p role="alert" className="col-span-2 text-sm text-naranja-oscuro">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
