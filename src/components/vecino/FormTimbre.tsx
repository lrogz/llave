"use client";

import { useActionState, useState } from "react";
import { tocarTimbre } from "@/app/timbre/actions";
import { comprimir } from "@/components/InputComprimido";
import { Aviso, CAMPO, ETIQUETA } from "./Piezas";

export function FormTimbre({ token, viviendas }: { token: string; viviendas: { id: string; numero: string }[] }) {
  const [estado, accion, pendiente] = useActionState(tocarTimbre, null);
  const [foto, setFoto] = useState<File | null>(null);
  const [busca, setBusca] = useState("");
  const lista = viviendas.filter((v) => !busca || v.numero.toLowerCase().includes(busca.toLowerCase()));
  return (
    <form
      action={(f) => {
        if (foto) f.set("foto", foto);
        return accion(f);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="token" value={token} />
      <label className={ETIQUETA}>
        ¿A qué vivienda vas?
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busca: Casa 24, A-304…" className={CAMPO} />
      </label>
      <select name="vivienda_id" required size={Math.min(6, Math.max(2, lista.length))} className={`${CAMPO} py-2`} aria-label="Vivienda">
        {lista.map((v) => (
          <option key={v.id} value={v.id} className="py-2">
            {v.numero}
          </option>
        ))}
      </select>
      <label className={ETIQUETA}>
        Tu nombre
        <input name="visitante" required minLength={2} maxLength={120} autoComplete="name" className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        Motivo (opcional)
        <input name="motivo" maxLength={120} placeholder="Visita, entrega de comida…" className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        Tu foto (opcional, ayuda a que te reconozcan)
        <input
          type="file"
          accept="image/*"
          capture="user"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setFoto(f ? await comprimir(f, 800, 0.8) : null);
          }}
          className="text-base"
        />
      </label>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <button disabled={pendiente} className="min-h-16 rounded-2xl bg-[#17583A] text-xl font-semibold text-white disabled:opacity-60">
        {pendiente ? "Avisando…" : "Tocar el timbre"}
      </button>
    </form>
  );
}
