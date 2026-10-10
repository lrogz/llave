"use server";

import { revalidatePath } from "next/cache";
import { AVISOS, correrAvisos } from "@/lib/avisos";
import { createAdminClient } from "@/lib/supabase/admin";
import { sesionConOrg } from "@/lib/sesion";
import { origen } from "@/lib/util";

async function soyAdmin() {
  const s = await sesionConOrg();
  const { data } = await s.supabase.from("miembros").select("rol").eq("organizacion_id", s.org.id).eq("user_id", s.user.id).maybeSingle();
  if (data?.rol !== "propietario" && data?.rol !== "admin") throw new Error("Solo la dueña de la cuenta o una administradora puede cambiar esto.");
  return s;
}

export async function guardarAvisos(f: FormData) {
  const { supabase, org } = await soyAdmin();
  const avisos = Object.fromEntries(AVISOS.map((a) => [a.clave, f.get(a.clave) === "on"]));
  await supabase.from("organizaciones").update({ avisos }).eq("id", org.id);
  revalidatePath("/ajustes");
}

export async function guardarNombre(f: FormData) {
  const { supabase, org } = await soyAdmin();
  const nombre = String(f.get("nombre") ?? "").trim().slice(0, 80);
  if (!nombre) return;
  await supabase.from("organizaciones").update({ nombre }).eq("id", org.id);
  revalidatePath("/", "layout");
}

export async function cambiarContrasena(_: unknown, f: FormData): Promise<{ ok: boolean; mensaje: string }> {
  const { supabase } = await sesionConOrg();
  const nueva = String(f.get("contrasena") ?? "");
  if (nueva.length < 8) return { ok: false, mensaje: "Debe tener al menos 8 caracteres." };
  if (nueva !== String(f.get("confirmar") ?? "")) return { ok: false, mensaje: "Las dos contraseñas no coinciden." };
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) return { ok: false, mensaje: error.message.includes("different") ? "Usa una contraseña distinta a la anterior." : `No se pudo guardar: ${error.message}` };
  return { ok: true, mensaje: "Listo. Ya puedes entrar con tu correo y esta contraseña." };
}

// Corre los avisos de hoy solo para esta administradora (para probar sin esperar a mañana).
export async function mandarAhora(): Promise<{ ok: boolean; mensaje: string }> {
  const { org } = await soyAdmin();
  const r = await correrAvisos(createAdminClient(), { soloOrg: org.id, base: await origen() });
  revalidatePath("/ajustes");
  const res = r.resultados[0];
  if (!r.correo) return { ok: false, mensaje: "Falta conectar el correo (RESEND_API_KEY y AVISOS_REMITENTE en Vercel)." };
  if (res?.error) return { ok: false, mensaje: `Se mandaron ${res.enviados}. Error: ${res.error}` };
  return { ok: true, mensaje: res?.enviados ? `Se mandaron ${res.enviados} avisos.` : "Hoy no había avisos por mandar (o ya se habían mandado)." };
}
