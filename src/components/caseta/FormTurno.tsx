"use client";

import { useActionState, useState } from "react";
import { iniciarTurno } from "@/app/caseta/actions";

export function FormTurno({ token, condominio, guardias, cerrado }: { token: string; condominio: string; guardias: { id: string; nombre: string }[]; cerrado: boolean }) {
  const [estado, accion, pendiente] = useActionState(iniciarTurno, null);
  const [guardia, setGuardia] = useState(guardias.length === 1 ? guardias[0].id : "");
  return (
    <main className="flex flex-1 flex-col bg-tinta text-white">
      <form action={accion} className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 py-8">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="guardia_id" value={guardia} />
        <div>
          <p className="text-lg text-white/70">Caseta</p>
          <h1 className="font-display text-3xl font-bold">{condominio}</h1>
        </div>
        {cerrado && (
          <p role="status" className="rounded-xl bg-menta/20 px-4 py-3 text-menta">
            Turno cerrado y entregado. Buen descanso.
          </p>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-lg font-bold">¿Quién entra al turno?</legend>
          {guardias.map((g) => (
            <button key={g.id} type="button" aria-pressed={guardia === g.id} onClick={() => setGuardia(g.id)} className={`min-h-14 rounded-xl border-2 px-4 text-left text-lg ${guardia === g.id ? "border-menta bg-menta/15 font-bold" : "border-white/15"}`}>
              {g.nombre}
            </button>
          ))}
          {!guardias.length && <p className="text-white/70">La administración aún no da de alta guardias para esta caseta.</p>}
        </fieldset>
        <label className="flex flex-col gap-1 text-lg font-bold">
          PIN
          <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" required autoComplete="off" className="min-h-14 rounded-xl border-2 border-white/15 bg-white/5 px-4 text-center text-2xl tracking-[0.5em] outline-none focus:border-menta" />
        </label>
        {estado?.error && (
          <p role="alert" className="rounded-xl bg-naranja px-4 py-3">
            {estado.error}
          </p>
        )}
        <button type="submit" disabled={pendiente || !guardia} className="min-h-14 rounded-xl bg-menta text-lg font-bold text-tinta disabled:opacity-50">
          {pendiente ? "Abriendo turno…" : "Iniciar turno"}
        </button>
        <p className="text-sm text-white/60">Al iniciar, el turno anterior se cierra y sus pendientes pasan a ti.</p>
      </form>
    </main>
  );
}
