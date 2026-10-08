"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function crearOrganizacion(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_organizacion", { nombre });
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function agregarPropiedad(formData: FormData) {
  const organizacion_id = String(formData.get("organizacion_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const direccion = String(formData.get("direccion") ?? "").trim().slice(0, 200) || null;
  const colonia = String(formData.get("colonia") ?? "").trim().slice(0, 120) || null;
  const tipo = String(formData.get("tipo") ?? "casa");
  const rentaTexto = String(formData.get("renta") ?? "").replace(/[^0-9.]/g, "");
  if (!organizacion_id || !nombre) return;

  const supabase = await createClient();
  const { error } = await supabase.from("propiedades").insert({
    organizacion_id,
    nombre,
    direccion,
    colonia,
    tipo,
    renta_mensual: rentaTexto ? Number(rentaTexto) : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function salir() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
