"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";
import { abrirSesionCaseta, cerrarSesionCaseta, esToken, esUuid, mensajeError, nuevoSecreto, sesionCaseta, sha256 } from "@/lib/condominios";
import { avisarEquipo, avisarVivienda } from "@/lib/push";
import { abrirPuerta } from "@/lib/relevador";
import { BUCKET } from "@/lib/datos";

export type Resultado = { ok: boolean; motivo?: string; error?: string; [k: string]: unknown };

const txt = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

async function turno(token: string) {
  if (!esToken(token)) throw new Error("Link no válido.");
  const s = await sesionCaseta(token);
  if (!s) throw new Error("turno_invalido");
  return s;
}

// Llama una función de caseta con el turno del dispositivo. Si el turno ya no es válido, avisa para volver a entrar.
async function rpc(token: string, fn: string, args: Record<string, unknown>): Promise<Resultado> {
  try {
    const s = await turno(token);
    const { data, error } = await createAdminClient().rpc(fn, { p_turno: s.turno, p_hash: s.hash, ...args });
    if (error) return { ok: false, error: mensajeError(error), motivo: /turno_invalido/.test(error.message) ? "sin_turno" : undefined };
    revalidatePath(`/caseta/${token}`);
    return data && typeof data === "object" && "ok" in data ? (data as Resultado) : { ok: true, data };
  } catch (e) {
    const m = (e as Error).message;
    return { ok: false, error: mensajeError({ message: m }), motivo: m === "turno_invalido" ? "sin_turno" : undefined };
  }
}

export async function iniciarTurno(_: { error?: string } | null, f: FormData): Promise<{ error?: string } | null> {
  const token = txt(f.get("token"), 40);
  const guardia = txt(f.get("guardia_id"), 40);
  if (!esToken(token) || !esUuid(guardia)) return { error: "Elige tu nombre." };
  const secreto = nuevoSecreto();
  const { data, error } = await createAdminClient().rpc("iniciar_turno", { p_caseta_token: token, p_guardia: guardia, p_pin: txt(f.get("pin"), 8), p_sesion_hash: sha256(secreto) });
  const r = data as { ok: boolean; motivo?: string; turno_id?: string } | null;
  if (error || !r) return { error: "No pudimos abrir el turno. Revisa tu conexión." };
  if (!r.ok) return { error: r.motivo === "pin" ? "PIN incorrecto." : r.motivo === "link_invalido" ? "Este link de caseta ya no es válido." : "Guardia no válido." };
  await abrirSesionCaseta(token, r.turno_id!, secreto);
  redirect(`/caseta/${token}`);
}

// Después de una entrada: avisa al residente; si fue un vetado, a la administración.
async function despues(token: string, r: Resultado) {
  if (r.ok && typeof r.vivienda_id === "string") {
    avisarVivienda(r.vivienda_id, (t) => ({ titulo: "Tu visita llegó", cuerpo: `${String(r.visitante ?? "Tu visita")} acaba de entrar.`, url: `/vecino/${t}/visitas`, tag: `visita-${String(r.acceso_id)}` }));
  }
  if (r.motivo === "vetado") {
    const { data } = await createAdminClient().from("condominios").select("id, organizacion_id").eq("caseta_token", token).maybeSingle();
    if (data) avisarEquipo(data.organizacion_id, { titulo: "🚫 Persona vetada en la entrada", cuerpo: `${String(r.visitante ?? "")}: ${String(r.detalle ?? "")}`, url: `/condominios/${data.id}?vista=seguridad`, tag: `vetado-${data.id}` });
  }
  return r;
}

