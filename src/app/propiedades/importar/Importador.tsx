"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { pesos } from "@/lib/datos";
import { CAMPOS, convertir, detectarColumnas, leerCSV, MAX_FILAS, type Celda, type Clave, type Mapeo } from "@/lib/importar";
import { importarPropiedades, type Resultado } from "./actions";

const TIPO_TEXTO: Record<string, string> = {
  casa: "Casa",
  departamento: "Depa",
  local: "Local",
  oficina: "Oficina",
  unidad_condominio: "Condominio",
  otro: "Otro",
};
const ESTADO_TEXTO: Record<string, string> = { rentada: "Rentada", vacia: "Vacía", en_mantenimiento: "Mantenimiento" };

type Hoja = { archivo: string; encabezados: string[]; filas: Celda[][] };

async function leerArchivo(archivo: File): Promise<Celda[][]> {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) return leerCSV(await archivo.text());
  if (nombre.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(archivo)) as Celda[][];
  }
  throw new Error("Usa un archivo .xlsx o .csv. Si es .xls viejo, ábrelo en Excel y guárdalo como .xlsx.");
}

// El encabezado es la fila (de las primeras 10) donde más columnas reconocemos.
function separarEncabezado(datos: Celda[][]) {
  let mejor = 0;
  let puntos = -1;
  datos.slice(0, 10).forEach((fila, i) => {
    const m = detectarColumnas(fila.map((c) => String(c ?? "")));
    const p = Object.keys(m).length + (m.nombre !== undefined ? 2 : 0);
    if (p > puntos) {
      puntos = p;
      mejor = i;
    }
  });
  return { encabezados: (datos[mejor] ?? []).map((c) => String(c ?? "").trim()), filas: datos.slice(mejor + 1) };
}

