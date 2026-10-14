"use client";

import { useActionState, useState, useTransition } from "react";
import { cambiarContrasena, guardarCorreoAvisos, mandarAhora } from "./actions";

const campo = "min-h-11 min-w-0 rounded-xl border border-borde bg-white px-3 text-sm outline-none focus:border-verde";

export function FormContrasena() {
  const [estado, accion, pendiente] = useActionState(cambiarContrasena, null);
  return (
    <form action={accion} className="flex flex-col gap-2">
      <input type="password" name="contrasena" minLength={8} required autoComplete="new-password" placeholder="Nueva contraseña (8+ caracteres)" aria-label="Nueva contraseña" className={campo} />
      <input type="password" name="confirmar" minLength={8} required autoComplete="new-password" placeholder="Repítela" aria-label="Repite la contraseña" className={campo} />
      <button type="submit" disabled={pendiente} className="min-h-11 self-start rounded-xl bg-tinta px-4 text-sm font-bold text-white disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar contraseña"}
      </button>
      {estado && (
        <p role="status" className={`text-sm ${estado.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

export function BotonMandarAhora() {
  const [mensaje, setMensaje] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => iniciar(async () => setMensaje(await mandarAhora()))}
        className="min-h-11 self-start rounded-xl border border-borde bg-white px-4 text-sm font-bold disabled:opacity-60"
      >
        {pendiente ? "Mandando…" : "Mandar los avisos de hoy ahora"}
      </button>
      {mensaje && (
        <p role="status" className={`text-sm ${mensaje.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
          {mensaje.mensaje}
        </p>
      )}
    </div>
  );
}

export function FormCorreoAvisos({ actual, porDefecto }: { actual: string; porDefecto: string }) {
  const [estado, accion, pendiente] = useActionState(guardarCorreoAvisos, null);
  return (
    <form action={accion} className="flex flex-col gap-2">
      <input type="email" name="correo" defaultValue={actual} placeholder={porDefecto || "oficina@tuadministradora.mx"} aria-label="Correo para el resumen y las respuestas" className={campo} />
      <p className="text-xs text-gris">Déjalo vacío para usar {porDefecto ? <strong>{porDefecto}</strong> : "el correo de cada administradora"}.</p>
      <button type="submit" disabled={pendiente} className="min-h-11 self-start rounded-xl border border-borde bg-white px-4 text-sm font-bold disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar correo"}
      </button>
      {estado && (
        <p role="status" className={`text-sm ${estado.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
