"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarEquipo } from "@/lib/push";
import { BUCKET, MAX_ENVIO, extension } from "@/lib/datos";
import { aCentavos, esToken, esUuid, mensajeError } from "@/lib/condominios";

export type Estado = { ok?: string; error?: string } | null;

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const tokenDe = (f: FormData) => {
  const t = txt(f, "token", 40);
  if (!esToken(t)) throw new Error("Link no válido.");
  return t;
};
// "2026-11-12" + "16:00" en hora de la Ciudad de México → ISO.
const instante = (fecha: string, horaTxt: string) => (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && /^\d{2}:\d{2}$/.test(horaTxt) ? `${fecha}T${horaTxt}:00-06:00` : null);

export async function crearPase(_: Estado, f: FormData): Promise<Estado> {
  const token = tokenDe(f);
  const modalidad = txt(f, "modalidad") === "recurrente" ? "recurrente" : "unico";
  const fecha = txt(f, "fecha", 10);
  let desde: string | null;
  let hasta: string | null;
  let dias: number[] | null = null;
  let horaDesde: string | null = null;
  let horaHasta: string | null = null;
  if (modalidad === "unico") {
    desde = instante(fecha, txt(f, "hora_desde", 5));
    hasta = instante(fecha, txt(f, "hora_hasta", 5));
    if (desde && hasta && hasta <= desde) hasta = new Date(new Date(hasta).getTime() + 86400_000).toISOString(); // cruza medianoche
  } else {
    desde = instante(fecha, "00:00");
    hasta = instante(txt(f, "fecha_fin", 10), "23:59");
    dias = f.getAll("dias").map(Number).filter((d) => d >= 1 && d <= 7);
    horaDesde = txt(f, "hora_desde", 5) || null;
    horaHasta = txt(f, "hora_hasta", 5) || null;
    if (!dias.length) return { error: "Elige al menos un día." };
  }
  if (!desde || !hasta) return { error: "Revisa la fecha y el horario." };
  const { data, error } = await createAdminClient().rpc("vecino_crear_pase", {
    p_token: token,
    p_visitante: txt(f, "visitante", 120),
    p_tipo_visita: txt(f, "tipo_visita", 20) || "visita",
    p_modalidad: modalidad,
    p_desde: desde,
    p_hasta: hasta,
    p_dias: dias,
    p_hora_desde: horaDesde,
    p_hora_hasta: horaHasta,
    p_placa: txt(f, "placa", 12) || null,
    p_servicio: txt(f, "servicio", 40) || null,
    p_metodo: txt(f, "metodo") === "lista" ? "lista" : "qr",
  });
  if (error || !data) return { error: mensajeError(error, "No pudimos crear el pase.") };
  revalidatePath(`/vecino/${token}`, "layout");
  redirect(`/vecino/${token}/visitas/${(data as { id: string }).id}?nuevo=1`);
}

export async function cancelarPase(f: FormData) {
  const token = tokenDe(f);
  const id = txt(f, "pase_id", 40);
  if (!esUuid(id)) return;
  const { error } = await createAdminClient().rpc("vecino_cancelar_pase", { p_token: token, p_pase: id });
  if (error) throw new Error(mensajeError(error));
  revalidatePath(`/vecino/${token}`, "layout");
}

export async function mensajeCaseta(f: FormData) {
  const token = tokenDe(f);
  const texto = txt(f, "texto", 1000);
  if (!texto) return;
  const { error } = await createAdminClient().rpc("vecino_mensaje", { p_token: token, p_texto: texto });
  if (error) throw new Error(mensajeError(error));
  revalidatePath(`/vecino/${token}/caseta`);
}

export async function crearReporte(_: Estado, f: FormData): Promise<Estado> {
  const token = tokenDe(f);
  const fotos = f.getAll("fotos").filter((x): x is File => x instanceof File && x.size > 0 && x.type.startsWith("image/")).slice(0, 4);
  if (fotos.reduce((s, x) => s + x.size, 0) > MAX_ENVIO) return { error: "Las fotos pesan demasiado. Manda menos o más pequeñas." };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("vecino_crear_reporte", {
    p_token: token,
    p_categoria: txt(f, "categoria", 30) || "otro",
    p_titulo: txt(f, "titulo", 120),
    p_descripcion: txt(f, "descripcion", 1000),
    p_ubicacion: txt(f, "ubicacion", 120),
    p_sensible: f.get("sensible") === "on",
  });
  if (error || !data) return { error: mensajeError(error, "No pudimos guardar tu reporte.") };
  const t = data as { id: string; folio: number; organizacion_id: string };
  for (const foto of fotos) {
    const path = `${t.organizacion_id}/tickets/${t.id}/${randomUUID()}.${extension(foto.name, foto.type)}`;
    const { error: e } = await admin.storage.from(BUCKET).upload(path, foto, { contentType: foto.type });
    if (!e) await admin.from("ticket_media").insert({ organizacion_id: t.organizacion_id, ticket_id: t.id, tipo: "foto", storage_path: path, momento: "reporte", subido_por: "inquilino" });
  }
  avisarEquipo(t.organizacion_id, { titulo: "Nuevo reporte de vecino", cuerpo: txt(f, "titulo", 120), url: `/tickets/${t.id}`, tag: `ticket-${t.id}` });
  revalidatePath(`/vecino/${token}`, "layout");
  redirect(`/vecino/${token}/reportes/${t.id}?nuevo=1`);
}

