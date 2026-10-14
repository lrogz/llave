"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ESTADOS_SOLICITUD, type DatosSolicitud } from "@/lib/solicitud";
import { sesionConOrg } from "@/lib/sesion";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

// Crea la solicitud (desde un prospecto del anuncio o a mano) y regresa a donde estaba.
export async function pedirSolicitud(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const propiedadId = txt(f, "propiedad_id", 40);
  if (!esUuid(propiedadId)) return;
  const prospectoId = txt(f, "prospecto_id", 40);
  let base = { nombre: txt(f, "nombre", 120), telefono: txt(f, "telefono", 30) || null, email: txt(f, "email", 160) || null };
  if (esUuid(prospectoId)) {
    const { data: p } = await supabase.from("prospectos").select("nombre, telefono, email").eq("id", prospectoId).maybeSingle();
    if (p) base = { nombre: p.nombre, telefono: p.telefono, email: p.email };
  }
  if (!base.nombre) throw new Error("Escribe el nombre del interesado.");
  const { data: prop } = await supabase.from("propiedades").select("id").eq("id", propiedadId).maybeSingle();
  if (!prop) throw new Error("No encontramos la propiedad.");
  const { error } = await supabase.from("solicitudes_renta").insert({ organizacion_id: org.id, propiedad_id: prop.id, prospecto_id: esUuid(prospectoId) ? prospectoId : null, ...base });
  if (error) throw new Error("No pudimos crear la solicitud.");
  if (esUuid(prospectoId)) await supabase.from("prospectos").update({ estado: "visita" }).eq("id", prospectoId).eq("estado", "nuevo");
  revalidatePath(`/propiedades/${prop.id}/anuncio`);
}

export async function estadoSolicitud(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "id", 40);
  const estado = txt(f, "estado", 20);
  if (!esUuid(id) || !ESTADOS_SOLICITUD.some(([v]) => v === estado)) return;
  await supabase.from("solicitudes_renta").update({ estado }).eq("id", id);
  revalidatePath(`/solicitudes/${id}`);
}

// Aprobada: crea al inquilino con sus datos (y su aval) para hacerle el contrato.
export async function crearInquilinoDeSolicitud(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const id = txt(f, "id", 40);
  if (!esUuid(id)) return;
  const { data: s } = await supabase.from("solicitudes_renta").select("id, nombre, telefono, email, datos, inquilino_id").eq("id", id).maybeSingle();
  if (!s) throw new Error("No encontramos la solicitud.");
  if (s.inquilino_id) redirect(`/personas/inquilinos/${s.inquilino_id}`);
  const datos = (s.datos ?? {}) as DatosSolicitud;
  const { data: inq, error } = await supabase
    .from("inquilinos")
    .insert({ organizacion_id: org.id, nombre: s.nombre, telefono: s.telefono, email: s.email, aval_nombre: datos.aval_nombre || null, aval_telefono: datos.aval_tel || null })
    .select("id")
    .single();
  if (error || !inq) throw new Error("No pudimos crear al inquilino.");
  await supabase.from("solicitudes_renta").update({ inquilino_id: inq.id, estado: "aprobada" }).eq("id", s.id);
  redirect(`/personas/inquilinos/${inq.id}`);
}
