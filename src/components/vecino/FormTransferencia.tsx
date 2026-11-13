"use client";

import { useActionState, useState } from "react";
import { registrarTransferencia } from "@/app/vecino/actions";
import { comprimir } from "@/components/InputComprimido";
import { Aviso, CAMPO, ETIQUETA } from "./Piezas";

export function FormTransferencia({ token, clave, hoy, sugerido }: { token: string; clave: string; hoy: string; sugerido: string }) {
  const [estado, accion, pendiente] = useActionState(registrarTransferencia, null);
  const [archivo, setArchivo] = useState<File | null>(null);
  return (
    <form
      action={async (f) => {
        if (archivo) f.set("comprobante", archivo);
        return accion(f);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="token" value={token} />
      {/* Misma clave si se reenvía: el pago no se duplica. */}
      <input type="hidden" name="clave" value={clave} />
      <label className={ETIQUETA}>
        Monto transferido
        <input name="monto" inputMode="decimal" required defaultValue={sugerido} placeholder="1,450.00" className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        Fecha
        <input type="date" name="pagado_el" required defaultValue={hoy} max={hoy} className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        Referencia o clave de rastreo (opcional)
        <input name="referencia" maxLength={60} className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        Comprobante (foto o PDF)
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setArchivo(f ? await comprimir(f) : null);
          }}
          className="text-base file:mr-3 file:min-h-12 file:rounded-xl file:border-0 file:bg-[#D5E6CF] file:px-4 file:font-semibold file:text-[#1E4D2B]"
        />
      </label>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <button type="submit" disabled={pendiente} className="min-h-16 rounded-2xl bg-[#17583A] px-5 text-xl font-semibold text-white disabled:opacity-60">
        {pendiente ? "Enviando…" : "Enviar a revisión"}
      </button>
    </form>
  );
}
