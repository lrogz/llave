"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarEquipo } from "@/lib/push";
import { BUCKET } from "@/lib/datos";
import { esUuid, mensajeError } from "@/lib/condominios";

export type EstadoAlta = { ok?: boolean; error?: string } | null;
const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const MAX_FOTO = 2 * 1024 * 1024;

// Recibe el alta (INE frente y reverso + selfie ya reducidas en el celular) y la deja pendiente de revisión.
export async function enviarAlta(_: EstadoAlta, f: FormData): Promise<EstadoAlta> {
  const token = txt(f, "token", 40);
  if (!/^[A-Z0-9]{12,40}$/.test(token)) return { error: "Link no válido." };
  if (f.get("consentimiento") !== "on") return { error: "Necesitamos tu autorización para revisar tu identificación." };
  const vivienda = txt(f, "vivienda_id", 40);
  if (!esUuid(vivienda)) return { error: "Elige tu vivienda." };
  const admin = createAdminClient();
  const { data: c, error: e1 } = await admin.rpc("alta_datos", { p_token: token });
  if (e1 || !c) return { error: mensajeError(e1) };
  const cond = c as { condominio_id: string; organizacion_id: string };

  const id = randomUUID();
  const subir = async (campo: string, nombre: string) => {
    const a = f.get(campo);
    if (!(a instanceof File) || a.size === 0) return null;
    if (!a.type.startsWith("image/") || a.size > MAX_FOTO) throw new Error("Las fotos deben ser imágenes de menos de 2 MB.");
    const ruta = `${cond.organizacion_id}/condominios/${cond.condominio_id}/altas/${id}-${nombre}.jpg`;
    const { error } = await admin.storage.from(BUCKET).upload(ruta, a, { contentType: a.type });
    if (error) throw new Error("No pudimos subir las fotos. Intenta de nuevo.");
    return ruta;
  };
  let rutas: (string | null)[] = [];
  try {
    rutas = [await subir("ine_frente", "frente"), await subir("ine_reverso", "reverso"), await subir("selfie", "selfie")];
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { error } = await admin.rpc("alta_crear", {
    p_token: token,
    p_vivienda: vivienda,
    p_nombre: txt(f, "nombre", 120),
    p_telefono: txt(f, "telefono", 30),
    p_email: txt(f, "email", 160) || null,
    p_tipo: txt(f, "tipo", 20),
    p_frente: rutas[0],
    p_reverso: rutas[1],
    p_selfie: rutas[2],
    p_revision_manual: f.get("revision_manual") === "1",
  });
  if (error) {
    const sueltas = rutas.filter((r): r is string => !!r);
    if (sueltas.length) await admin.storage.from(BUCKET).remove(sueltas);
    return { error: mensajeError(error) };
  }
  avisarEquipo(cond.organizacion_id, { titulo: "Alta de residente por revisar", cuerpo: txt(f, "nombre", 120), url: `/condominios/${cond.condominio_id}?vista=viviendas`, tag: `alta-${id}` });
  return { ok: true };
}
