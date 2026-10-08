"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BUCKET,
  CATEGORIAS,
  DISPONIBILIDAD,
  MAX_ARCHIVO_REPORTE,
  MAX_ARCHIVOS_REPORTE,
  TIPOS_PERMITIDOS,
} from "@/lib/datos";
import { confirmarArchivos, crearReporte } from "./actions";

type Archivo = { id: string; file: File; url: string; duracion: number | null };
type Estado = { paso: "editando" } | { paso: "enviando"; avance: string } | { paso: "listo"; token: string } | { paso: "error"; mensaje: string };

export function ReporteForm({ codigo }: { codigo: string }) {
  const [categoria, setCategoria] = useState<string>("");
  const [descripcion, setDescripcion] = useState("");
  const [disponibilidad, setDisponibilidad] = useState<string[]>([]);
  const [urgente, setUrgente] = useState(false);
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [estado, setEstado] = useState<Estado>({ paso: "editando" });
  const fotoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState("");

  function agregar(lista: FileList | null) {
    if (!lista) return;
    setAviso("");
    const nuevos: Archivo[] = [];
    for (const file of Array.from(lista)) {
      if (!TIPOS_PERMITIDOS.includes(file.type)) {
        setAviso(`No aceptamos el formato de ${file.name}.`);
        continue;
      }
      if (file.size > MAX_ARCHIVO_REPORTE) {
        setAviso(`${file.name} pesa más de 100 MB. Graba un video más corto.`);
        continue;
      }
      nuevos.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), duracion: null });
    }
    setArchivos((prev) => {
      const todos = [...prev, ...nuevos];
      if (todos.length > MAX_ARCHIVOS_REPORTE) setAviso(`Máximo ${MAX_ARCHIVOS_REPORTE} archivos.`);
      return todos.slice(0, MAX_ARCHIVOS_REPORTE);
    });
  }

  function quitar(id: string) {
    setArchivos((prev) => prev.filter((a) => a.id !== id));
  }

  function alternar(valor: string) {
    setDisponibilidad((prev) => (prev.includes(valor) ? prev.filter((v) => v !== valor) : [...prev, valor]));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!categoria) return setAviso("Elige el tipo de problema.");
    if (descripcion.trim().length < 3) return setAviso("Cuéntanos en una frase qué pasa.");
    setAviso("");
    setEstado({ paso: "enviando", avance: "Guardando tu reporte…" });

    const res = await crearReporte(
      codigo,
      { categoria, descripcion, disponibilidad, urgente },
      archivos.map((a) => ({ nombre: a.file.name, tipo: a.file.type, tamano: a.file.size })),
    );
    if (!res.ok) return setEstado({ paso: "error", mensaje: res.error });

    const supabase = createClient();
    const subidos: { path: string; tipo: string; duracion: number | null }[] = [];
    for (let i = 0; i < res.subidas.length; i++) {
      const s = res.subidas[i];
      const a = archivos[i];
      setEstado({ paso: "enviando", avance: `Subiendo ${i + 1} de ${res.subidas.length}…` });
      const { error } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(s.path, s.token, a.file, { contentType: a.file.type });
      if (!error) subidos.push({ path: s.path, tipo: a.file.type, duracion: a.duracion });
    }
    if (subidos.length) await confirmarArchivos(res.ticketToken, subidos);
    setEstado({ paso: "listo", token: res.ticketToken });
  }

  if (estado.paso === "listo") {
    return (
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-6">
        <span className="flex size-12 items-center justify-center rounded-full bg-verde-claro text-verde-oscuro">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
        </span>
        <h2 className="font-display text-2xl font-bold">Listo, ya lo recibimos</h2>
        <p className="text-sm text-gris">Tu administrador ya tiene las fotos. Te avisaremos cuando haya fecha de visita.</p>
        <a href={`/t/${estado.token}`} className="flex min-h-12 items-center justify-center rounded-xl bg-verde font-bold text-white">
          Ver el avance de mi reporte
        </a>
        <p className="text-xs text-gris">Guarda este link para consultarlo después.</p>
      </div>
    );
  }

  const enviando = estado.paso === "enviando";

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Tipo de problema</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS.map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={categoria === valor}
              onClick={() => setCategoria(valor)}
              className={
                categoria === valor
                  ? "min-h-11 rounded-full bg-tinta px-4 text-sm font-bold text-white"
                  : "min-h-11 rounded-full border border-borde bg-white px-4 text-sm font-semibold"
              }
            >
              {texto}
            </button>
          ))}
        </div>
      </fieldset>

      <section aria-label="Fotos y video" className="flex flex-col gap-3 rounded-2xl bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">Fotos y video</h2>
          <span className="text-xs text-gris">
            {archivos.length} de {MAX_ARCHIVOS_REPORTE}
          </span>
        </div>
        {archivos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {archivos.map((a) => (
              <li key={a.id} className="relative h-24 overflow-hidden rounded-xl bg-[#D8E3DE]">
                {a.file.type.startsWith("video/") ? (
                  <video
                    src={a.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="size-full object-cover"
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration;
                      setArchivos((prev) => prev.map((x) => (x.id === a.id ? { ...x, duracion: Number.isFinite(d) ? d : null } : x)));
                    }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt="" className="size-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => quitar(a.id)}
                  aria-label={`Quitar ${a.file.name}`}
                  className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full bg-tinta/80 text-white"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fotoRef.current?.click()}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-verde bg-[#F2FAF7] text-sm font-bold text-verde-oscuro"
          >
            Tomar foto
          </button>
          <button
            type="button"
            onClick={() => videoRef.current?.click()}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-verde bg-[#F2FAF7] text-sm font-bold text-verde-oscuro"
          >
            Grabar video
          </button>
        </div>
        <input ref={fotoRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { agregar(e.target.files); e.target.value = ""; }} />
        <input ref={videoRef} type="file" accept="video/*" capture="environment" hidden onChange={(e) => { agregar(e.target.files); e.target.value = ""; }} />
        <p className="rounded-xl bg-[#FFF4E5] px-3 py-2.5 text-sm text-[#6B3A06]">
          Tip: graba 10 segundos mostrando el problema completo y de dónde parece venir.
        </p>
      </section>

      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Cuéntanos en una frase
        <textarea
          rows={2}
          maxLength={500}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Gotea debajo del lavabo y ya se hinchó el mueble"
          className="resize-none rounded-xl border border-borde bg-white px-3 py-2.5 text-base font-normal outline-none focus:border-verde"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">¿Cuándo pueden entrar a revisar?</legend>
        <div className="flex flex-wrap gap-2">
          {DISPONIBILIDAD.map(([valor, texto]) => {
            const activo = disponibilidad.includes(valor);
            return (
              <button
                key={valor}
                type="button"
                aria-pressed={activo}
                onClick={() => alternar(valor)}
                className={
                  activo
                    ? "min-h-11 rounded-xl border-2 border-verde bg-verde-claro px-3 text-sm font-bold text-verde-oscuro"
                    : "min-h-11 rounded-xl border border-borde bg-white px-3 text-sm font-semibold"
                }
              >
                {texto}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="size-5 accent-naranja" />
        Es urgente (fuga activa, sin luz, sin agua o no cierra la puerta)
      </label>

      {(aviso || estado.paso === "error") && (
        <p role="alert" className="rounded-xl bg-naranja-claro px-3 py-2.5 text-sm text-naranja-oscuro">
          {estado.paso === "error" ? estado.mensaje : aviso}
        </p>
      )}

      <button type="submit" disabled={enviando} className="min-h-13 rounded-xl bg-verde text-base font-bold text-white disabled:opacity-70">
        {enviando ? estado.avance : "Enviar reporte"}
      </button>
      <p className="-mt-2 text-center text-xs text-gris">Lo recibe tu administrador al instante.</p>
    </form>
  );
}
