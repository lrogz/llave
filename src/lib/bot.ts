import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET, extension } from "./datos";
import { primerNombre } from "./crm";
import { descargarMedia, diezDigitos, enviarTexto } from "./whatsapp";
import { avisarEquipo } from "@/lib/push";

// Bot de reportes por WhatsApp: el inquilino escribe o manda fotos al número de Black Key
// y se crea (o se completa) su reporte, igual que con el QR.

export type MensajeEntrante = {
  id: string; // wamid
  de: string; // teléfono con lada internacional, como lo manda Meta
  nombre?: string;
  tipo: string; // text | image | video | audio | document | …
  texto?: string;
  media?: { id: string; mime?: string };
};

type Inquilino = { id: string; nombre: string; organizacion_id: string; telefono: string; propiedad: { id: string; nombre: string } };

const VENTANA_MIN = 30; // mensajes seguidos dentro de 30 min van al mismo reporte
const TIPO_MEDIA: Record<string, "foto" | "video" | "audio" | "pdf"> = { image: "foto", video: "video", audio: "audio", document: "pdf" };

// Busca al inquilino por los últimos 10 dígitos de su celular, con contrato activo.
async function buscarInquilino(db: SupabaseClient, telefono: string): Promise<Inquilino | null> {
  const diez = diezDigitos(telefono);
  if (diez.length !== 10) return null;
  const { data } = await db
    .from("inquilinos")
    .select("id, nombre, organizacion_id, telefono, contratos!inner(activo, created_at, propiedades(id, nombre))")
    .ilike("telefono", `%${diez.slice(-4)}%`)
    .eq("contratos.activo", true)
    .limit(50);
  const candidatos = ((data ?? []) as unknown as { id: string; nombre: string; organizacion_id: string; telefono: string; contratos: { created_at: string; propiedades: { id: string; nombre: string } | null }[] }[])
    .filter((i) => diezDigitos(i.telefono) === diez)
    .flatMap((i) => i.contratos.filter((c) => c.propiedades).map((c) => ({ i, c })))
    .sort((a, b) => b.c.created_at.localeCompare(a.c.created_at));
  const elegido = candidatos[0];
  return elegido ? { id: elegido.i.id, nombre: elegido.i.nombre, organizacion_id: elegido.i.organizacion_id, telefono: elegido.i.telefono, propiedad: elegido.c.propiedades! } : null;
}

async function responder(db: SupabaseClient, conversacion: string | null, org: string | null, telefono: string, texto: string) {
  try {
    const id = await enviarTexto(telefono, texto);
    if (conversacion && org) await db.from("mensajes").insert({ organizacion_id: org, conversacion_id: conversacion, direccion: "automatica", cuerpo: texto, externo_id: id });
  } catch {
    /* si falla la respuesta, el reporte ya quedó guardado */
  }
}

export async function procesarMensaje(db: SupabaseClient, m: MensajeEntrante, base: string) {
  const inq = await buscarInquilino(db, m.de);
  if (!inq) {
    await responder(db, null, null, m.de, "Hola 👋 No encontramos tu número con ninguna administración. Pide a tu administradora tu link para reportar, o que registre este celular en tu ficha.");
    return { estado: "desconocido" as const };
  }
  const org = inq.organizacion_id;
  const telefono = `52${diezDigitos(m.de)}`;

  // Conversación (Bandeja) y el mensaje; si Meta reintenta, el índice único lo detiene aquí.
  const { data: conv } = await db
    .from("conversaciones")
    .upsert(
      { organizacion_id: org, telefono, tipo_contacto: "inquilino", contacto_id: inq.id, propiedad_id: inq.propiedad.id, nombre: inq.nombre, sin_responder: true, ultimo_msg_at: new Date().toISOString() },
      { onConflict: "organizacion_id,telefono" },
    )
    .select("id")
    .single();
  const { data: msj, error: dup } = await db
    .from("mensajes")
    .insert({ organizacion_id: org, conversacion_id: conv!.id, direccion: "entrante", cuerpo: m.texto ?? null, externo_id: m.id })
    .select("id")
    .single();
  if (dup || !msj) return { estado: "repetido" as const };

  if (!m.texto && !(m.media && TIPO_MEDIA[m.tipo])) {
    await responder(db, conv!.id, org, m.de, "Por ahora solo recibimos texto, fotos, videos y audios. Cuéntanos qué pasa en la casa y manda una foto. 🙏");
    return { estado: "no_soportado" as const };
  }

  // ¿Hay un reporte de WhatsApp de este inquilino abierto hace menos de 30 min? Se completa ese.
  const { data: abierto } = await db
    .from("tickets")
    .select("id, folio, descripcion, token_publico")
    .eq("inquilino_id", inq.id)
    .eq("canal_origen", "whatsapp")
    .eq("estado", "reportado")
    .gte("created_at", new Date(Date.now() - VENTANA_MIN * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let ticket = abierto;
  const nuevo = !ticket;
  if (!ticket) {
    const texto = m.texto?.trim() || "Reporte por WhatsApp";
    const { data, error } = await db
      .from("tickets")
      .insert({
        organizacion_id: org,
        propiedad_id: inq.propiedad.id,
        inquilino_id: inq.id,
        titulo: texto.length > 80 ? `${texto.slice(0, 77)}…` : texto,
        descripcion: m.texto?.trim() || null,
        canal_origen: "whatsapp",
      })
      .select("id, folio, descripcion, token_publico")
      .single();
    if (error || !data) throw new Error(`No se pudo crear el ticket: ${error?.message}`);
    ticket = data;
    avisarEquipo(org, { titulo: "Nuevo reporte por WhatsApp", cuerpo: `${inq.nombre ?? "Un inquilino"}: ${(m.texto?.trim() || "mandó fotos").slice(0, 150)}`, url: `/tickets/${data.id}`, tag: `ticket-${data.id}` });
  } else if (m.texto?.trim()) {
    const descripcion = [ticket.descripcion, m.texto.trim()].filter(Boolean).join("\n");
    await db.from("tickets").update({ descripcion: descripcion.slice(0, 4000) }).eq("id", ticket.id);
  }
  await db.from("mensajes").update({ ticket_id: ticket.id }).eq("id", msj.id);

  if (m.media && TIPO_MEDIA[m.tipo]) {
    try {
      const { datos, tipo } = await descargarMedia(m.media.id);
      const path = `${org}/tickets/${ticket.id}/wa-${m.id.replace(/[^a-zA-Z0-9]/g, "").slice(-24)}.${extension("", tipo)}`;
      const { error } = await db.storage.from(BUCKET).upload(path, datos, { contentType: tipo, upsert: true });
      if (!error) {
        await db.from("ticket_media").insert({ organizacion_id: org, ticket_id: ticket.id, tipo: TIPO_MEDIA[m.tipo], storage_path: path, subido_por: "inquilino" });
        await db.from("mensajes").update({ media_path: path }).eq("id", msj.id);
      }
    } catch {
      /* sin la foto, el reporte sigue */
    }
  }

  if (nuevo) {
    await responder(
      db,
      conv!.id,
      org,
      m.de,
      `Hola ${primerNombre(inq.nombre)}, recibimos tu reporte #${ticket.folio} de ${inq.propiedad.nombre}. ✅\nPuedes mandar más fotos, videos o detalles por aquí en los próximos 30 minutos y se agregan solos.\nSigue el avance aquí: ${base}/t/${ticket.token_publico}`,
    );
  }
  return { estado: nuevo ? ("creado" as const) : ("agregado" as const), ticket: ticket.id };
}
