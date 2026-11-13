"use client";

import { useActionState, useState } from "react";
import { solicitarMudanza } from "@/app/vecino/actions";
import { Icono } from "./Iconos";
import { Aviso, CAMPO, ETIQUETA } from "./Piezas";

export function FormMudanza({ token, hoy }: { token: string; hoy: string }) {
  const [estado, accion, pendiente] = useActionState(solicitarMudanza, null);
  const [tipo, setTipo] = useState<"entrada" | "salida">("entrada");
  return (
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="tipo" value={tipo} />
      <div className="grid grid-cols-2 gap-3">
        {(["entrada", "salida"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)} className={`min-h-14 rounded-xl border text-xl ${tipo === t ? "border-transparent bg-[#D5E6CF] font-semibold text-[#1E4D2B]" : "border-[#BDB8AC] bg-[#FBF9F4]"}`}>
            {t === "entrada" ? "Entrada" : "Salida"}
          </button>
        ))}
      </div>
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-1.5 text-base font-semibold">Fecha y horario</legend>
        <input type="date" name="fecha" required min={hoy} aria-label="Fecha" className={`${CAMPO} col-span-2`} />
        <input type="time" name="hora_desde" required defaultValue="09:00" aria-label="Desde" className={CAMPO} />
        <input type="time" name="hora_hasta" required defaultValue="12:00" aria-label="Hasta" className={CAMPO} />
      </fieldset>
      <label className={ETIQUETA}>
        Empresa de mudanza
        <input name="empresa" required minLength={2} maxLength={80} placeholder="Mudanzas del Centro" className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        Placa del vehículo
        <input name="placa" maxLength={12} autoCapitalize="characters" placeholder="ABC-123" className={CAMPO} />
      </label>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-base font-semibold">Recursos</legend>
        {[
          ["zona_carga", "Zona de carga"],
          ["elevador", "Elevador de servicio"],
        ].map(([v, t]) => (
          <label key={v} className="flex min-h-13 items-center gap-4 rounded-xl border border-[#BDB8AC] bg-[#FBF9F4] px-4 text-lg">
            <input type="checkbox" name="recursos" value={v} defaultChecked className="size-6 accent-[#17583A]" />
            {t}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-4 rounded-2xl bg-[#DCE8D5] p-4">
        <Icono nombre="caseta" className="size-10 shrink-0 text-[#17583A]" grueso={1.5} />
        <span className="border-l border-[#17583A]/30 pl-4">
          <b className="block text-lg">Se notificará a caseta</b>
          <span className="text-base">Pase QR al aprobar la solicitud</span>
        </span>
      </div>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <button type="submit" disabled={pendiente} className="min-h-16 rounded-2xl bg-[#17583A] px-5 text-xl font-semibold text-white disabled:opacity-60">
        {pendiente ? "Enviando…" : "Enviar solicitud"}
      </button>
    </form>
  );
}
