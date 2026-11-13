"use client";

import { useEffect, useRef, useState } from "react";

type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };

// Lee códigos QR con la cámara trasera. Usa el lector nativo del navegador si existe y, si no, jsQR.
export function Escaner({ activo, onCodigo }: { activo: boolean; onCodigo: (texto: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<"iniciando" | "listo" | "sin_camara">("iniciando");
  const ultimo = useRef<{ t: string; at: number }>({ t: "", at: 0 });
  const callback = useRef(onCodigo);
  useEffect(() => {
    callback.current = onCodigo;
  }, [onCodigo]);

  useEffect(() => {
    if (!activo) return;
    let flujo: MediaStream | null = null;
    let parar = false;
    let temporizador: ReturnType<typeof setTimeout>;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setEstado("sin_camara");
        return;
      }
      if (parar || !video.current) return flujo.getTracks().forEach((t) => t.stop());
      video.current.srcObject = flujo;
      await video.current.play().catch(() => {});
      setEstado("listo");

      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const nativo = BD ? new BD({ formats: ["qr_code"] }) : null;
      const jsQR = nativo ? null : (await import("jsqr")).default;

      const leer = async () => {
        if (parar) return;
        const v = video.current;
        let texto: string | null = null;
        if (v && v.readyState >= 2 && v.videoWidth) {
          try {
            if (nativo) {
              texto = (await nativo.detect(v))[0]?.rawValue ?? null;
            } else if (jsQR && ctx) {
              const escala = Math.min(1, 640 / v.videoWidth);
              canvas.width = v.videoWidth * escala;
              canvas.height = v.videoHeight * escala;
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              texto = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          } catch {
            /* cuadro ilegible: seguimos */
          }
        }
        // Evita mandar el mismo código varias veces seguidas mientras sigue frente a la cámara.
        if (texto && (texto !== ultimo.current.t || Date.now() - ultimo.current.at > 4000)) {
          ultimo.current = { t: texto, at: Date.now() };
          navigator.vibrate?.(60);
          callback.current(texto);
        }
        temporizador = setTimeout(leer, 220);
      };
      leer();
    })();

    return () => {
      parar = true;
      clearTimeout(temporizador);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [activo]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
      <video ref={video} playsInline muted className="h-full w-full object-cover" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-[14%] rounded-3xl border-4 border-menta/90" />
      {estado !== "listo" && (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-lg text-white">
          {estado === "iniciando" ? "Abriendo cámara…" : "No hay acceso a la cámara. Escribe el código del pase abajo o permite la cámara en el navegador."}
        </p>
      )}
    </div>
  );
}
