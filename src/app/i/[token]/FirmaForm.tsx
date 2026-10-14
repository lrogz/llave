"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { firmarInspeccion } from "./actions";

const campo = "min-h-12 w-full min-w-0 rounded-xl border border-borde bg-white px-3 text-base outline-none focus:border-verde";

// Recuadro para firmar con el dedo o el mouse; la firma viaja como PNG.
export function FirmaForm({ token, nombre }: { token: string; nombre: string }) {
  const [estado, accion, pendiente] = useActionState(firmarInspeccion, null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [firma, setFirma] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (estado?.ok) router.refresh();
  }, [estado, router]);

  useEffect(() => {
    const c = lienzo.current!;
    const escala = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * escala;
    c.height = c.offsetHeight * escala;
    const ctx = c.getContext("2d")!;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#14201C";
  }, []);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const limpiar = () => {
    const c = lienzo.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setFirma("");
  };

  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="firma" value={firma} />
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Observaciones (opcional)
        <textarea name="observaciones" rows={3} maxLength={2000} placeholder="Si ves algo distinto a lo que dice aquí, escríbelo." className={`${campo} py-2 font-normal`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Tu nombre completo
        <input name="nombre" required defaultValue={nombre} autoComplete="name" className={`${campo} font-normal`} />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Tu firma</span>
        <canvas
          ref={lienzo}
          aria-label="Recuadro para firmar"
          className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-borde bg-white"
          onPointerDown={(e) => {
            dibujando.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const ctx = e.currentTarget.getContext("2d")!;
            const [x, y] = punto(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 0.1, y + 0.1);
            ctx.stroke();
          }}
          onPointerMove={(e) => {
            if (!dibujando.current) return;
            const ctx = e.currentTarget.getContext("2d")!;
            const [x, y] = punto(e);
            ctx.lineTo(x, y);
            ctx.stroke();
          }}
          onPointerUp={(e) => {
            dibujando.current = false;
            setFirma(e.currentTarget.toDataURL("image/png"));
          }}
        />
        <button type="button" onClick={limpiar} className="self-end text-sm text-gris underline">
          Borrar firma
        </button>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acepto" className="mt-1 size-4 accent-verde" />
        Revisé la casa y esta entrega cuarto por cuarto, y estoy de acuerdo (con mis observaciones, si las escribí).
      </label>
      <button type="submit" disabled={pendiente} className="min-h-13 rounded-xl bg-verde text-base font-bold text-white disabled:opacity-60">
        {pendiente ? "Guardando…" : "Firmar"}
      </button>
      {estado && (
        <p role={estado.ok ? "status" : "alert"} className={`text-sm ${estado.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
