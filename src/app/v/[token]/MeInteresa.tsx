"use client";

import { useActionState } from "react";
import { meInteresa } from "./actions";

const campo = "min-h-12 w-full min-w-0 rounded-xl border border-borde bg-white px-3 text-base outline-none focus:border-verde";

export function MeInteresa({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(meInteresa, null);
  if (estado?.ok) {
    return (
      <p role="status" className="rounded-2xl bg-verde-claro p-4 font-semibold text-verde-oscuro">
        {estado.mensaje}
      </p>
    );
  }
  const v = estado?.valores ?? {};
  return (
    <form key={JSON.stringify(v)} action={accion} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <input name="empresa" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <input name="nombre" defaultValue={v.nombre} required maxLength={120} placeholder="Tu nombre" aria-label="Tu nombre" autoComplete="name" className={campo} />
      <input name="telefono" defaultValue={v.telefono} required type="tel" maxLength={30} placeholder="Celular (WhatsApp)" aria-label="Celular" autoComplete="tel" className={campo} />
      <input name="email" defaultValue={v.email} type="email" maxLength={160} placeholder="Correo (opcional)" aria-label="Correo" autoComplete="email" className={campo} />
      <label className="flex flex-col gap-1 text-sm text-gris">
        ¿Cuándo te quieres mudar? (opcional)
        <input name="mudanza" defaultValue={v.mudanza} type="date" className={campo} />
      </label>
      <textarea name="mensaje" defaultValue={v.mensaje} rows={3} maxLength={1000} placeholder="¿Algo que quieras preguntar?" aria-label="Mensaje" className={`${campo} py-2`} />
      <button type="submit" disabled={pendiente} className="min-h-13 rounded-xl bg-verde text-base font-bold text-white disabled:opacity-60">
        {pendiente ? "Enviando…" : "Quiero informes"}
      </button>
      {estado && !estado.ok && (
        <p role="alert" className="text-sm text-naranja-oscuro">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
