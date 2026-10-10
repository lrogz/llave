"use client";

import { useState, useTransition } from "react";
import { aceptar } from "@/app/equipo/actions";

export function Aceptar({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="mt-6 flex flex-col gap-3">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await aceptar(token);
            if (r && !r.ok) setError(r.error ?? "No pudimos aceptar la invitación.");
          })
        }
        className="min-h-12 rounded-xl bg-verde font-bold text-white disabled:opacity-60"
      >
        {pendiente ? "Entrando…" : "Aceptar y entrar"}
      </button>
      {error && (
        <p role="alert" className="rounded-xl bg-naranja-claro p-3 text-sm text-naranja-oscuro">
          {error}
        </p>
      )}
    </div>
  );
}
