"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { sesionConOrg } from "@/lib/sesion";
import { BUCKET, QUIEN_PAGA, TIPOS_PERMITIDOS, extension } from "@/lib/datos";

// Vercel acepta hasta ~4.5 MB por envío; las fotos se reducen en el navegador antes de subir.
const MAX_COTIZACION = 4 * 1024 * 1024;
const quienPagaValido = new Set<string>(QUIEN_PAGA.map(([v]) => v));

function texto(form: FormData, campo: string, max = 200) {
  return String(form.get(campo) ?? "").trim().slice(0, max);
}

function numero(form: FormData, campo: string) {
  const limpio = texto(form, campo).replace(/[^0-9.]/g, "");
  const n = limpio ? Number(limpio) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function ticketDeLaOrg(ticketId: string) {
  const s = await sesionConOrg();
  const { data: ticket } = await s.supabase
    .from("tickets")
    .select("id, organizacion_id, estado, propiedad_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) throw new Error("No encontramos el ticket.");
  return { ...s, ticket };
}

// Devuelve un proveedor de la organización: el elegido o uno nuevo (se reutiliza si ya existe ese teléfono).
async function resolverProveedor(
  supabase: Awaited<ReturnType<typeof sesionConOrg>>["supabase"],
  orgId: string,
  form: FormData,
  especialidad: string | null,
) {
  const elegido = texto(form, "proveedor_id");
  if (elegido && elegido !== "nuevo") return elegido;

  const nombre = texto(form, "proveedor_nombre", 120);
  const telefono = texto(form, "proveedor_telefono", 30);
  if (!nombre) throw new Error("Escribe el nombre del proveedor.");

  if (telefono) {
    const { data: existente } = await supabase
      .from("proveedores")
      .select("id")
      .eq("organizacion_id", orgId)
      .eq("telefono", telefono)
      .maybeSingle();
    if (existente) return existente.id as string;
  }

  const { data, error } = await supabase
    .from("proveedores")
    .insert({
      organizacion_id: orgId,
      nombre,
      telefono: telefono || null,
      especialidades: especialidad ? [especialidad] : [],
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("No pudimos guardar al proveedor.");
  return data.id as string;
}

async function pasarACotizando(supabase: Awaited<ReturnType<typeof sesionConOrg>>["supabase"], ticket: { id: string; estado: string }) {
  if (ticket.estado === "reportado") {
    await supabase.from("tickets").update({ estado: "cotizando" }).eq("id", ticket.id);
  }
}

// Manda el ticket a un proveedor (de los de siempre o uno nuevo). El link se abre en WhatsApp desde el panel.
export async function invitarProveedor(form: FormData) {
  const { supabase, ticket } = await ticketDeLaOrg(texto(form, "ticket_id"));
  const { data: t } = await supabase.from("tickets").select("categoria").eq("id", ticket.id).single();
  const proveedorId = await resolverProveedor(supabase, ticket.organizacion_id, form, t?.categoria ?? null);

  const { error } = await supabase
    .from("solicitudes_cotizacion")
    .upsert(
      { organizacion_id: ticket.organizacion_id, ticket_id: ticket.id, proveedor_id: proveedorId },
      { onConflict: "ticket_id,proveedor_id", ignoreDuplicates: true },
    );
  if (error) throw new Error("No pudimos crear la solicitud.");

  await pasarACotizando(supabase, ticket);
  revalidatePath(`/tickets/${ticket.id}`);
}

// La administradora sube una cotización que le llegó por fuera (PDF, foto o nota de voz).
export async function subirCotizacion(form: FormData) {
  const { supabase, ticket } = await ticketDeLaOrg(texto(form, "ticket_id"));
  const { data: t } = await supabase.from("tickets").select("categoria").eq("id", ticket.id).single();
  const proveedorId = await resolverProveedor(supabase, ticket.organizacion_id, form, t?.categoria ?? null);

  const monto = numero(form, "monto");
  const archivo = form.get("archivo");
  let archivoPath: string | null = null;

  if (archivo instanceof File && archivo.size > 0) {
    if (!TIPOS_PERMITIDOS.includes(archivo.type)) throw new Error("Formato de archivo no aceptado.");
    if (archivo.size > MAX_COTIZACION) throw new Error("El archivo pesa más de 4 MB.");
    archivoPath = `${ticket.organizacion_id}/cotizaciones/${ticket.id}/${randomUUID()}.${extension(archivo.name, archivo.type)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(archivoPath, archivo, { contentType: archivo.type });
    if (error) throw new Error("No pudimos subir el archivo.");
  }

  if (monto === null && !archivoPath) throw new Error("Pon el monto o sube el archivo de la cotización.");

  const fecha = texto(form, "fecha", 10);
  const garantia = numero(form, "garantia_dias");

  const { error } = await supabase.from("cotizaciones").insert({
    organizacion_id: ticket.organizacion_id,
    ticket_id: ticket.id,
    proveedor_id: proveedorId,
    modo: "remota",
    monto,
    garantia_dias: garantia !== null ? Math.round(garantia) : null,
    incluye_materiales: form.get("incluye_materiales") === "on",
    fechas_disponibles: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? [fecha] : [],
    archivo_path: archivoPath,
    subida_por_admin: true,
    notas: texto(form, "notas", 500) || null,
  });
  if (error) throw new Error("No pudimos guardar la cotización.");

  await pasarACotizando(supabase, ticket);
  revalidatePath(`/tickets/${ticket.id}`);
}

// Elige una cotización y crea el link de aprobación para el dueño.
export async function enviarAlDueno(form: FormData) {
  const { supabase, ticket } = await ticketDeLaOrg(texto(form, "ticket_id"));
  const cotizacionId = texto(form, "cotizacion_id");
  const quienPaga = texto(form, "quien_paga");

  const { data: propiedad } = await supabase
    .from("propiedades")
    .select("id, dueno_id")
    .eq("id", ticket.propiedad_id)
    .single();

  let duenoId = (propiedad?.dueno_id as string | null) ?? null;
  if (!duenoId) {
    const nombre = texto(form, "dueno_nombre", 120);
    if (!nombre) throw new Error("Escribe el nombre del dueño.");
    const { data: dueno, error } = await supabase
      .from("duenos")
      .insert({ organizacion_id: ticket.organizacion_id, nombre, telefono: texto(form, "dueno_telefono", 30) || null })
      .select("id")
      .single();
    if (error || !dueno) throw new Error("No pudimos guardar al dueño.");
    duenoId = dueno.id as string;
    await supabase.from("propiedades").update({ dueno_id: duenoId }).eq("id", ticket.propiedad_id);
  }

  const { data: cot } = await supabase
    .from("cotizaciones")
    .select("id")
    .eq("id", cotizacionId)
    .eq("ticket_id", ticket.id)
    .maybeSingle();
  if (!cot) throw new Error("No encontramos la cotización.");

  await supabase
    .from("cotizaciones")
    .update({ estado: "recibida" })
    .eq("ticket_id", ticket.id)
    .in("estado", ["seleccionada", "enviada_aprobacion"]);
  await supabase.from("cotizaciones").update({ estado: "enviada_aprobacion" }).eq("id", cot.id);

  const { error } = await supabase
    .from("aprobaciones")
    .insert({ organizacion_id: ticket.organizacion_id, cotizacion_id: cot.id, dueno_id: duenoId });
  if (error) throw new Error("No pudimos crear el link de aprobación.");

  await supabase
    .from("tickets")
    .update({ estado: "aprobacion", quien_paga: quienPagaValido.has(quienPaga) ? quienPaga : null })
    .eq("id", ticket.id);

  revalidatePath(`/tickets/${ticket.id}`);
}

// Cuando la administradora tiene autorización del dueño para decidir.
export async function aprobarYo(form: FormData) {
  const { supabase, ticket } = await ticketDeLaOrg(texto(form, "ticket_id"));
  const cotizacionId = texto(form, "cotizacion_id");
  const quienPaga = texto(form, "quien_paga");

  const { data: cot } = await supabase
    .from("cotizaciones")
    .select("id")
    .eq("id", cotizacionId)
    .eq("ticket_id", ticket.id)
    .maybeSingle();
  if (!cot) throw new Error("No encontramos la cotización.");

  await supabase.from("cotizaciones").update({ estado: "aprobada" }).eq("id", cot.id);
  await supabase
    .from("tickets")
    .update({ estado: "en_proceso", quien_paga: quienPagaValido.has(quienPaga) ? quienPaga : null })
    .eq("id", ticket.id);

  revalidatePath(`/tickets/${ticket.id}`);
}

export async function marcarResuelto(form: FormData) {
  const { supabase, ticket } = await ticketDeLaOrg(texto(form, "ticket_id"));
  const calificacion = Math.round(numero(form, "calificacion") ?? 0);
  const valida = calificacion >= 1 && calificacion <= 5 ? calificacion : null;

  // Fotos de cómo quedó (para el antes y después del reporte al dueño).
  const fotos = form.getAll("fotos_despues").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 3);
  const total = fotos.reduce((s, f) => s + f.size, 0);
  if (total > MAX_COTIZACION) throw new Error("Las fotos pesan más de 4 MB en total. Sube menos fotos.");
  for (const foto of fotos) {
    if (!foto.type.startsWith("image/") || !TIPOS_PERMITIDOS.includes(foto.type)) throw new Error("Solo fotos (JPG, PNG, WEBP o HEIC).");
    const path = `${ticket.organizacion_id}/tickets/${ticket.id}/despues-${randomUUID()}.${extension(foto.name, foto.type)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, foto, { contentType: foto.type });
    if (error) throw new Error("No pudimos subir la foto.");
    await supabase.from("ticket_media").insert({
      organizacion_id: ticket.organizacion_id,
      ticket_id: ticket.id,
      tipo: "foto",
      storage_path: path,
      momento: "despues",
      subido_por: "administradora",
    });
  }

  await supabase
    .from("tickets")
    .update({ estado: "resuelto", resuelto_at: new Date().toISOString(), calificacion: valida })
    .eq("id", ticket.id);

  // Suma el trabajo y la calificación al proveedor que lo hizo (solo si es de la organización).
  const { data: cot } = await supabase
    .from("cotizaciones")
    .select("proveedor_id, proveedores(organizacion_id, trabajos, calificacion)")
    .eq("ticket_id", ticket.id)
    .eq("estado", "aprobada")
    .maybeSingle();
  const prov = cot?.proveedores as unknown as { organizacion_id: string | null; trabajos: number; calificacion: number | null } | null;
  if (cot?.proveedor_id && prov && prov.organizacion_id === ticket.organizacion_id) {
    const n = prov.trabajos ?? 0;
    const promedio =
      valida === null ? prov.calificacion : Math.round((((prov.calificacion ?? valida) * n + valida) / (n + 1)) * 10) / 10;
    await supabase.from("proveedores").update({ trabajos: n + 1, calificacion: promedio }).eq("id", cot.proveedor_id);
  }

  revalidatePath(`/tickets/${ticket.id}`);
  revalidatePath("/tickets");
}

export async function cancelarTicket(form: FormData) {
  const { supabase, ticket } = await ticketDeLaOrg(texto(form, "ticket_id"));
  await supabase.from("tickets").update({ estado: "cancelado" }).eq("id", ticket.id);
  revalidatePath(`/tickets/${ticket.id}`);
  revalidatePath("/tickets");
}
