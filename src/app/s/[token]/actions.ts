"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { BUCKET, MAX_ENVIO, extension } from "@/lib/datos";
import { CAMPOS_SOLICITUD, TIPOS_ARCHIVO, type DatosSolicitud } from "@/lib/solicitud";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarEquipo } from "@/lib/push";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const ARCHIVOS = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

async function solicitud(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const { data } = await createAdminClient().from("solicitudes_renta").select("id, organizacion_id, estado").eq("token", token).maybeSingle();
  return data;
}

export async function enviarSolicitud(_: unknown, f: FormData): Promise<{ ok: boolean; mensaje: string; valores?: Record<string, string> }> {
  const s = await solicitud(txt(f, "token", 40));
  if (!s) return { ok: false, mensaje: "Link no válido." };
  if (s.estado === "aprobada" || s.estado === "rechazada") return { ok: false, mensaje: "Esta solicitud ya se cerró." };
  const valores = Object.fromEntries(["nombre", "telefono", "email", ...CAMPOS_SOLICITUD.map((c) => c.clave)].map((k) => [k, txt(f, k, 1000)]));
  if (f.get("autorizo") !== "on") return { ok: false, mensaje: "Necesitamos tu autorización para revisar y compartir tu información.", valores };
  const nombre = txt(f, "nombre", 120);
  const telefono = txt(f, "telefono", 30);
  if (!nombre || telefono.replace(/\D/g, "").length < 10) return { ok: false, mensaje: "Escribe tu nombre y un celular de 10 dígitos.", valores };
  const datos: DatosSolicitud = {};
  for (const c of CAMPOS_SOLICITUD) {
    const v = txt(f, c.clave, c.clave === "comentarios" ? 1000 : 160);
    if (v) datos[c.clave] = v;
  }
  const { error } = await createAdminClient()
    .from("solicitudes_renta")
    .update({ nombre, telefono, email: txt(f, "email", 160) || null, datos, estado: s.estado === "pendiente" ? "recibida" : s.estado, recibida_at: new Date().toISOString() })
    .eq("id", s.id);
  if (error) return { ok: false, mensaje: "No pudimos guardar. Intenta de nuevo." };
  revalidatePath(`/s/${txt(f, "token", 40)}`);
  if (s.estado === "pendiente") avisarEquipo(s.organizacion_id, { titulo: "Solicitud de renta recibida", cuerpo: `${nombre} llenó su solicitud. Revisa sus datos y documentos.`, url: `/solicitudes/${s.id}`, tag: `solicitud-${s.id}` });
  return { ok: true, mensaje: "¡Gracias! Recibimos tu solicitud. Ahora sube tus documentos abajo." };
}

export async function subirDocumentoSolicitud(f: FormData) {
  const token = txt(f, "token", 40);
  const s = await solicitud(token);
  if (!s) throw new Error("Link no válido.");
  if (s.estado === "aprobada" || s.estado === "rechazada") throw new Error("Esta solicitud ya se cerró.");
  const tipo = txt(f, "tipo", 20);
  if (!TIPOS_ARCHIVO.some(([v]) => v === tipo)) throw new Error("Tipo no válido.");
  const archivos = f.getAll("archivos").filter((x): x is File => x instanceof File && x.size > 0);
  if (!archivos.length) return;
  if (archivos.some((a) => !ARCHIVOS.includes(a.type))) throw new Error("Sube PDF o fotos.");
  if (archivos.reduce((t, a) => t + a.size, 0) > MAX_ENVIO) throw new Error("Pesan más de 4 MB juntos; súbelos uno por uno.");
  const admin = createAdminClient();
  const { count } = await admin.from("solicitud_archivos").select("id", { count: "exact", head: true }).eq("solicitud_id", s.id);
  if ((count ?? 0) + archivos.length > 15) throw new Error("Máximo 15 documentos.");
  for (const a of archivos) {
    const path = `${s.organizacion_id}/solicitudes/${s.id}/${tipo}-${randomUUID().slice(0, 10)}.${extension(a.name, a.type)}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, a, { contentType: a.type });
    if (error) throw new Error("No pudimos subir el archivo.");
    await admin.from("solicitud_archivos").insert({ organizacion_id: s.organizacion_id, solicitud_id: s.id, tipo, nombre: a.name.slice(0, 120), storage_path: path });
  }
  revalidatePath(`/s/${token}`);
}
