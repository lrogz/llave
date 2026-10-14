"use server";

import { BUCKET } from "@/lib/datos";
import { createAdminClient } from "@/lib/supabase/admin";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

// El inquilino firma la entrega desde su link: se guarda la imagen de su firma y queda bloqueada.
export async function firmarInspeccion(_: unknown, f: FormData): Promise<{ ok: boolean; mensaje: string }> {
  const token = txt(f, "token", 40);
  const nombre = txt(f, "nombre", 120);
  const firma = String(f.get("firma") ?? "");
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, mensaje: "Link no válido." };
  if (nombre.length < 3) return { ok: false, mensaje: "Escribe tu nombre completo." };
  if (f.get("acepto") !== "on") return { ok: false, mensaje: "Marca que revisaste la entrega." };
  const m = firma.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { ok: false, mensaje: "Dibuja tu firma en el recuadro." };
  const png = Buffer.from(m[1], "base64");
  if (png.length < 500 || png.length > 400_000) return { ok: false, mensaje: "Dibuja tu firma en el recuadro." };

  const admin = createAdminClient();
  const { data: i } = await admin.from("inspecciones").select("id, organizacion_id, firmada_at").eq("token", token).maybeSingle();
  if (!i) return { ok: false, mensaje: "Link no válido." };
  if (i.firmada_at) return { ok: true, mensaje: "Ya estaba firmada. ¡Gracias!" };
  const path = `${i.organizacion_id}/inspecciones/${i.id}/firma.png`;
  const { error: e1 } = await admin.storage.from(BUCKET).upload(path, png, { contentType: "image/png", upsert: true });
  if (e1) return { ok: false, mensaje: "No pudimos guardar tu firma. Intenta de nuevo." };
  const { error } = await admin
    .from("inspecciones")
    .update({ firma_nombre: nombre, firma_path: path, firmada_at: new Date().toISOString(), firmada_inquilino: true, observaciones_inquilino: txt(f, "observaciones", 2000) || null })
    .eq("id", i.id)
    .is("firmada_at", null);
  if (error) return { ok: false, mensaje: "No pudimos guardar tu firma. Intenta de nuevo." };
  return { ok: true, mensaje: "¡Listo! Quedó firmada. Puedes volver a este link cuando quieras para consultarla." };
}
