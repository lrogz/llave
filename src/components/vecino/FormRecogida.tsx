"use client";

import { useActionState } from "react";
import { autorizarRecogida } from "@/app/vecino/actions";
import { Aviso, CAMPO, ETIQUETA } from "./Piezas";

// Autoriza a otra persona a recoger los paquetes: caseta le pide un PIN de un solo uso.
export function FormRecogida({ token, paquetes }: { token: string; paquetes: { id: string; texto: string }[] }) {
  const [estado, accion, pendiente] = useActionState(autorizarRecogida, null);
  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className={ETIQUETA}>
        ¿Quién va a recoger?
        <input name="nombre" required minLength={2} maxLength={120} placeholder="Luis (vecino de la casa 8)" className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        ¿Qué paquete?
        <select name="paquete_id" className={CAMPO} defaultValue="">
          <option value="">Todos los que estén en caseta</option>
          {paquetes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.texto}
            </option>
          ))}
        </select>
      </label>
      <label className={ETIQUETA}>
        Válido por
        <select name="horas" className={CAMPO} defaultValue="24">
          <option value="6">6 horas</option>
          <option value="24">1 día</option>
          <option value="72">3 días</option>
        </select>
      </label>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && (
        <Aviso>
          PIN para caseta: <strong className="font-mono text-2xl tracking-widest">{estado.ok}</strong>. Compártelo o manda el link desde la lista de abajo.
        </Aviso>
      )}
      <button type="submit" disabled={pendiente} className="min-h-14 rounded-2xl bg-[#17583A] px-5 text-lg font-semibold text-white disabled:opacity-60">
        {pendiente ? "Generando…" : "Generar PIN de recogida"}
      </button>
    </form>
  );
}
