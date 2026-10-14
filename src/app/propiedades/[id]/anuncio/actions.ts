"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { BUCKET, MAX_ENVIO, extension } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const entero = (s: string, tope = 50) => (/^\d{1,3}$/.test(s) && Number(s) <= tope ? Number(s) : null);
const decimal = (s: string) => {
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return s && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};
const FOTOS = ["image/jpeg", "image/png", "image/webp", "image/heic"];

type Db = Awaited<ReturnType<typeof sesionConOrg>>["supabase"];
async function propiedad(supabase: Db, id: string) {
  if (!esUuid(id)) throw new Error("Propiedad no válida.");
  const { data } = await supabase.from("propiedades").select("id, renta_mensual").eq("id", id).maybeSingle();
  if (!data) throw new Error("No encontramos la propiedad.");
  return data;
}
const refrescar = (id: string) => {
  revalidatePath(`/propiedades/${id}/anuncio`);
  revalidatePath(`/propiedades/${id}`);
};

export async function guardarAnuncio(f: FormData) {
  const { supabase } = await sesionConOrg();
  const p = await propiedad(supabase, txt(f, "id", 40));
  const renta = decimal(txt(f, "renta", 20));
  const banos = decimal(txt(f, "banos", 5));
  const { error } = await supabase
    .from("propiedades")
    .update({
      renta_mensual: renta,
      recamaras: entero(txt(f, "recamaras", 3)),
      banos: banos != null && banos <= 50 ? banos : null,
      m2: decimal(txt(f, "m2", 10)),
      estacionamientos: entero(txt(f, "estacionamientos", 3)),
      amueblada: f.get("amueblada") === "on",
      mascotas: f.get("mascotas") === "on",
      descripcion_anuncio: txt(f, "descripcion", 3000) || null,
      requisitos: txt(f, "requisitos", 1000) || null,
      anuncio_whatsapp: txt(f, "whatsapp", 30) || null,
    })
    .eq("id", p.id);
  if (error) throw new Error("No pudimos guardar el anuncio.");
  refrescar(p.id);
  revalidatePath("/");
}

export async function subirFotos(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const p = await propiedad(supabase, txt(f, "id", 40));
  const archivos = f.getAll("fotos").filter((x): x is File => x instanceof File && x.size > 0);
  if (!archivos.length) throw new Error("Elige al menos una foto.");
  if (archivos.some((a) => !FOTOS.includes(a.type))) throw new Error("Solo fotos (JPG, PNG, WebP o HEIC).");
  if (archivos.reduce((s, a) => s + a.size, 0) > MAX_ENVIO) throw new Error("Son demasiadas fotos juntas (más de 4 MB). Súbelas en partes.");
  const { count } = await supabase.from("fotos_propiedad").select("id", { count: "exact", head: true }).eq("propiedad_id", p.id);
  if ((count ?? 0) + archivos.length > 20) throw new Error("Máximo 20 fotos por anuncio.");
  for (const a of archivos) {
    const path = `${org.id}/propiedades/${p.id}/anuncio-${randomUUID().slice(0, 12)}.${extension(a.name, a.type)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, a, { contentType: a.type });
    if (error) throw new Error("No pudimos subir una de las fotos.");
    await supabase.from("fotos_propiedad").insert({ organizacion_id: org.id, propiedad_id: p.id, storage_path: path });
  }
  refrescar(p.id);
}

export async function borrarFoto(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "foto_id", 40);
  if (!esUuid(id)) return;
  const { data } = await supabase.from("fotos_propiedad").select("id, propiedad_id, storage_path").eq("id", id).maybeSingle();
  if (!data) return;
  await supabase.from("fotos_propiedad").delete().eq("id", data.id);
  await supabase.storage.from(BUCKET).remove([data.storage_path]);
  refrescar(data.propiedad_id);
}

export async function publicarAnuncio(f: FormData) {
  const { supabase } = await sesionConOrg();
  const p = await propiedad(supabase, txt(f, "id", 40));
  const publicar = txt(f, "publicar", 5) === "si";
  if (publicar && !p.renta_mensual) throw new Error("Pon la renta mensual antes de publicar.");
  await supabase.from("propiedades").update({ anuncio_publicado: publicar }).eq("id", p.id);
  refrescar(p.id);
}

export async function estadoProspecto(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "prospecto_id", 40);
  const estado = txt(f, "estado", 20);
  if (!esUuid(id) || !["nuevo", "contactado", "visita", "descartado", "rentado"].includes(estado)) return;
  const { data } = await supabase.from("prospectos").update({ estado }).eq("id", id).select("propiedad_id").maybeSingle();
  if (data) refrescar(data.propiedad_id);
}
