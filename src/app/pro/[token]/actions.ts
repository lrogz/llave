"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { horarioValido, type Horario } from "@/lib/agenda";
import { BUCKET, MAX_ENVIO, extension } from "@/lib/datos";
import { TIPOS_DOC_PROVEEDOR } from "@/lib/red";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarAProveedor } from "@/lib/push";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

async function proveedorDe(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) throw new Error("Link no válido.");
  const admin = createAdminClient();
  const { data } = await admin.from("proveedor_portal").select("proveedor_id").eq("token", token).maybeSingle();
  if (!data) throw new Error("Link no válido.");
  return { admin, id: data.proveedor_id as string };
}

// El proveedor marca que llegó o que terminó (queda la hora para la administradora).
export async function marcarCita(f: FormData) {
  const token = txt(f, "token", 40);
  const { admin, id } = await proveedorDe(token);
  const cita = txt(f, "cita_id", 40);
  const paso = txt(f, "paso", 10);
  const ahora = new Date().toISOString();
  if (paso === "llegue") await admin.from("citas").update({ llegada_at: ahora }).eq("id", cita).eq("proveedor_id", id).is("llegada_at", null);
  if (paso === "termine") await admin.from("citas").update({ salida_at: ahora, estado: "hecha" }).eq("id", cita).eq("proveedor_id", id).is("salida_at", null);
  revalidatePath(`/pro/${token}`);
}

export async function guardarHorario(_: unknown, f: FormData): Promise<{ ok: boolean; mensaje: string }> {
  const token = txt(f, "token", 40);
  const { admin, id } = await proveedorDe(token);
  const horario: Horario = {
    dias: f.getAll("dias").map(Number).filter((d) => d >= 0 && d <= 6),
    desde: txt(f, "desde", 5),
    hasta: txt(f, "hasta", 5),
    duracion: Number(txt(f, "duracion", 3)) || 60,
  };
  if (!horarioValido(horario)) return { ok: false, mensaje: "Elige al menos un día y un horario válido (de menor a mayor)." };
  await admin.from("proveedores").update({ horario }).eq("id", id);
  revalidatePath(`/pro/${token}`);
  return { ok: true, mensaje: "Listo: ya te pueden agendar en esos horarios." };
}

export async function guardarPerfil(f: FormData) {
  const token = txt(f, "token", 40);
  const { admin, id } = await proveedorDe(token);
  const precio = Number(txt(f, "precio_desde", 20).replace(/[^0-9.]/g, ""));
  await admin
    .from("proveedores")
    .update({ descripcion: txt(f, "descripcion", 1000) || null, precio_desde: precio > 0 ? precio : null, zonas: txt(f, "zonas", 300).split(",").map((z) => z.trim()).filter(Boolean).slice(0, 15) })
    .eq("id", id);
  revalidatePath(`/pro/${token}`);
}

const IMAGENES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

// Foto de perfil, fotos de trabajos y documentos para la verificación.
export async function subirArchivoProveedor(f: FormData) {
  const token = txt(f, "token", 40);
  const { admin, id } = await proveedorDe(token);
  const tipo = txt(f, "tipo", 20);
  const archivos = f.getAll("archivos").filter((x): x is File => x instanceof File && x.size > 0);
  if (!archivos.length) return;
  if (archivos.reduce((s, a) => s + a.size, 0) > MAX_ENVIO) throw new Error("Pesan más de 4 MB juntos; súbelos de uno en uno.");
  const esDoc = TIPOS_DOC_PROVEEDOR.some(([v]) => v === tipo);
  if (!esDoc && tipo !== "foto" && tipo !== "trabajo") throw new Error("Tipo no válido.");
  if (archivos.some((a) => !(IMAGENES.includes(a.type) || (esDoc && a.type === "application/pdf")))) throw new Error("Sube fotos (o PDF para documentos).");
  const { data: p } = await admin.from("proveedores").select("foto_path, fotos_trabajos, documentos").eq("id", id).single();
  const docs = (p?.documentos ?? []) as { tipo: string; path: string; nombre: string }[];
  const trabajos = (p?.fotos_trabajos ?? []) as string[];
  const nuevas: string[] = [];
  for (const a of archivos.slice(0, tipo === "trabajo" ? 8 : 1)) {
    const path = `red/${id}/${tipo}-${randomUUID().slice(0, 10)}.${extension(a.name, a.type)}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, a, { contentType: a.type });
    if (error) throw new Error("No pudimos subir el archivo.");
    nuevas.push(path);
    if (esDoc) docs.push({ tipo, path, nombre: a.name.slice(0, 120) });
  }
  if (tipo === "foto") {
    if (p?.foto_path) await admin.storage.from(BUCKET).remove([p.foto_path]);
    await admin.from("proveedores").update({ foto_path: nuevas[0] }).eq("id", id);
  } else if (tipo === "trabajo") {
    await admin.from("proveedores").update({ fotos_trabajos: [...trabajos, ...nuevas].slice(-12) }).eq("id", id);
  } else {
    await admin.from("proveedores").update({ documentos: docs }).eq("id", id);
  }
  revalidatePath(`/pro/${token}`);
}

// Notificaciones en el celular del proveedor (su portal instalado como app).
export async function suscribirProveedor(token: string, datos: unknown, dispositivo: string) {
  const { admin, id } = await proveedorDe(token);
  const sub = datos as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const endpoint = String(sub?.endpoint ?? "");
  const p256dh = String(sub?.keys?.p256dh ?? "");
  const auth = String(sub?.keys?.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return { ok: false };
  const { error } = await admin
    .from("suscripciones_push")
    .upsert({ endpoint, p256dh, auth, proveedor_id: id, user_id: null, organizacion_id: null, dispositivo: String(dispositivo).slice(0, 80) || null }, { onConflict: "endpoint" });
  return { ok: !error };
}

export async function desuscribirProveedor(token: string, endpoint: string) {
  const { admin, id } = await proveedorDe(token);
  await admin.from("suscripciones_push").delete().eq("endpoint", String(endpoint).slice(0, 1000)).eq("proveedor_id", id);
  return { ok: true };
}

export async function probarProveedor(token: string) {
  const { id } = await proveedorDe(token);
  const n = await enviarAProveedor(id, { titulo: "¡Listo! 🔑", cuerpo: "Así te avisaremos de trabajos nuevos y de tus visitas.", url: `/pro/${token}`, tag: "prueba" });
  return { ok: n > 0 };
}
