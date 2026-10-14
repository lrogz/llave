"use client";

import { useEffect, useRef, useState } from "react";

// Recuadro para firmar con el dedo o el mouse. Deja la firma (PNG en base64) en un campo oculto "firma".
export function PadFirma({ reinicio = 0 }: { reinicio?: number }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [firma, setFirma] = useState("");

  useEffect(() => {
    const c = lienzo.current!;
    const escala = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * escala;
    c.height = c.offsetHeight * escala;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#14201C";
  }, [reinicio]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name="firma" value={firma} />
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
      <button
        type="button"
        onClick={() => {
          const c = lienzo.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          setFirma("");
        }}
        className="self-end text-sm text-gris underline"
      >
        Borrar firma
      </button>
    </div>
  );
}
