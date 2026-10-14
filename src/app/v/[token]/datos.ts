import "server-only";
import { BUCKET } from "@/lib/datos";
import type { DatosAnuncio } from "@/lib/anuncio";
import { createAdminClient } from "@/lib/supabase/admin";

export type AnuncioPublico = DatosAnuncio & {
  id: string;
  organizacion_id: string;
  anuncio_whatsapp: string | null;
  foto_path: string | null;
  organizaciones: { nombre: string } | null;
};

// Solo anuncios publicados; nunca se expone la dirección exacta.
export async function anuncioPorToken(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("propiedades")
    .select("id, organizacion_id, nombre, tipo, colonia, ciudad, renta_mensual, recamaras, banos, m2, estacionamientos, amueblada, mascotas, descripcion_anuncio, requisitos, anuncio_whatsapp, foto_path, organizaciones(nombre)")
    .eq("anuncio_token", token)
    .eq("anuncio_publicado", true)
    .maybeSingle();
  return (data as unknown as AnuncioPublico | null) ?? null;
}

export async function fotosAnuncio(p: AnuncioPublico) {
  const admin = createAdminClient();
  const { data } = await admin.from("fotos_propiedad").select("storage_path").eq("propiedad_id", p.id).order("created_at");
  const rutas = [p.foto_path, ...(data ?? []).map((f) => f.storage_path as string)].filter((x): x is string => !!x);
  if (!rutas.length) return [];
  const { data: firmadas } = await admin.storage.from(BUCKET).createSignedUrls(rutas, 3600);
  return (firmadas ?? []).map((f) => f.signedUrl).filter((u): u is string => !!u);
}