export async function escanear(token: string, codigo: string) {
  const texto = txt(codigo, 300);
  // Folio corto (#123) cuando la cámara falla
  if (/^#?\d{1,7}$/.test(texto)) return despues(token, await rpc(token, "caseta_entrada", { p_codigo: texto }));
  const limpio = texto.split("/").pop()!.split("?")[0].replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (limpio.length < 8) return { ok: false, motivo: "no_existe" } as Resultado;
  // QR de un punto de rondín
  if (/\/punto\//i.test(texto)) return rpc(token, "caseta_marcar_punto", { p_codigo: limpio, p_nota: null });
  return despues(token, await rpc(token, "caseta_entrada", { p_codigo: limpio }));
}

export async function subirFotoAcceso(token: string, accesoId: string, f: FormData) {
  const foto = f.get("foto");
  if (!esUuid(accesoId) || !(foto instanceof File) || !foto.type.startsWith("image/") || foto.size > 3 * 1024 * 1024) return { ok: false, error: "Foto no válida." } as Resultado;
  const s = await sesionCaseta(token);
  if (!s) return { ok: false, motivo: "sin_turno" } as Resultado;
  const admin = createAdminClient();
  const { data: c } = await admin.from("condominios").select("id, organizacion_id").eq("caseta_token", token).maybeSingle();
  if (!c) return { ok: false, error: "Link no válido." } as Resultado;
  const ruta = `${c.organizacion_id}/condominios/${c.id}/accesos/${randomUUID()}.jpg`;
  if ((await admin.storage.from(BUCKET).upload(ruta, foto, { contentType: foto.type })).error) return { ok: false, error: "No se pudo subir la foto." } as Resultado;
  return rpc(token, "caseta_foto_acceso", { p_acceso: accesoId, p_path: ruta });
}

export async function abrirPluma(token: string, motivo: string) {
  const s = await sesionCaseta(token);
  if (!esToken(token) || !s) return { ok: false, motivo: "sin_turno" } as Resultado;
  const { data, error } = await createAdminClient().rpc("caseta_relevador", { p_turno: s.turno, p_hash: s.hash, p_puerta: "pluma" });
  if (error || !data) return { ok: false, motivo: "sin_turno" } as Resultado;
  const d = data as { condominio_id: string; url: string | null; auth: string | null; guardia: string };
  const resultado = await abrirPuerta({ condominioId: d.condominio_id, url: d.url, auth: d.auth, puerta: "pluma", motivo: txt(motivo, 120) || "Apertura desde caseta", actor: `caseta: ${d.guardia}` });
  return { ok: resultado !== "error", resultado } as Resultado;
}

export async function usarPin(token: string, pin: string, paqueteria: string) {
  if (!/^\d{6}$/.test(txt(pin, 6))) return { ok: false, motivo: "pin_invalido" } as Resultado;
  const r = await rpc(token, "caseta_usar_pin", { p_pin: txt(pin, 6), p_paqueteria: txt(paqueteria, 60) });
  if (r.ok && typeof r.vivienda_id === "string") avisarVivienda(r.vivienda_id, (t) => ({ titulo: "📦 Llegó tu paquete", cuerpo: "Está en caseta.", url: `/vecino/${t}/paquetes`, tag: `paq-${pin}` }));
  return r;
}

export async function registrarSalida(token: string, entradaId: string) {
  if (!esUuid(entradaId)) return { ok: false, error: "Entrada no válida." } as Resultado;
  return rpc(token, "caseta_salida", { p_entrada: entradaId });
}

export async function entradaDeLista(token: string, paseId: string) {
  if (!esUuid(paseId)) return { ok: false, error: "Pase no válido." } as Resultado;
  return despues(token, await rpc(token, "caseta_entrada_pase", { p_pase: paseId }));
}

export type RegistroManual = { ref: string; vivienda_id: string; tipo: "entrada" | "salida"; visitante: string; placa?: string; autorizo: string; metodo: "manual" | "sin_conexion"; ocurrio_at: string; llegada_at?: string };

export async function registroManual(token: string, r: RegistroManual) {
  if (!esUuid(r.ref) || !esUuid(r.vivienda_id)) return { ok: false, error: "Datos incompletos." } as Resultado;
  const res = await registrarManual(token, r);
  // Cuánto tardó: desde que el guardia empezó a atender hasta que quedó registrado.
  if (res.ok && typeof res.acceso_id === "string" && r.llegada_at && !Number.isNaN(Date.parse(r.llegada_at))) {
    await rpc(token, "caseta_llegada", { p_acceso: res.acceso_id, p_llegada: r.llegada_at });
  }
  return res;
}

async function registrarManual(token: string, r: RegistroManual) {
  return despues(token, await rpc(token, "caseta_manual", {
    p_vivienda: r.vivienda_id,
    p_tipo: r.tipo === "salida" ? "salida" : "entrada",
    p_visitante: txt(r.visitante, 120),
    p_placa: txt(r.placa, 12) || null,
    p_autorizo: txt(r.autorizo, 120),
    p_metodo: r.metodo === "sin_conexion" ? "sin_conexion" : "manual",
    p_ocurrio_at: Number.isNaN(Date.parse(r.ocurrio_at)) ? new Date().toISOString() : r.ocurrio_at,
    p_ref: r.ref,
  }));
}

export async function verChat(token: string, viviendaId: string) {
  if (!esUuid(viviendaId)) return { ok: false } as Resultado;
  return rpc(token, "caseta_chat", { p_vivienda: viviendaId });
}

export async function responder(token: string, viviendaId: string, texto: string) {
  if (!esUuid(viviendaId) || !txt(texto)) return { ok: false } as Resultado;
  const r = await rpc(token, "caseta_mensaje", { p_vivienda: viviendaId, p_texto: txt(texto, 1000) });
  if (r.ok) avisarVivienda(viviendaId, (t) => ({ titulo: "Caseta te respondió", cuerpo: txt(texto, 140), url: `/vecino/${t}/caseta`, tag: `chat-${viviendaId}` }));
  return r;
}

export async function marcarAtendido(token: string, viviendaId: string) {
  if (!esUuid(viviendaId)) return { ok: false } as Resultado;
  return rpc(token, "caseta_atendido", { p_vivienda: viviendaId });
}

// Sube una foto de paquetería al almacenamiento del condominio y devuelve su ruta.
async function subirFotoPaquete(token: string, foto: FormDataEntryValue | null) {
  if (!(foto instanceof File) || !foto.size) return null;
  if (!foto.type.startsWith("image/") || foto.size > 3 * 1024 * 1024) throw new Error("Foto no válida.");
  const admin = createAdminClient();
  const { data: c } = await admin.from("condominios").select("id, organizacion_id").eq("caseta_token", token).maybeSingle();
  if (!c) throw new Error("Link no válido.");
  const ruta = `${c.organizacion_id}/condominios/${c.id}/paquetes/${randomUUID()}.jpg`;
  if ((await admin.storage.from(BUCKET).upload(ruta, foto, { contentType: foto.type })).error) throw new Error("No se pudo subir la foto.");
  return ruta;
}

export async function recibirPaquete(token: string, viviendaId: string, paqueteria: string, descripcion: string, f?: FormData) {
  if (!esUuid(viviendaId)) return { ok: false, error: "Elige la vivienda." } as Resultado;
  const r = await rpc(token, "caseta_paquete", { p_vivienda: viviendaId, p_paqueteria: txt(paqueteria, 60), p_descripcion: txt(descripcion, 200) });
  if (r.ok && typeof r.data === "string" && f) {
    let foto: string | null = null;
    try {
      foto = await subirFotoPaquete(token, f.get("foto"));
    } catch {
      /* el paquete ya quedó registrado; la foto es opcional */
    }
    const seg = Number(f.get("segundos"));
    await rpc(token, "caseta_paquete_detalle", { p_paquete: r.data, p_foto: foto, p_ubicacion: txt(f.get("ubicacion"), 60) || null, p_segundos: Number.isFinite(seg) ? Math.round(seg) : null });
  }
  if (r.ok) avisarVivienda(viviendaId, (t) => ({ titulo: "📦 Llegó tu paquete", cuerpo: `${txt(paqueteria, 60) || "Un paquete"} te espera en caseta.`, url: `/vecino/${t}/paquetes`, tag: `paq-${viviendaId}` }));
  return r;
}

export async function paqueteAvisado(token: string, paqueteId: string) {
  if (!esUuid(paqueteId)) return { ok: false } as Resultado;
  return rpc(token, "caseta_paquete_avisado", { p_paquete: paqueteId });
}

export async function entregarPaquete(token: string, paqueteId: string, entregadoA: string, f?: FormData) {
  if (!esUuid(paqueteId)) return { ok: false } as Resultado;
  const r = await rpc(token, "caseta_entregar_paquete", { p_paquete: paqueteId, p_entregado_a: txt(entregadoA, 80) });
  if (r.ok && f) await evidencia(token, [paqueteId], f);
  return r;
}

async function evidencia(token: string, ids: string[], f: FormData) {
  try {
    const foto = await subirFotoPaquete(token, f.get("foto"));
    if (foto) for (const id of ids) await rpc(token, "caseta_evidencia_entrega", { p_paquete: id, p_foto: foto });
  } catch {
    /* la entrega ya quedó registrada */
  }
}

// Entrega a la persona que el residente autorizó (PIN de un solo uso).
export async function entregarATercero(token: string, f: FormData) {
  const pin = txt(f.get("pin"), 6);
  if (!/^\d{6}$/.test(pin)) return { ok: false, motivo: "pin_invalido" } as Resultado;
  const r = await rpc(token, "caseta_entregar_tercero", { p_pin: pin });
  if (r.ok) {
    if (Array.isArray(r.ids)) await evidencia(token, (r.ids as string[]).filter(esUuid), f);
    if (typeof r.vivienda_id === "string")
      avisarVivienda(r.vivienda_id, (t) => ({ titulo: "📦 Se entregó tu paquete", cuerpo: `Lo recogió ${String(r.nombre ?? "la persona que autorizaste")}.`, url: `/vecino/${t}/paquetes`, tag: `recogida-${pin}` }));
  }
  return r;
}

export async function registrarAclaracion(token: string, viviendaId: string, motivo: string) {
  return rpc(token, "caseta_aclaracion", { p_vivienda: esUuid(viviendaId) ? viviendaId : null, p_motivo: txt(motivo, 200) || "Llamada para aclarar una visita" });
}

export async function confirmarRecepcion(token: string, notas: string) {
  return rpc(token, "caseta_confirmar_recepcion", { p_notas: txt(notas, 1000) });
}

export async function cerrarTurno(f: FormData) {
  const token = txt(f.get("token"), 40);
  const r = await rpc(token, "cerrar_turno", { p_notas: txt(f.get("notas"), 1000) });
  await cerrarSesionCaseta(token);
  redirect(`/caseta/${token}${r.ok ? "?cerrado=1" : ""}`);
}

export async function salirSinCerrar(f: FormData) {
  const token = txt(f.get("token"), 40);
  if (esToken(token)) await cerrarSesionCaseta(token);
  redirect(`/caseta/${token}`);
}
