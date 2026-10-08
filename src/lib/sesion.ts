import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "./supabase/server";

// Sesión de la administradora. Las consultas pasan por RLS, así que solo ve lo suyo.
export async function sesion() {
  await connection(); // depende de la sesión: siempre por request
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("miembros")
    .select("organizacion_id, organizaciones(nombre)")
    .limit(1)
    .maybeSingle();

  const org = data
    ? {
        id: data.organizacion_id as string,
        nombre: (data.organizaciones as unknown as { nombre: string } | null)?.nombre ?? "",
      }
    : null;

  return { supabase, user, org };
}

export async function sesionConOrg() {
  const s = await sesion();
  if (!s.org) redirect("/");
  return { ...s, org: s.org };
}
