"use client";

import { useEffect, useRef, useState } from "react";
import { PARTES_PAGO, QUIEN_PAGA, type Reparto } from "@/lib/datos";

const campo = "min-h-11 w-full min-w-0 rounded-xl border border-borde bg-white px-3 text-sm font-normal text-tinta outline-none focus:border-verde";

// Selector "Quién paga" con "Otro" (¿quién?) y "Compartido": porcentajes por parte que deben sumar 100.
export function QuienPaga({
  defaultValue = "dueno",
  reparto,
  etiqueta = "Quién paga",
  prefijo = "",
  className = "",
}: {
  defaultValue?: string | null;
  reparto?: Reparto | null;
  etiqueta?: string | null;
  prefijo?: string;
  className?: string;
}) {
  const [quien, setQuien] = useState(defaultValue ?? "dueno");
  const inicial = Object.fromEntries(PARTES_PAGO.map(([v]) => [v, reparto?.[v] != null ? String(reparto[v]) : v === "dueno" || v === "inquilino" ? "50" : ""]));
  const [pcts, setPcts] = useState<Record<string, string>>(inicial);
  const suma = Object.values(pcts).reduce((s, x) => s + (Number(x) || 0), 0);
  const primero = useRef<HTMLInputElement>(null);
  // Que el formulario no se envíe si los porcentajes no suman 100.
  useEffect(() => {
    primero.current?.setCustomValidity(quien === "compartido" && Math.abs(suma - 100) > 0.01 ? "Los porcentajes deben sumar 100%." : "");
  }, [quien, suma]);
  const conOtro = quien === "otro" || (quien === "compartido" && Number(pcts.otro) > 0);
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
        {etiqueta}
        <select name="quien_paga" value={quien} onChange={(e) => setQuien(e.target.value)} aria-label={etiqueta ?? "Quién paga"} className={campo}>
          {QUIEN_PAGA.map(([v, t]) => (
            <option key={v} value={v}>
              {prefijo}
              {t}
            </option>
          ))}
        </select>
      </label>
      {quien === "compartido" && (
        <fieldset className="flex flex-col gap-2 rounded-xl bg-fondo p-3">
          <legend className="sr-only">Porcentajes</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PARTES_PAGO.map(([v, t], i) => (
              <label key={v} className="flex flex-col gap-1 text-xs font-semibold text-gris">
                {t}
                <span className="relative">
                  <input
                    ref={i === 0 ? primero : undefined}
                    name={`pct_${v}`}
                    inputMode="decimal"
                    value={pcts[v]}
                    onChange={(e) => setPcts({ ...pcts, [v]: e.target.value.replace(/[^0-9.]/g, "") })}
                    placeholder="0"
                    aria-label={`% ${t}`}
                    className={`${campo} pr-8`}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-gris">%</span>
                </span>
              </label>
            ))}
          </div>
          <span role="status" className={`text-xs font-semibold ${Math.abs(suma - 100) < 0.01 ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
            {Math.abs(suma - 100) < 0.01 ? "✓ Suman 100%" : `Suman ${suma}%: deben sumar 100%`}
          </span>
        </fieldset>
      )}
      {conOtro && <input name="pago_otro" defaultValue={reparto?.otro_nombre ?? ""} maxLength={80} placeholder="¿Quién? (p. ej. junta de vecinos, aseguradora)" aria-label="Quién es otro" className={campo} />}
    </div>
  );
}
