"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { responderSolicitud } from "./actions";

const chip = (activo: boolean) =>
  activo
    ? "min-h-11 rounded-xl border-2 border-menta bg-[#1E3B32] px-3 text-sm font-bold text-white"
    : "min-h-11 rounded-xl border border-[#3D4D47] px-3 text-sm font-semibold text-[#E7EEEA]";

// Próximos días hábiles (sin domingo), en formato YYYY-MM-DD de la Ciudad de México.
function proximosDias(n: number) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" });
  const etiqueta = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Mexico_City" });
  const dias: { valor: string; texto: string }[] = [];
  const d = new Date();
  while (dias.length < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) continue;
    dias.push({ valor: fmt.format(d), texto: etiqueta.format(d) });
  }
  return dias;
}

export function ProveedorForm({ token }: { token: string }) {
  const router = useRouter();
  const [modo, setModo] = useState<"remota" | "visita">("remota");
  const [monto, setMonto] = useState("");
  const [materiales, setMateriales] = useState(true);
  const [garantia, setGarantia] = useState("30");
  const [fechas, setFechas] = useState<string[]>([]);
  const [visita, setVisita] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const [dias] = useState(() => proximosDias(6));

  function alternarFecha(f: string) {
    setFechas((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f].slice(-3)));
  }

  function enviar(accion: "enviar" | "descartar") {
    setError("");
    iniciar(async () => {
      const res =
        accion === "descartar"
          ? await responderSolicitud(token, { modo: "descartar" })
          : modo === "remota"
            ? await responderSolicitud(token, { modo, monto, incluyeMateriales: materiales, garantiaDias: garantia, fechas, notas })
            : await responderSolicitud(token, { modo, visita, notas });
      if (!res.ok) setError(res.error ?? "Algo salió mal.");
      else router.refresh();
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        enviar("enviar");
      }}
    >
      <div role="group" aria-label="Cómo quieres responder" className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#1E2D28] p-1">
        {(
          [
            ["remota", "Cotizar con lo que veo"],
            ["visita", "Visita para cotizar"],
          ] as const
        ).map(([v, t]) => (
          <button
            key={v}
            type="button"
            aria-pressed={modo === v}
            onClick={() => setModo(v)}
            className={`min-h-11 rounded-lg text-sm font-bold ${modo === v ? "bg-menta text-tinta" : "text-[#E7EEEA]"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {modo === "remota" ? (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-bold text-[#B9C8C1]">
            Precio total (MXN)
            <input
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="$3,800"
              className="min-h-12 rounded-xl bg-white px-4 font-mono text-xl text-tinta outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex min-h-11 items-center gap-2.5 text-sm">
              <input type="checkbox" checked={materiales} onChange={(e) => setMateriales(e.target.checked)} className="size-5 accent-menta" />
              Incluye materiales
            </label>
            <label className="flex items-center gap-2 text-sm">
              Garantía
              <input
                inputMode="numeric"
                value={garantia}
                onChange={(e) => setGarantia(e.target.value)}
                className="min-h-11 w-16 rounded-xl bg-white px-3 text-tinta outline-none"
                aria-label="Días de garantía"
              />
              días
            </label>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-bold text-[#B9C8C1]">Fechas en que puedo hacerlo (hasta 3)</legend>
            <div className="flex flex-wrap gap-2">
              {dias.map((d) => (
                <button key={d.valor} type="button" aria-pressed={fechas.includes(d.valor)} onClick={() => alternarFecha(d.valor)} className={chip(fechas.includes(d.valor))}>
                  {d.texto}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm font-bold text-[#B9C8C1]">
          Día y hora de la visita
          <input
            type="datetime-local"
            value={visita}
            onChange={(e) => setVisita(e.target.value)}
            className="min-h-12 rounded-xl bg-white px-4 text-base text-tinta outline-none"
          />
          <span className="font-normal">Elige dentro de la disponibilidad del inquilino.</span>
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-bold text-[#B9C8C1]">
        Notas (opcional)
        <textarea
          rows={2}
          maxLength={500}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Hay que cambiar la llave de paso"
          className="resize-none rounded-xl bg-white px-3 py-2.5 text-base font-normal text-tinta outline-none"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-naranja-claro px-3 py-2.5 text-sm text-naranja-oscuro">
          {error}
        </p>
      )}

      <button type="submit" disabled={pendiente} className="min-h-13 rounded-xl bg-menta text-base font-bold text-tinta disabled:opacity-60">
        {pendiente ? "Enviando…" : modo === "remota" ? "Enviar cotización" : "Agendar visita"}
      </button>
      <button type="button" disabled={pendiente} onClick={() => enviar("descartar")} className="min-h-11 text-sm text-[#B9C8C1] underline">
        No es mi especialidad
      </button>
    </form>
  );
}
