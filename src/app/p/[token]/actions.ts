"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, extension } from "@/lib/datos";

const MAX = 9 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

// El inquilino sube su comprobante desde el link (sin cuenta); se valida por token.
export async function subirComprobante(token: string, form: FormData): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, error: "Link no válido." };
  const archivo = form.get("comprobante");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elige la foto o PDF de tu comprobante." };
  if (!TIPOS.includes(archivo.type)) return { ok: false, error: "Sube una foto (JPG, PNG) o un PDF." };
  if (archivo.size > MAX) return { ok: false, error: "El archivo pesa más de 9 MB." };

  const admin = createAdminClient();
  const { data: cobro } = await admin.from("cobros_renta").select("id, organizacion_id, estado").eq("token", token).maybeSingle();
  if (!cobro) return { ok: false, error: "Link no válido." };
  if (!["pendiente", "vencido", "por_confirmar"].includes(cobro.estado)) return { ok: false, error: "Esta renta ya está registrada como pagada." };

  const path = `${cobro.organizacion_id}/comprobantes/${cobro.id}/${randomUUID()}.${extension(archivo.name, archivo.type)}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, archivo, { contentType: archivo.type });
  if (error) return { ok: false, error: "No pudimos subir el archivo. Intenta de nuevo." };

  await admin.from("cobros_renta").update({ comprobante_path: path, estado: "por_confirmar", nota: null }).eq("id", cobro.id);
  return { ok: true };
}
