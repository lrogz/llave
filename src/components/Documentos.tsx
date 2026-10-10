import { Boton } from "@/components/Boton";
import { InputComprimido } from "@/components/InputComprimido";
import { campo } from "@/components/Seguimiento";
import { borrarDocumento, subirDocumento } from "@/app/documentos/actions";
import { cuandoVence, hoyMX } from "@/lib/crm";
import { BUCKET, TIPOS_DOCUMENTO, etiqueta, formatoFecha } from "@/lib/datos";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;
export type Doc = { id: string; tipo: string; nombre: string; storage_path: string; vence: string | null; created_at: string };

// Links temporales (1 h) para abrir los archivos privados.
export async function conLinks<T extends { storage_path: string }>(db: Db, docs: T[]) {
  if (!docs.length) return docs.map((d) => ({ ...d, url: null as string | null }));
  const { data } = await db.storage.from(BUCKET).createSignedUrls(docs.map((d) => d.storage_path), 3600);
  const url = new Map((data ?? []).map((x) => [x.path, x.signedUrl]));
  return docs.map((d) => ({ ...d, url: url.get(d.storage_path) ?? null }));
}

export function AvisoVence({ vence }: { vence: string | null }) {
  if (!vence) return null;
  const v = cuandoVence(vence, hoyMX());
  const pronto = vence <= hoyMX(30);
  return <span className={`text-xs ${pronto ? "font-bold text-naranja-oscuro" : "text-gris"}`}>{pronto ? `Vence: ${v.texto.toLowerCase()}` : `Vence ${formatoFecha(vence)}`}</span>;
}

// Sección de documentos para la ficha de una propiedad, dueño o inquilino.
export async function SeccionDocumentos({
  db,
  ctx,
  volver,
  tipoSugerido = "contrato",
}: {
  db: Db;
  ctx: { propiedad_id?: string; dueno_id?: string; inquilino_id?: string };
  volver: string;
  tipoSugerido?: string;
}) {
  const [campoLiga, id] = Object.entries(ctx).find(([, v]) => v)!;
  const { data } = await db.from("documentos").select("id, tipo, nombre, storage_path, vence, created_at").eq(campoLiga, id!).order("created_at", { ascending: false });
  const docs = await conLinks(db, (data ?? []) as Doc[]);

  return (
    <section aria-label="Documentos" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
      <h2 className="font-bold">Documentos</h2>
      {docs.length === 0 ? (
        <p className="text-sm text-gris">Sin documentos. Sube el contrato, identificaciones o pólizas para tenerlos a la mano.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde-suave">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 text-sm">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="block truncate font-semibold text-verde hover:underline">
                    {d.nombre}
                  </a>
                ) : (
                  <span className="block truncate font-semibold">{d.nombre}</span>
                )}
                <span className="text-xs text-gris">
                  {etiqueta(TIPOS_DOCUMENTO, d.tipo)} · {formatoFecha(d.created_at)}{" "}
                </span>
                <AvisoVence vence={d.vence} />
              </span>
              <form action={borrarDocumento}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="volver" value={volver} />
                <button type="submit" aria-label={`Borrar ${d.nombre}`} className="min-h-10 px-2 text-xs font-semibold text-gris underline">
                  Borrar
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <details className="border-t border-borde-suave pt-3">
        <summary className="cursor-pointer text-sm font-bold text-verde">+ Subir documento</summary>
        <form action={subirDocumento} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="volver" value={volver} />
          <input type="hidden" name={campoLiga} value={id} />
          <select name="tipo" defaultValue={tipoSugerido} aria-label="Tipo de documento" className={campo}>
            {TIPOS_DOCUMENTO.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
          <input name="nombre" maxLength={160} placeholder="Nombre (ej. Contrato 2026)" aria-label="Nombre del documento" className={campo} />
          <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
            ¿Vence? (pólizas, contratos)
            <input type="date" name="vence" className={campo} />
          </label>
          <InputComprimido name="archivo" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" required className="text-sm" />
          <p className="text-xs text-gris">PDF o foto · máximo 4 MB</p>
          <Boton enviando="Subiendo…" className="self-start">
            Subir
          </Boton>
        </form>
      </details>
    </section>
  );
}
