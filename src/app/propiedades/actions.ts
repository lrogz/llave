"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

const TIPOS = ["casa", "departamento", "local", "oficina", "unidad_condominio", "otro"];
const ESTADOS = ["rentada", "vacia", "en_mantenimiento"];
const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function editarPropiedad(form: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(form, "id", 40);
  const nombre = txt(form, "nombre", 120);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !nombre) return;
  const tipo = txt(form, "tipo", 30);
  const estado = txt(form, "estado", 30);
  const renta = txt(form, "renta", 20).replace(/[^0-9.]/g, "");
  const duenoId = txt(form, "dueno_id", 40);
  // El dueño debe ser de esta administradora (RLS lo filtra).
  const dueno = /^[0-9a-f-]{36}$/i.test(duenoId) ? ((await supabase.from("duenos").select("id").eq("id", duenoId).maybeSingle()).data?.id ?? null) : null;
  const { error } = await supabase
    .from("propiedades")
    .update({
      nombre,
      direccion: txt(form, "direccion") || null,
      colonia: txt(form, "colonia", 120) || null,
      ciudad: txt(form, "ciudad", 120) || null,
      tipo: TIPOS.includes(tipo) ? tipo : "casa",
      estado: ESTADOS.includes(estado) ? estado : "vacia",
      renta_mensual: renta ? Number(renta) : null,
      notas: txt(form, "notas", 1000) || null,
      dueno_id: dueno,
    })
    .eq("id", id);
  if (error) throw new Error("No pudimos guardar los cambios.");
  revalidatePath(`/propiedades/${id}`);
  revalidatePath("/");
}

export async function borrarPropiedad(form: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(form, "id", 40);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { data: p } = await supabase.from("propiedades").select("id, nombre").eq("id", id).maybeSingle();
  if (!p) return;
  if (txt(form, "confirmar", 120).toLowerCase() !== p.nombre.toLowerCase()) throw new Error("Escribe el nombre exacto de la propiedad para confirmar.");
  const { error } = await supabase.from("propiedades").delete().eq("id", p.id);
  if (error) throw new Error("Solo la dueña de la cuenta o una administradora puede borrar propiedades.");
  revalidatePath("/");
  redirect("/");
}
