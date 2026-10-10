"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CATEGORIAS } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const VALIDAS = new Set<string>(CATEGORIAS.map(([v]) => v));

function datos(f: FormData) {
  return {
    nombre: txt(f, "nombre", 120),
    telefono: txt(f, "telefono", 30) || null,
    email: txt(f, "email", 160) || null,
    especialidades: f.getAll("especialidades").map(String).filter((e) => VALIDAS.has(e)),
    zonas: txt(f, "zonas", 200)
      .split(",")
      .map((z) => z.trim())
      .filter(Boolean)
      .slice(0, 10),
  };
}

export async function agregarProveedor(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const d = datos(f);
  if (!d.nombre) return;
  // Si ya existe uno con el mismo WhatsApp, abre ese en vez de duplicarlo.
  if (d.telefono) {
    const { data: existe } = await supabase.from("proveedores").select("id").eq("organizacion_id", org.id).eq("telefono", d.telefono).maybeSingle();
    if (existe) redirect(`/proveedores/${existe.id}`);
  }
  const { data, error } = await supabase.from("proveedores").insert({ organizacion_id: org.id, ...d }).select("id").single();
  if (error || !data) throw new Error("No pudimos guardar al proveedor.");
  redirect(`/proveedores/${data.id}`);
}

export async function guardarProveedor(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const id = txt(f, "id", 40);
  const d = datos(f);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !d.nombre) return;
  // Solo los proveedores propios se editan; los de la red Black Key son de solo lectura.
  await supabase.from("proveedores").update(d).eq("id", id).eq("organizacion_id", org.id);
  revalidatePath(`/proveedores/${id}`);
  revalidatePath("/proveedores");
}
