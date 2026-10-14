"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { leerDepositos } from "@/lib/conciliacion";
import { leerCSV } from "@/lib/importar";
import { analizarDepositos, registrarConciliacion, type Coincidencia } from "./actions";

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const mes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });

async function leer(archivo: File) {
  const n = archivo.name.toLowerCase();
  if (n.endsWith(".csv") || n.endsWith(".txt")) return leerCSV(await archivo.text());
  if (n.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(archivo)) as (string | number | Date | null)[][];
  }
  throw new Error("Usa el estado de cuenta en .xlsx o .csv (en tu banca en línea: Movimientos › Exportar).");
}

const ETIQUETA: Record<Coincidencia["tipo"], { texto: string; clase: string }> = {
  referencia: { texto: "Por referencia", clase: "bg-verde-claro text-verde-oscuro" },
  sugerida: { texto: "Sugerida", clase: "bg-[#FFF4E0] text-[#7A4E00]" },
  ninguna: { texto: "Sin coincidencia", clase: "bg-fondo text-gris" },
  ya_pagado: { texto: "Ya pagado", clase: "bg-fondo text-gris" },
};

export function Conciliador() {
  const [resultados, setResultados] = useState<Coincidencia[] | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();

  const elegir = (archivo: File | undefined) =>
    archivo &&
    iniciar(async () => {
      setMensaje("");
      setResultados(null);
      try {
        const { depositos, error } = leerDepositos(await leer(archivo));
        if (error) return setMensaje(error);
        const r = await analizarDepositos(depositos);
        if (r.error) return setMensaje(r.error);
        setResultados(r.resultados);
        setMarcados(new Set(r.resultados.flatMap((x, i) => (x.tipo === "referencia" && !x.nota ? [i] : []))));
      } catch (e) {
        setMensaje(e instanceof Error ? e.message : "No pudimos leer el archivo.");
      }
    });

  const registrar = () =>
    iniciar(async () => {
      const items = [...marcados].map((i) => resultados![i]).filter((x) => x.cobro).map((x) => ({ cobro_id: x.cobro!.id, fecha: x.deposito.fecha }));
      const { registrados } = await registrarConciliacion(items);
      setMensaje(`✓ Registramos ${registrados} ${registrados === 1 ? "pago" : "pagos"}.`);
      setResultados(null);
    });

  const conCobro = resultados?.filter((x) => x.cobro).length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-borde bg-white p-8 text-center hover:border-verde">
        <span className="font-bold">{pendiente ? "Leyendo…" : "Sube tu estado de cuenta"}</span>
        <span className="text-sm text-gris">Excel (.xlsx) o CSV, como lo descargas de tu banca en línea</span>
        <input type="file" accept=".xlsx,.csv,.txt" aria-label="Estado de cuenta" className="sr-only" onChange={(e) => elegir(e.currentTarget.files?.[0])} />
      </label>
      {mensaje && (
        <p role="status" className={`rounded-xl p-3 text-sm ${mensaje.startsWith("✓") ? "bg-verde-claro text-verde-oscuro" : "bg-naranja-claro text-naranja-oscuro"}`}>
          {mensaje} {mensaje.startsWith("✓") && <Link href="/pagos" className="font-bold underline">Ver pagos</Link>}
        </p>
      )}
      {resultados && (
        <section aria-label="Depósitos encontrados" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
          <h2 className="font-bold">
            {resultados.length} depósitos · {conCobro} con renta encontrada
          </h2>
          <ul className="flex flex-col divide-y divide-borde-suave text-sm">
            {resultados.map((r, i) => (
              <li key={i} className="flex items-start gap-3 py-2.5">
                <input
                  type="checkbox"
                  disabled={!r.cobro}
                  checked={marcados.has(i)}
                  aria-label={`Registrar depósito de la fila ${r.deposito.fila}`}
                  onChange={(e) => {
                    const s = new Set(marcados);
                    if (e.currentTarget.checked) s.add(i);
                    else s.delete(i);
                    setMarcados(s);
                  }}
                  className="mt-1 size-4 accent-verde"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold">{pesos.format(r.deposito.monto)}</span>
                    <span className="text-xs text-gris">{r.deposito.fecha ?? ""}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ETIQUETA[r.tipo].clase}`}>{ETIQUETA[r.tipo].texto}</span>
                  </span>
                  <span className="block truncate text-xs text-gris">{r.deposito.texto}</span>
                  {r.cobro && (
                    <span className="block font-semibold">
                      → {r.cobro.inquilino} · {r.cobro.propiedad} · <span className="first-letter:uppercase">{mes.format(new Date(`${r.cobro.periodo}T00:00:00Z`))}</span> ({pesos.format(r.cobro.total)})
                    </span>
                  )}
                  {r.nota && <span className="block text-xs text-[#7A4E00]">{r.nota}</span>}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" disabled={pendiente || !marcados.size} onClick={registrar} className="min-h-12 self-start rounded-xl bg-verde px-5 font-bold text-white disabled:opacity-50">
            {pendiente ? "Registrando…" : `Registrar ${marcados.size} ${marcados.size === 1 ? "pago" : "pagos"}`}
          </button>
        </section>
      )}
    </div>
  );
}
