"use client";

import { useRef, useState, useTransition } from "react";
import { InputComprimido } from "@/components/InputComprimido";
import { quitarPortada, subirPortada } from "../actions";

// Botones sobre la portada: elegir foto (se sube sola al elegirla) o quitarla.
export function CambiarPortada({ id, tieneFoto }: { id: string; tieneFoto: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState("");

  const enviar = (accion: (f: FormData) => Promise<void>, f: FormData) =>
    iniciar(async () => {
      setError("");
      try {
        await accion(f);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos guardar la foto.");
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <form ref={form} action={(f) => enviar(subirPortada, f)} className="flex gap-2">
        <input type="hidden" name="id" value={id} />
        <label className="flex min-h-10 cursor-pointer items-center rounded-xl bg-white/95 px-3 text-sm font-bold shadow-sm hover:bg-white">
          {pendiente ? "Subiendo…" : tieneFoto ? "Cambiar foto" : "Poner foto de portada"}
          <InputComprimido
            name="foto"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="sr-only"
            onElegir={() => form.current?.requestSubmit()}
          />
        </label>
        {tieneFoto && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              const f = new FormData();
              f.set("id", id);
              enviar(quitarPortada, f);
            }}
            className="min-h-10 rounded-xl bg-white/80 px-3 text-sm font-semibold text-gris hover:bg-white"
          >
            Quitar
          </button>
        )}
      </form>
      {error && (
        <p role="alert" className="rounded-lg bg-white px-2 py-1 text-xs text-naranja-oscuro">
          {error}
        </p>
      )}
    </div>
  );
}
