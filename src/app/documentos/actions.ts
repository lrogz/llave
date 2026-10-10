"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { BUCKET, MAX_ENVIO, TIPOS_DOCUMENTO, extension } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const TIPOS = new Set<string>(TIPOS_DOCUMENTO.map(([v]) => v));
const ARCHIVOS = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

function volverA(f: FormData) {
  const v = txt(f, "volver", 120);
  return /^\/((propiedades|personas\/(duenos|inquilinos))\/[0-9a-f-]{36}|documentos|hoy)$/i.test(v) ? v : "/documentos";
}

export async function subirDocumento(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const archivo = f.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Elige el archivo.");
  if (!ARCHIVOS.includes(archivo.type)) throw new Error("Sube un PDF o una foto.");
  if (archivo.size > MAX_ENVIO) throw new Error("El archivo pesa más de 4 MB.");

  // Liga el documento solo a registros de esta administradora (RLS).
  const liga: { propiedad_id: string | null; dueno_id: string | null; inquilino_id: string | null } = { propiedad_id: null, dueno_id: null, inquilino_id: null };
  for (const [campo, tabla] of [
    ["propiedad_id", "propiedades"],
    ["dueno_id", "duenos"],
    ["inquilino_id", "inquilinos"],
  ] as const) {
    const id = txt(f, campo, 40);
    if (esUuid(id)) liga[campo] = (await supabase.from(tabla).select("id").eq("id", id).maybeSingle()).data?.id ?? null;
  }
  if (!liga.propiedad_id && !liga.dueno_id && !liga.inquilino_id) throw new Error("No encontramos a quién pertenece el documento.");

  const tipo = txt(f, "tipo", 30);
  const vence = txt(f, "vence", 10);
  const nombre = txt(f, "nombre", 160) || archivo.name.slice(0, 160);
  const path = `${org.id}/documentos/${randomUUID()}.${extension(archivo.name, archivo.type)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, archivo, { contentType: archivo.type });
  if (error) throw new Error("No pudimos subir el archivo.");

  await supabase.from("documentos").insert({
    organizacion_id: org.id,
    ...liga,
    tipo: TIPOS.has(tipo) ? tipo : "otro",
    nombre,
    storage_path: path,
    vence: /^\d{4}-\d{2}-\d{2}$/.test(vence) ? vence : null,
  });
  revalidatePath(volverA(f));
  revalidatePath("/documentos");
}

export async function borrarDocumento(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "id", 40);
  if (!esUuid(id)) return;
  const { data } = await supabase.from("documentos").select("id, storage_path").eq("id", id).maybeSingle();
  if (!data) return;
  const { error } = await supabase.from("documentos").delete().eq("id", data.id);
  if (error) throw new Error("Solo la dueña de la cuenta puede borrar documentos.");
  await supabase.storage.from(BUCKET).remove([data.storage_path]);
  revalidatePath(volverA(f));
  revalidatePath("/documentos");
}
