"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InputComprimido } from "@/components/InputComprimido";
import { PieLegal } from "@/components/PieLegal";
import { subirComprobante } from "./actions";

export function ComprobanteForm({ token }: { token: string }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        setError("");
        iniciar(async () => {
          const r = await subirComprobante(token, datos);
          if (!r.ok) setError(r.error ?? "Algo salió mal.");
          else router.refresh();
        });
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-borde bg-white px-4 py-5 text-center">
        <span className="font-bold">{nombre || "Toca para elegir tu comprobante"}</span>
        <span className="text-sm text-gris">Foto o PDF · máximo 4 MB</span>
        <InputComprimido
          name="comprobante"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          required
          className="sr-only"
          onElegir={setNombre}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-naranja-claro px-3 py-2.5 text-sm text-naranja-oscuro">
          {error}
        </p>
      )}
      <button type="submit" disabled={pendiente} className="min-h-13 rounded-xl bg-verde text-base font-bold text-white disabled:opacity-60">
        {pendiente ? "Enviando…" : "Enviar comprobante"}
      </button>
      <PieLegal />
    </form>
  );
}