export async function reabrirReporte(_: Estado, f: FormData): Promise<Estado> {
  const token = tokenDe(f);
  const id = txt(f, "ticket_id", 40);
  if (!esUuid(id)) return { error: "Reporte no válido." };
  const { error } = await createAdminClient().rpc("vecino_reabrir", { p_token: token, p_ticket: id, p_motivo: txt(f, "motivo", 300) });
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/vecino/${token}`, "layout");
  return { ok: "Reabrimos tu reporte. La administración ya lo ve." };
}

export async function registrarTransferencia(_: Estado, f: FormData): Promise<Estado> {
  const token = tokenDe(f);
  const monto = aCentavos(txt(f, "monto", 20));
  if (!monto) return { error: "Escribe el monto que transferiste." };
  const fecha = txt(f, "pagado_el", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Elige la fecha de la transferencia." };
  const clave = txt(f, "clave", 40);
  if (!esUuid(clave)) return { error: "Recarga la página e intenta de nuevo." };
  const admin = createAdminClient();

  // Para saber dónde guardar el comprobante sin confiar en el navegador.
  const { data: r } = await admin.from("residentes").select("organizacion_id, condominio_id").eq("token", token).eq("activo", true).maybeSingle();
  if (!r) return { error: mensajeError({ message: "link_invalido" }) };
  let ruta: string | null = null;
  const archivo = f.get("comprobante");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > MAX_ENVIO) return { error: "El comprobante pesa más de 4 MB." };
    if (!/^(image\/|application\/pdf)/.test(archivo.type)) return { error: "Sube una foto o PDF del comprobante." };
    ruta = `${r.organizacion_id}/condominios/${r.condominio_id}/pagos/${clave}.${extension(archivo.name, archivo.type)}`;
    const { error: e } = await admin.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type, upsert: true });
    if (e) return { error: "No pudimos subir el comprobante. Intenta de nuevo." };
  }
  const { data, error } = await admin.rpc("vecino_registrar_pago", {
    p_token: token,
    p_monto_centavos: monto,
    p_referencia: txt(f, "referencia", 60),
    p_pagado_el: fecha,
    p_comprobante_path: ruta,
    p_clave: clave,
  });
  if (error) return { error: mensajeError(error) };
  if (!(data as { repetido: boolean }).repetido) {
    avisarEquipo(r.organizacion_id, { titulo: "Pago por revisar", cuerpo: "Un residente registró una transferencia.", url: `/condominios/${r.condominio_id}?vista=cuotas`, tag: `pago-${clave}` });
  }
  revalidatePath(`/vecino/${token}`, "layout");
  redirect(`/vecino/${token}/cuenta?enviado=1`);
}

export async function reservar(_: Estado, f: FormData): Promise<Estado> {
  const token = tokenDe(f);
  const amenidad = txt(f, "amenidad_id", 40);
  const inicio = instante(txt(f, "fecha", 10), txt(f, "hora", 5));
  const minutos = Number(txt(f, "minutos", 4));
  if (!esUuid(amenidad) || !inicio || !Number.isInteger(minutos)) return { error: "Elige día y horario." };
  const { data, error } = await createAdminClient().rpc("vecino_reservar", {
    p_token: token,
    p_amenidad: amenidad,
    p_inicio: inicio,
    p_minutos: minutos,
    p_personas: Math.max(1, Number(txt(f, "personas", 4)) || 1),
  });
  if (error || !data) return { error: mensajeError(error, "No pudimos reservar.") };
  revalidatePath(`/vecino/${token}`, "layout");
  const estado = (data as { estado: string }).estado;
  redirect(`/vecino/${token}/amenidades?reserva=${estado}`);
}

export async function cancelarReserva(f: FormData) {
  const token = tokenDe(f);
  const id = txt(f, "reserva_id", 40);
  if (!esUuid(id)) return;
  const { error } = await createAdminClient().rpc("vecino_cancelar_reserva", { p_token: token, p_reserva: id });
  if (error) throw new Error(mensajeError(error));
  revalidatePath(`/vecino/${token}`, "layout");
}

export async function solicitarMudanza(_: Estado, f: FormData): Promise<Estado> {
  const token = tokenDe(f);
  const fecha = txt(f, "fecha", 10);
  const inicio = instante(fecha, txt(f, "hora_desde", 5));
  const fin = instante(fecha, txt(f, "hora_hasta", 5));
  if (!inicio || !fin) return { error: "Elige fecha y horario." };
  const { error } = await createAdminClient().rpc("vecino_solicitar_mudanza", {
    p_token: token,
    p_tipo: txt(f, "tipo") === "salida" ? "salida" : "entrada",
    p_inicio: inicio,
    p_fin: fin,
    p_empresa: txt(f, "empresa", 80),
    p_placa: txt(f, "placa", 12) || null,
    p_recursos: f.getAll("recursos").map(String),
  });
  if (error) return { error: mensajeError(error, "No pudimos enviar la solicitud.") };
  const { data: r } = await createAdminClient().from("residentes").select("organizacion_id, condominio_id").eq("token", token).maybeSingle();
  if (r) avisarEquipo(r.organizacion_id, { titulo: "Mudanza por aprobar", cuerpo: txt(f, "empresa", 80), url: `/condominios/${r.condominio_id}?vista=amenidades`, tag: `mudanza-${token.slice(0, 6)}` });
  revalidatePath(`/vecino/${token}`, "layout");
  redirect(`/vecino/${token}/mudanza?enviada=1`);
}

export async function cancelarMudanza(f: FormData) {
  const token = tokenDe(f);
  const id = txt(f, "mudanza_id", 40);
  if (!esUuid(id)) return;
  const { error } = await createAdminClient().rpc("vecino_cancelar_mudanza", { p_token: token, p_mudanza: id });
  if (error) throw new Error(mensajeError(error));
  revalidatePath(`/vecino/${token}`, "layout");
}
