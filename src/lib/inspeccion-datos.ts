import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "./datos";
import type { Lecturas, Partida } from "./inspeccion";

export type InspeccionCompleta = {
  id: string;
  organizacion_id: string;
  propiedad_id: string;
  tipo: string;
  fecha: string;
  token: string;
  partidas: Partida[];
  lecturas: Lecturas;
  notas: string | null;
  observaciones_inquilino: string | null;
  firma_nombre: string | null;
  firmada_at: string | null;
  propiedad: { nombre: string; direccion: string | null; colonia: string | null };
  inquilino: { nombre: string; telefono: string | null } | null;
  org: string;
  fotos: Record<string, { id: string; url: string }[]>;
  firmaUrl: string | null;
  // La entrega con la que se compara una salida o revisión.
  previa: { fecha: string; partidas: Partida[]; fotos: Record<string, { id: string; url: string }[]>; lecturas: Lecturas } | null;
};

async function fotosDe(db: SupabaseClient, inspeccionId: string) {
  const { data } = await db.from("inspeccion_fotos").select("id, partida, storage_path").eq("inspeccion_id", inspeccionId).order("created_at");
  const filas = (data ?? []) as { id: string; partida: string; storage_path: string }[];
  if (!filas.length) return {};
  const { data: firmadas } = await db.storage.from(BUCKET).createSignedUrls(filas.map((f) => f.storage_path), 3600);
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  const r: Record<string, { id: string; url: string }[]> = {};
  for (const f of filas) {
    const u = url.get(f.storage_path);
    if (u) (r[f.partida] ??= []).push({ id: f.id, url: u });
  }
  return r;
}

// Con el cliente de la administradora (por id) o con la llave de servicio (por token, para el inquilino).
export async function cargarInspeccion(db: SupabaseClient, filtro: { id: string } | { token: string }): Promise<InspeccionCompleta | null> {
  let q = db
    .from("inspecciones")
    .select("id, organizacion_id, propiedad_id, contrato_id, tipo, fecha, token, partidas, lecturas, notas, observaciones_inquilino, firma_nombre, firma_path, firmada_at, propiedades(nombre, direccion, colonia), contratos(inquilinos(nombre, telefono)), organizaciones(nombre)");
  q = "id" in filtro ? q.eq("id", filtro.id) : q.eq("token", filtro.token);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  const d = data as unknown as {
    id: string;
    organizacion_id: string;
    propiedad_id: string;
    tipo: string;
    fecha: string;
    token: string;
    partidas: Partida[];
    lecturas: Lecturas | null;
    notas: string | null;
    observaciones_inquilino: string | null;
    firma_nombre: string | null;
    firma_path: string | null;
    firmada_at: string | null;
    propiedades: { nombre: string; direccion: string | null; colonia: string | null };
    contratos: { inquilinos: { nombre: string; telefono: string | null } | null } | null;
    organizaciones: { nombre: string } | null;
  };

  let previa: InspeccionCompleta["previa"] = null;
  if (d.tipo !== "entrada") {
    const { data: p } = await db
      .from("inspecciones")
      .select("id, fecha, partidas, lecturas")
      .eq("propiedad_id", d.propiedad_id)
      .eq("tipo", "entrada")
      .lte("fecha", d.fecha)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (p) previa = { fecha: p.fecha, partidas: p.partidas as Partida[], lecturas: (p.lecturas ?? {}) as Lecturas, fotos: await fotosDe(db, p.id) };
  }
  const firmaUrl = d.firma_path ? ((await db.storage.from(BUCKET).createSignedUrl(d.firma_path, 3600)).data?.signedUrl ?? null) : null;

  return {
    id: d.id,
    organizacion_id: d.organizacion_id,
    propiedad_id: d.propiedad_id,
    tipo: d.tipo,
    fecha: d.fecha,
    token: d.token,
    partidas: d.partidas ?? [],
    lecturas: d.lecturas ?? {},
    notas: d.notas,
    observaciones_inquilino: d.observaciones_inquilino,
    firma_nombre: d.firma_nombre,
    firmada_at: d.firmada_at,
    propiedad: d.propiedades,
    inquilino: d.contratos?.inquilinos ?? null,
    org: d.organizaciones?.nombre ?? "",
    fotos: await fotosDe(db, d.id),
    firmaUrl,
    previa,
  };
}
