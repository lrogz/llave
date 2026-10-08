"use server";

import { revalidatePath } from "next/cache";
import { sesionConOrg } from "@/lib/sesion";

export async function guardarDueno(form: FormData) {
  const { supabase, org } = await sesionConOrg();
  const propiedadId = String(form.get("propiedad_id") ?? "");
  const nombre = String(form.get("nombre") ?? "").trim().slice(0, 120);
  const telefono = String(form.get("telefono") ?? "").trim().slice(0, 30);
  if (!nombre) return;

  const { data: propiedad } = await supabase.from("propiedades").select("id").eq("id", propiedadId).maybeSingle();
  if (!propiedad) throw new Error("No encontramos la propiedad.");

  const { data: dueno, error } = await supabase
    .from("duenos")
    .insert({ organizacion_id: org.id, nombre, telefono: telefono || null })
    .select("id")
    .single();
  if (error || !dueno) throw new Error("No pudimos guardar al dueño.");

  await supabase.from("propiedades").update({ dueno_id: dueno.id }).eq("id", propiedad.id);
  revalidatePath(`/propiedades/${propiedad.id}`);
}
