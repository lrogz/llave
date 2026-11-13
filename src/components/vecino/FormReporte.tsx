"use client";

import { useActionState, useState } from "react";
import { crearReporte, reabrirReporte } from "@/app/vecino/actions";
import { comprimir } from "@/components/InputComprimido";
import { CATEGORIAS_VECINO } from "@/lib/condominios-datos";
import { Aviso, CAMPO, ETIQUETA } from "./Piezas";

export function FormReporte({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(crearReporte, null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [previas, setPrevias] = useState<string[]>([]);
  return (
    <form
      action={async (f) => {
        f.delete("fotos");
        fotos.forEach((x) => f.append("fotos", x));
        return accion(f);
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="token" value={token} />
      <label className={ETIQUETA}>
        ¿Qué pasa?
        <input name="titulo" required minLength={3} maxLength={120} placeholder="Fuga de agua en el andador" className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        Tipo
        <select name="categoria" className={CAMPO} defaultValue="otro">
          {CATEGORIAS_VECINO.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className={ETIQUETA}>
        ¿Dónde?
        <input name="ubicacion" maxLength={120} placeholder="Frente a la Casa 12" className={CAMPO} />
      </label>
      <label className={ETIQUETA}>
        Detalles (opcional)
        <textarea name="descripcion" rows={3} maxLength={1000} className={`${CAMPO} py-3`} />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-base font-semibold">Fotos (hasta 4)</span>
        <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#9C978A] bg-[#FBF9F4] text-lg">
          Tomar o elegir fotos
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={async (e) => {
              const elegidas = Array.from(e.target.files ?? []).slice(0, 4);
              const listas = await Promise.all(elegidas.map((x) => comprimir(x)));
              setFotos(listas);
              setPrevias(listas.map((x) => URL.createObjectURL(x)));
            }}
          />
        </label>
        {previas.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {previas.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="" className="aspect-square w-full rounded-lg object-cover" />
            ))}
          </div>
        )}
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-[#E1DCD0] bg-[#FBF9F4] p-4 text-base">
        <input type="checkbox" name="sensible" className="mt-1 size-5 accent-[#17583A]" />
        <span>
          <b>Queja privada.</b> Solo la ve la administración (no el comité ni el personal). Úsala para temas de convivencia o seguridad.
        </span>
      </label>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <button type="submit" disabled={pendiente} className="min-h-16 rounded-2xl bg-[#17583A] px-5 text-xl font-semibold text-white disabled:opacity-60">
        {pendiente ? "Enviando…" : "Enviar reporte"}
      </button>
    </form>
  );
}

export function FormReabrir({ token, ticketId }: { token: string; ticketId: string }) {
  const [estado, accion, pendiente] = useActionState(reabrirReporte, null);
  if (estado?.ok) return <Aviso>{estado.ok}</Aviso>;
  return (
    <form action={accion} className="flex flex-col gap-3 rounded-2xl border border-[#E1DCD0] bg-[#FBF9F4] p-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="ticket_id" value={ticketId} />
      <label className={ETIQUETA}>
        ¿No quedó resuelto?
        <input name="motivo" required minLength={3} maxLength={300} placeholder="Volvió a fallar desde ayer" className={CAMPO} />
      </label>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <button type="submit" disabled={pendiente} className="min-h-13 rounded-xl border border-[#BDB8AC] bg-white px-4 text-lg font-semibold disabled:opacity-60">
        {pendiente ? "Reabriendo…" : "Reabrir reporte"}
      </button>
    </form>
  );
}
