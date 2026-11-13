"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { abrirSesionCaseta, cerrarSesionCaseta, esToken, esUuid, mensajeError, nuevoSecreto, sesionCaseta, sha256 } from "@/lib/condominios";

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

export async function escanear(token: string, codigo: string) {
  const limpio = txt(codigo, 200).split("/").pop()!.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (limpio.length < 8) return { ok: false, motivo: "no_existe" } as Resultado;
  return rpc(token, "caseta_entrada", { p_codigo: limpio });
}

export async function registrarSalida(token: string, entradaId: string) {
  if (!esUuid(entradaId)) return { ok: false, error: "Entrada no válida." } as Resultado;
  return rpc(token, "caseta_salida", { p_entrada: entradaId });
}

export async function entradaDeLista(token: string, paseId: string) {
  if (!esUuid(paseId)) return { ok: false, error: "Pase no válido." } as Resultado;
  return rpc(token, "caseta_entrada_pase", { p_pase: paseId });
}

export type RegistroManual = { ref: string; vivienda_id: string; tipo: "entrada" | "salida"; visitante: string; placa?: string; autorizo: string; metodo: "manual" | "sin_conexion"; ocurrio_at: string };

export async function registroManual(token: string, r: RegistroManual) {
  if (!esUuid(r.ref) || !esUuid(r.vivienda_id)) return { ok: false, error: "Datos incompletos." } as Resultado;
  return rpc(token, "caseta_manual", {
    p_vivienda: r.vivienda_id,
    p_tipo: r.tipo === "salida" ? "salida" : "entrada",
    p_visitante: txt(r.visitante, 120),
    p_placa: txt(r.placa, 12) || null,
    p_autorizo: txt(r.autorizo, 120),
    p_metodo: r.metodo === "sin_conexion" ? "sin_conexion" : "manual",
    p_ocurrio_at: Number.isNaN(Date.parse(r.ocurrio_at)) ? new Date().toISOString() : r.ocurrio_at,
    p_ref: r.ref,
  });
}

export async function verChat(token: string, viviendaId: string) {
  if (!esUuid(viviendaId)) return { ok: false } as Resultado;
  return rpc(token, "caseta_chat", { p_vivienda: viviendaId });
}

export async function responder(token: string, viviendaId: string, texto: string) {
  if (!esUuid(viviendaId) || !txt(texto)) return { ok: false } as Resultado;
  return rpc(token, "caseta_mensaje", { p_vivienda: viviendaId, p_texto: txt(texto, 1000) });
}

export async function marcarAtendido(token: string, viviendaId: string) {
  if (!esUuid(viviendaId)) return { ok: false } as Resultado;
  return rpc(token, "caseta_atendido", { p_vivienda: viviendaId });
}

export async function recibirPaquete(token: string, viviendaId: string, paqueteria: string, descripcion: string) {
  if (!esUuid(viviendaId)) return { ok: false, error: "Elige la vivienda." } as Resultado;
  return rpc(token, "caseta_paquete", { p_vivienda: viviendaId, p_paqueteria: txt(paqueteria, 60), p_descripcion: txt(descripcion, 200) });
}

export async function paqueteAvisado(token: string, paqueteId: string) {
  if (!esUuid(paqueteId)) return { ok: false } as Resultado;
  return rpc(token, "caseta_paquete_avisado", { p_paquete: paqueteId });
}

export async function entregarPaquete(token: string, paqueteId: string, entregadoA: string) {
  if (!esUuid(paqueteId)) return { ok: false } as Resultado;
  return rpc(token, "caseta_entregar_paquete", { p_paquete: paqueteId, p_entregado_a: txt(entregadoA, 80) });
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
