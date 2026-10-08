"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decidir } from "./actions";

export function DecisionForm({ token }: { token: string }) {
  const router = useRouter();
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  function enviar(decision: "aprobada" | "rechazada") {
    setError("");
    iniciar(async () => {
      const res = await decidir(token, decision, comentario);
      if (!res.ok) setError(res.error ?? "Algo salió mal.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Comentario (opcional)
        <textarea
          rows={2}
          maxLength={500}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          className="resize-none rounded-xl border border-borde bg-white px-3 py-2.5 text-base font-normal outline-none focus:border-verde"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-naranja-claro px-3 py-2.5 text-sm text-naranja-oscuro">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pendiente}
        onClick={() => enviar("aprobada")}
        className="min-h-13 rounded-xl bg-verde text-base font-bold text-white disabled:opacity-60"
      >
        {pendiente ? "Enviando…" : "Aprobar"}
      </button>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => enviar("rechazada")}
        className="min-h-12 rounded-xl border border-borde bg-white text-sm font-bold disabled:opacity-60"
      >
        Rechazar y pedir otra opción
      </button>
    </div>
  );
}
