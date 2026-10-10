"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sesionConOrg } from "@/lib/sesion";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function invitar(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const email = txt(f, "email", 160).toLowerCase();
  const rol = txt(f, "rol", 10) === "admin" ? "admin" : "staff";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Escribe un correo válido.");
  const { data: ya } = await supabase.from("miembros").select("user_id").eq("organizacion_id", org.id).ilike("email", email).maybeSingle();
  if (ya) throw new Error("Esa persona ya está en tu equipo.");
  const { error } = await supabase.from("invitaciones").insert({ organizacion_id: org.id, email, rol });
  if (error) throw new Error(error.code === "23505" ? "Ya hay una invitación pendiente para ese correo." : "Solo la dueña o una administradora puede invitar.");
  revalidatePath("/equipo");
}

export async function cancelarInvitacion(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "id", 40);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await supabase.from("invitaciones").delete().eq("id", id);
  revalidatePath("/equipo");
}

export async function quitarMiembro(f: FormData) {
  const { supabase, org, user } = await sesionConOrg();
  const uid = txt(f, "user_id", 40);
  if (!/^[0-9a-f-]{36}$/i.test(uid) || uid === user.id) return;
  const { data: m } = await supabase.from("miembros").select("rol").eq("organizacion_id", org.id).eq("user_id", uid).maybeSingle();
  if (!m || m.rol === "propietario") return; // a la dueña de la cuenta no se le puede quitar
  const { error } = await supabase.from("miembros").delete().eq("organizacion_id", org.id).eq("user_id", uid);
  if (error) throw new Error("Solo la dueña o una administradora puede quitar personas.");
  revalidatePath("/equipo");
}

export async function aceptar(token: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, error: "Invitación no válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("aceptar_invitacion", { t: token });
  if (error) return { ok: false, error: error.message };
  redirect("/hoy");
}