export function Importador() {
  const [hoja, setHoja] = useState<Hoja | null>(null);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [guardando, iniciar] = useTransition();

  const listas = useMemo(() => {
    if (!hoja) return [];
    return hoja.filas.map((f) => convertir(f, mapeo)).filter((f) => f !== null);
  }, [hoja, mapeo]);

  async function elegir(archivo: File | undefined) {
    setError("");
    setResultado(null);
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) return setError("El archivo pesa más de 5 MB.");
    try {
      const datos = await leerArchivo(archivo);
      const { encabezados, filas } = separarEncabezado(datos);
      if (!filas.length) return setError("No encontramos filas con datos.");
      setHoja({ archivo: archivo.name, encabezados, filas });
      setMapeo(detectarColumnas(encabezados));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos leer el archivo.");
    }
  }

  function importar() {
    setError("");
    iniciar(async () => {
      try {
        const r = await importarPropiedades(listas);
        if (r.error) setError(r.error);
        else {
          setResultado(r);
          setHoja(null);
        }
      } catch {
        setError("Algo falló al guardar. Intenta de nuevo.");
      }
    });
  }

  if (resultado) {
    return (
      <section className="mt-6 max-w-2xl rounded-2xl bg-white p-6">
        <h2 className="font-display text-2xl font-bold">
          {resultado.creadas} {resultado.creadas === 1 ? "propiedad importada" : "propiedades importadas"}
        </h2>
        {resultado.duenosNuevos > 0 && (
          <p className="mt-1 text-sm text-gris">
            También dimos de alta {resultado.duenosNuevos} {resultado.duenosNuevos === 1 ? "dueño" : "dueños"}.
          </p>
        )}
        {resultado.omitidas.length > 0 && (
          <div className="mt-4 rounded-xl bg-naranja-claro p-4 text-sm">
            <p className="font-bold text-naranja-oscuro">No importamos {resultado.omitidas.length}:</p>
            <ul className="mt-2 space-y-1">
              {resultado.omitidas.slice(0, 20).map((o, i) => (
                <li key={i}>
                  <span className="font-semibold">{o.nombre}</span> — {o.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/" className="flex min-h-11 items-center rounded-xl bg-verde px-4 text-sm font-bold text-white">
            Ver mis propiedades
          </Link>
          <button onClick={() => setResultado(null)} className="min-h-11 rounded-xl border border-borde bg-white px-4 text-sm font-bold">
            Importar otro archivo
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <section className="flex max-w-2xl flex-col gap-4 rounded-2xl bg-white p-6">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-gris">
          <li>Sube tu Excel (.xlsx) o CSV tal como lo tienes. Una fila por propiedad.</li>
          <li>Revisa que cada columna quedó en su lugar.</li>
          <li>Importa. Repetidas (mismo nombre) se saltan.</li>
        </ol>
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            elegir(e.dataTransfer.files[0]);
          }}
          className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-borde px-4 py-8 text-center hover:border-verde"
        >
          <span className="font-bold">{hoja ? hoja.archivo : "Arrastra tu archivo o toca para elegir"}</span>
          <span className="text-sm text-gris">.xlsx o .csv · máximo {MAX_FILAS} propiedades</span>
          <input
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <a href="/plantilla-propiedades.csv" download className="text-sm font-semibold text-verde underline">
          ¿No tienes archivo? Descarga la plantilla
        </a>
        {error && <p role="alert" className="rounded-xl bg-naranja-claro px-4 py-3 text-sm font-semibold text-naranja-oscuro">{error}</p>}
      </section>

      {hoja && (
        <>
          <section aria-label="Columnas" className="max-w-4xl rounded-2xl bg-white p-6">
            <h2 className="font-bold">¿Qué hay en cada columna?</h2>
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {CAMPOS.map((c) => (
                <label key={c.clave} className="flex flex-col gap-1 text-sm font-semibold">
                  {c.texto}
                  {"requerido" in c && c.requerido ? " *" : ""}
                  <select
                    aria-label={c.texto}
                    value={mapeo[c.clave] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMapeo((m) => {
                        const n = { ...m };
                        if (v === "") delete n[c.clave as Clave];
                        else n[c.clave as Clave] = Number(v);
                        return n;
                      });
                    }}
                    className="min-h-11 rounded-xl border border-borde bg-white px-3 font-normal"
                  >
                    <option value="">— No viene —</option>
                    {hoja.encabezados.map((e, i) => (
                      <option key={i} value={i}>
                        {e || `Columna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section aria-label="Vista previa" className="rounded-2xl bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold">
                {listas.length} {listas.length === 1 ? "propiedad lista" : "propiedades listas"}
                {hoja.filas.length - listas.length > 0 && (
                  <span className="font-normal text-gris"> · {hoja.filas.length - listas.length} sin nombre se saltan</span>
                )}
              </h2>
              <button
                onClick={importar}
                disabled={guardando || mapeo.nombre === undefined || listas.length === 0 || listas.length > MAX_FILAS}
                className="min-h-11 rounded-xl bg-verde px-5 text-sm font-bold text-white disabled:opacity-50"
              >
                {guardando ? "Importando…" : `Importar ${listas.length}`}
              </button>
            </div>
            {mapeo.nombre === undefined && <p className="mt-2 text-sm text-naranja-oscuro">Elige qué columna trae el nombre de la propiedad.</p>}
            {listas.length > MAX_FILAS && <p className="mt-2 text-sm text-naranja-oscuro">Son más de {MAX_FILAS}; divide el archivo.</p>}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase text-gris">
                  <tr>
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3">Dirección</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pr-3 text-right">Renta</th>
                    <th className="py-2">Dueño</th>
                  </tr>
                </thead>
                <tbody>
                  {listas.slice(0, 50).map((f, i) => (
                    <tr key={i} className="border-t border-borde-suave">
                      <td className="py-2 pr-3 font-semibold">{f.nombre}</td>
                      <td className="py-2 pr-3 text-gris">{[f.direccion, f.colonia].filter(Boolean).join(", ")}</td>
                      <td className="py-2 pr-3">{TIPO_TEXTO[f.tipo]}</td>
                      <td className="py-2 pr-3">{ESTADO_TEXTO[f.estado]}</td>
                      <td className="py-2 pr-3 text-right font-mono">{f.renta != null ? pesos.format(f.renta) : "—"}</td>
                      <td className="py-2">{f.dueno ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {listas.length > 50 && <p className="mt-2 text-sm text-gris">…y {listas.length - 50} más.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
