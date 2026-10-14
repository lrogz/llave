"use server";

import { headers } from "next/headers";
import { BUCKET } from "@/lib/datos";
import { decodificarFirma, huella } from "@/lib/firma";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarEquipo } from "@/lib/push";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

// Firma de una de las partes desde su link. Guarda imagen, fecha, IP y dispositivo como evidencia.
export async function firmarContrato(_: unknown, f: FormData): Promise<{ ok: boolean; mensaje: string }> {
  const token = txt(f, "token", 40);
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, mensaje: "Link no válido." };
  if (f.get("acepto") !== "on") return { ok: false, mensaje: "Marca que leíste y aceptas el contrato." };
  const png = decodificarFirma(f.get("firma"));
  if (!png) return { ok: false, mensaje: "Dibuja tu firma en el recuadro." };

  const admin = createAdminClient();
  const { data: firma } = await admin.from("firmas_contrato").select("id, organizacion_id, documento_id, nombre, firmada_at, documentos_contrato(contenido, hash, estado)").eq("token", token).maybeSingle();
  if (!firma) return { ok: false, mensaje: "Link no válido." };
  if (firma.firmada_at) return { ok: true, mensaje: "Ya habías firmado. ¡Gracias!" };
  const doc = firma.documentos_contrato as unknown as { contenido: string; hash: string | null; estado: string } | null;
  if (!doc || doc.estado === "borrador") return { ok: false, mensaje: "Este contrato está en revisión; pide el link de nuevo a tu administradora." };
  if (!doc.hash || huella(doc.contenido) !== doc.hash) return { ok: false, mensaje: "El texto del contrato no coincide con el que se mandó a firmar. Avisa a tu administradora." };

  const path = `${firma.organizacion_id}/contratos/${firma.documento_id}/firma-${firma.id}.png`;
  const { error: e1 } = await admin.storage.from(BUCKET).upload(path, png, { contentType: "image/png", upsert: true });
  if (e1) return { ok: false, mensaje: "No pudimos guardar tu firma. Intenta de nuevo." };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim().slice(0, 60) || null;
  const { error } = await admin
    .from("firmas_contrato")
    .update({ firma_path: path, firmada_at: new Date().toISOString(), ip, dispositivo: (h.get("user-agent") ?? "").slice(0, 300) || null })
    .eq("id", firma.id)
    .is("firmada_at", null);
  if (error) return { ok: false, mensaje: "No pudimos guardar tu firma. Intenta de nuevo." };

  const { count } = await admin.from("firmas_contrato").select("id", { count: "exact", head: true }).eq("documento_id", firma.documento_id).is("firmada_at", null);
  if (!count) await admin.from("documentos_contrato").update({ estado: "firmado" }).eq("id", firma.documento_id);
  avisarEquipo(firma.organizacion_id, { titulo: count ? `${firma.nombre} firmó el contrato` : "Contrato firmado por todos ✓", cuerpo: count ? `Faltan ${count} ${count === 1 ? "firma" : "firmas"}.` : "Ya puedes descargarlo con sus firmas.", url: `/contratos/${firma.documento_id}`, tag: `contrato-${firma.documento_id}` });
  return { ok: true, mensaje: "¡Listo! Tu firma quedó registrada. Puedes volver a este link para consultar o descargar el contrato." };
}
