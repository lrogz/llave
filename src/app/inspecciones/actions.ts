"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BUCKET, MAX_ENVIO, extension } from "@/lib/datos";
import { ESTADOS_PARTIDA, cuartosIniciales, idCuarto, type Lecturas, type Partida } from "@/lib/inspeccion";
import { sesionConOrg } from "@/lib/sesion";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const ESTADOS = new Set<string>(ESTADOS_PARTIDA.map(([v]) => v));
const FOTOS = ["image/jpeg", "image/png", "image/webp", "image/heic"];

type Db = Awaited<ReturnType<typeof sesionConOrg>>["supabase"];
async function inspeccion(supabase: Db, id: string) {
  if (!esUuid(id)) throw new Error("Entrega no válida.");
  const { data } = await supabase.from("inspecciones").select("id, propiedad_id, partidas, firmada_at").eq("id", id).maybeSingle();
  if (!data) throw new Error("No encontramos la entrega.");
  if (data.firmada_at) throw new Error("Ya está firmada; no se puede cambiar.");
  return data as { id: string; propiedad_id: string; partidas: Partida[]; firmada_at: string | null };
}
const refrescar = (i: { id: string; propiedad_id: string }) => {
  revalidatePath(`/inspecciones/${i.id}`);
  revalidatePath(`/propiedades/${i.propiedad_id}`);
};

export async function crearInspeccion(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const propiedadId = txt(f, "propiedad_id", 40);
  const tipo = txt(f, "tipo", 10);
  if (!esUuid(propiedadId) || !["entrada", "salida", "rutina"].includes(tipo)) return;
  const { data: p } = await supabase.from("propiedades").select("id, recamaras, banos").eq("id", propiedadId).maybeSingle();
  if (!p) throw new Error("No encontramos la propiedad.");
  const { data: contrato } = await supabase.from("contratos").select("id").eq("propiedad_id", p.id).order("activo", { ascending: false }).order("inicio", { ascending: false }).limit(1).maybeSingle();
  // Salida y rutina usan los mismos cuartos que la última entrega, para comparar uno a uno.
  let partidas = cuartosIniciales(p.recamaras ?? null, p.banos ?? null);
  if (tipo !== "entrada") {
    const { data: previa } = await supabase.from("inspecciones").select("partidas").eq("propiedad_id", p.id).eq("tipo", "entrada").order("fecha", { ascending: false }).limit(1).maybeSingle();
    const cuartos = (previa?.partidas ?? []) as Partida[];
    if (cuartos.length) partidas = cuartos.map((c) => ({ id: c.id, cuarto: c.cuarto, estado: "", nota: "" }));
  }
  const { data, error } = await supabase
    .from("inspecciones")
    .insert({ organizacion_id: org.id, propiedad_id: p.id, contrato_id: contrato?.id ?? null, tipo, partidas })
    .select("id")
    .single();
  if (error || !data) throw new Error("No pudimos crear la entrega.");
  revalidatePath(`/propiedades/${p.id}`);
  redirect(`/inspecciones/${data.id}`);
}

export async function guardarInspeccion(f: FormData) {
  const { supabase } = await sesionConOrg();
  const i = await inspeccion(supabase, txt(f, "id", 40));
  const partidas: Partida[] = i.partidas.map((p) => {
    const estado = txt(f, `estado_${p.id}`, 10);
    return { ...p, estado: ESTADOS.has(estado) ? estado : "", nota: txt(f, `nota_${p.id}`, 1000) };
  });
  const lecturas: Lecturas = { luz: txt(f, "luz", 30), agua: txt(f, "agua", 30), gas: txt(f, "gas", 30), llaves: txt(f, "llaves", 300) };
  const fecha = txt(f, "fecha", 10);
  await supabase
    .from("inspecciones")
    .update({ partidas, lecturas, notas: txt(f, "notas", 2000) || null, ...(/^\d{4}-\d{2}-\d{2}$/.test(fecha) ? { fecha } : {}), updated_at: new Date().toISOString() })
    .eq("id", i.id);
  refrescar(i);
}

export async function agregarCuarto(f: FormData) {
  const { supabase } = await sesionConOrg();
  const i = await inspeccion(supabase, txt(f, "id", 40));
  const cuarto = txt(f, "cuarto", 60);
  if (!cuarto) return;
  let id = idCuarto(cuarto);
  while (i.partidas.some((p) => p.id === id)) id = `${id}-2`;
  await supabase.from("inspecciones").update({ partidas: [...i.partidas, { id, cuarto, estado: "", nota: "" }] }).eq("id", i.id);
  refrescar(i);
}

export async function quitarCuarto(f: FormData) {
  const { supabase } = await sesionConOrg();
  const i = await inspeccion(supabase, txt(f, "id", 40));
  const partida = txt(f, "partida", 60);
  await supabase.from("inspecciones").update({ partidas: i.partidas.filter((p) => p.id !== partida) }).eq("id", i.id);
  refrescar(i);
}

export async function subirFotosCuarto(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const i = await inspeccion(supabase, txt(f, "id", 40));
  const partida = txt(f, "partida", 60);
  if (!i.partidas.some((p) => p.id === partida)) throw new Error("Cuarto no válido.");
  const archivos = f.getAll("fotos").filter((x): x is File => x instanceof File && x.size > 0);
  if (!archivos.length) return;
  if (archivos.some((a) => !FOTOS.includes(a.type))) throw new Error("Solo fotos.");
  if (archivos.reduce((s, a) => s + a.size, 0) > MAX_ENVIO) throw new Error("Demasiadas fotos juntas (más de 4 MB). Súbelas en partes.");
  for (const a of archivos) {
    const path = `${org.id}/inspecciones/${i.id}/${partida}-${randomUUID().slice(0, 10)}.${extension(a.name, a.type)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, a, { contentType: a.type });
    if (error) throw new Error("No pudimos subir una foto.");
    await supabase.from("inspeccion_fotos").insert({ organizacion_id: org.id, inspeccion_id: i.id, partida, storage_path: path });
  }
  refrescar(i);
}

export async function borrarFotoInspeccion(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "foto_id", 40);
  if (!esUuid(id)) return;
  const { data } = await supabase.from("inspeccion_fotos").select("id, storage_path, inspecciones(id, propiedad_id)").eq("id", id).maybeSingle();
  if (!data) return;
  const { error } = await supabase.from("inspeccion_fotos").delete().eq("id", data.id);
  if (error) throw new Error("Ya está firmada; no se puede cambiar.");
  await supabase.storage.from(BUCKET).remove([data.storage_path]);
  refrescar(data.inspecciones as unknown as { id: string; propiedad_id: string });
}

export async function borrarInspeccion(f: FormData) {
  const { supabase } = await sesionConOrg();
  const i = await inspeccion(supabase, txt(f, "id", 40));
  const { data: fotos } = await supabase.from("inspeccion_fotos").select("storage_path").eq("inspeccion_id", i.id);
  const { error, count } = await supabase.from("inspecciones").delete({ count: "exact" }).eq("id", i.id);
  if (error || !count) throw new Error("Solo la dueña de la cuenta o una administradora puede borrar una entrega.");
  if (fotos?.length) await supabase.storage.from(BUCKET).remove(fotos.map((x) => x.storage_path));
  revalidatePath(`/propiedades/${i.propiedad_id}`);
  redirect(`/propiedades/${i.propiedad_id}`);
}
