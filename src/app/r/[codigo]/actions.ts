"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BUCKET,
  CATEGORIAS,
  DISPONIBILIDAD,
  MAX_ARCHIVO_REPORTE,
  MAX_ARCHIVOS_REPORTE,
  TIPOS_PERMITIDOS,
  extension,
  tipoMedia,
} from "@/lib/datos";

export type ArchivoPorSubir = { nombre: string; tipo: string; tamano: number };

type Resultado =
  | { ok: true; ticketToken: string; subidas: { path: string; token: string }[] }
  | { ok: false; error: string };

const categorias = new Set<string>(CATEGORIAS.map(([v]) => v));
const disponibles = new Set<string>(DISPONIBILIDAD.map(([v]) => v));

// Paso 1: crea el ticket y devuelve URLs firmadas para subir fotos y video directo a Storage.
export async function crearReporte(
  codigo: string,
  datos: { categoria: string; descripcion: string; disponibilidad: string[]; urgente: boolean },
  archivos: ArchivoPorSubir[],
): Promise<Resultado> {
  const descripcion = String(datos.descripcion ?? "").trim().slice(0, 500);
  if (!categorias.has(datos.categoria)) return { ok: false, error: "Elige el tipo de problema." };
  if (descripcion.length < 3) return { ok: false, error: "Cuéntanos en una frase qué pasa." };
  if (archivos.length > MAX_ARCHIVOS_REPORTE) return { ok: false, error: `Máximo ${MAX_ARCHIVOS_REPORTE} archivos.` };
  for (const a of archivos) {
    if (!TIPOS_PERMITIDOS.includes(a.tipo) || !tipoMedia(a.tipo)) return { ok: false, error: `No aceptamos ${a.nombre}.` };
    if (a.tamano > MAX_ARCHIVO_REPORTE) return { ok: false, error: `${a.nombre} pesa más de 100 MB.` };
  }
  const disponibilidad = (datos.disponibilidad ?? []).filter((d) => disponibles.has(d));

  const admin = createAdminClient();
  const { data: propiedad } = await admin
    .from("propiedades")
    .select("id, organizacion_id")
    .eq("codigo_qr", codigo)
    .maybeSingle();
  if (!propiedad) return { ok: false, error: "Este código ya no es válido. Pide uno nuevo a tu administrador." };

  const { data: contrato } = await admin
    .from("contratos")
    .select("inquilino_id")
    .eq("propiedad_id", propiedad.id)
    .eq("activo", true)
    .limit(1)
    .maybeSingle();

  const { data: ticket, error } = await admin
    .from("tickets")
    .insert({
      organizacion_id: propiedad.organizacion_id,
      propiedad_id: propiedad.id,
      inquilino_id: contrato?.inquilino_id ?? null,
      titulo: descripcion.length > 80 ? `${descripcion.slice(0, 77)}…` : descripcion,
      descripcion,
      categoria: datos.categoria,
      urgencia: datos.urgente ? "urgente" : "media",
      disponibilidad,
      canal_origen: "qr",
    })
    .select("id, token_publico")
    .single();
  if (error || !ticket) return { ok: false, error: "No pudimos guardar tu reporte. Intenta de nuevo." };

  const subidas: { path: string; token: string }[] = [];
  for (const a of archivos) {
    const path = `${propiedad.organizacion_id}/tickets/${ticket.id}/${randomUUID()}.${extension(a.nombre, a.tipo)}`;
    const { data, error: e } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (e || !data) return { ok: false, error: "No pudimos preparar la subida de archivos." };
    subidas.push({ path: data.path, token: data.token });
  }

  return { ok: true, ticketToken: ticket.token_publico, subidas };
}

// Paso 2: registra los archivos que sí llegaron a Storage.
export async function confirmarArchivos(
  ticketToken: string,
  subidos: { path: string; tipo: string; duracion?: number | null }[],
) {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select("id, organizacion_id")
    .eq("token_publico", ticketToken)
    .maybeSingle();
  if (!ticket) return { ok: false as const };

  const carpeta = `${ticket.organizacion_id}/tickets/${ticket.id}`;
  const { data: existentes } = await admin.storage.from(BUCKET).list(carpeta, { limit: 100 });
  const nombres = new Set((existentes ?? []).map((o) => `${carpeta}/${o.name}`));

  const filas = subidos
    .filter((s) => s.path.startsWith(`${carpeta}/`) && nombres.has(s.path))
    .map((s) => ({
      organizacion_id: ticket.organizacion_id,
      ticket_id: ticket.id,
      tipo: tipoMedia(s.tipo) ?? "foto",
      storage_path: s.path,
      duracion_seg: s.duracion ? Math.round(s.duracion) : null,
      momento: "reporte",
      subido_por: "inquilino",
    }));

  if (filas.length) await admin.from("ticket_media").insert(filas);
  return { ok: true as const, guardados: filas.length };
}
