"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PadFirma } from "@/components/PadFirma";
import { firmarContrato } from "./actions";

export function FirmarContrato({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(firmarContrato, null);
  const router = useRouter();
  useEffect(() => {
    if (estado?.ok) router.refresh();
  }, [estado, router]);
  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <PadFirma />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acepto" className="mt-1 size-4 accent-verde" />
        Leí el contrato completo y acepto firmarlo electrónicamente.
      </label>
      <button type="submit" disabled={pendiente} className="min-h-13 rounded-xl bg-verde text-base font-bold text-white disabled:opacity-60">
        {pendiente ? "Guardando…" : "Firmar contrato"}
      </button>
      {estado && (
        <p role={estado.ok ? "status" : "alert"} className={`text-sm ${estado.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
