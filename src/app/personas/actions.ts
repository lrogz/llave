"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sesionConOrg } from "@/lib/sesion";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const opc = (f: FormData, k: string, max = 200) => txt(f, k, max) || null;
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const monto = (s: string) => {
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return s && Number.isFinite(n) ? n : null;
};
// Solo regresamos a pantallas nuestras.
const volverA = (f: FormData) => {
  const v = txt(f, "volver", 120);
  return /^\/(hoy|personas(\/(duenos|inquilinos)\/[0-9a-f-]{36})?)$/i.test(v) ? v : "/hoy";
};

export async function agregarDueno(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const nombre = txt(f, "nombre", 120);
  if (!nombre) return;
  const { data, error } = await supabase
    .from("duenos")
    .insert({ organizacion_id: org.id, nombre, telefono: opc(f, "telefono", 30), email: opc(f, "email", 160) })
    .select("id")
    .single();
  if (error || !data) throw new Error("No pudimos guardar al dueño.");
  redirect(`/personas/duenos/${data.id}`);
}

export async function agregarInquilino(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const nombre = txt(f, "nombre", 120);
  const propiedadId = txt(f, "propiedad_id", 40);
  const inicio = txt(f, "inicio", 10);
  const fin = txt(f, "fin", 10);
  const renta = monto(txt(f, "renta", 20));
  const diaPago = Math.min(31, Math.max(1, Number(txt(f, "dia_pago", 2)) || 1));
  if (!nombre) return;

  const { data: inq, error } = await supabase
    .from("inquilinos")
    .insert({ organizacion_id: org.id, nombre, telefono: opc(f, "telefono", 30), email: opc(f, "email", 160) })
    .select("id")
    .single();
  if (error || !inq) throw new Error("No pudimos guardar al inquilino.");

  // Contrato opcional: solo si viene propiedad y fechas válidas.
  if (esUuid(propiedadId) && esFecha(inicio) && esFecha(fin) && fin > inicio) {
    const { data: prop } = await supabase.from("propiedades").select("id, renta_mensual").eq("id", propiedadId).maybeSingle();
    if (prop) {
      await supabase.from("contratos").update({ activo: false }).eq("propiedad_id", prop.id).eq("activo", true);
      const { error: e2 } = await supabase.from("contratos").insert({
        organizacion_id: org.id,
        propiedad_id: prop.id,
        inquilino_id: inq.id,
        inicio,
        fin,
        renta: renta ?? prop.renta_mensual ?? 0,
        dia_pago: diaPago,
      });
      if (!e2) await supabase.from("propiedades").update({ estado: "rentada" }).eq("id", prop.id);
    }
  }
  redirect(`/personas/inquilinos/${inq.id}`);
}

export async function guardarDatosDueno(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "id", 40);
  const nombre = txt(f, "nombre", 120);
  if (!esUuid(id) || !nombre) return;
  const comision = monto(txt(f, "comision_pct", 6));
  const canal = txt(f, "canal_preferido", 20);
  const frecuencia = txt(f, "frecuencia_reporte", 20);
  await supabase
    .from("duenos")
    .update({
      nombre,
      telefono: opc(f, "telefono", 30),
      email: opc(f, "email", 160),
      comision_pct: comision != null && comision <= 100 ? comision : null,
      canal_preferido: ["whatsapp", "correo", "llamada"].includes(canal) ? canal : "whatsapp",
      frecuencia_reporte: ["mensual", "quincenal", "solo_cambios"].includes(frecuencia) ? frecuencia : "mensual",
    })
    .eq("id", id);
  revalidatePath(`/personas/duenos/${id}`);
}

export async function guardarDatosInquilino(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "id", 40);
  const nombre = txt(f, "nombre", 120);
  if (!esUuid(id) || !nombre) return;
  await supabase
    .from("inquilinos")
    .update({
      nombre,
      telefono: opc(f, "telefono", 30),
      email: opc(f, "email", 160),
      aval_nombre: opc(f, "aval_nombre", 120),
      aval_telefono: opc(f, "aval_telefono", 30),
    })
    .eq("id", id);
  revalidatePath(`/personas/inquilinos/${id}`);
}

export async function asignarPropiedad(f: FormData) {
  const { supabase } = await sesionConOrg();
  const duenoId = txt(f, "dueno_id", 40);
  const propiedadId = txt(f, "propiedad_id", 40);
  if (!esUuid(duenoId) || !esUuid(propiedadId)) return;
  const { data: d } = await supabase.from("duenos").select("id").eq("id", duenoId).maybeSingle();
  if (!d) return;
  await supabase.from("propiedades").update({ dueno_id: d.id }).eq("id", propiedadId);
  revalidatePath(`/personas/duenos/${d.id}`);
}

// Confirma que la persona existe y es de esta administradora (RLS) antes de colgarle algo.
async function persona(supabase: Awaited<ReturnType<typeof sesionConOrg>>["supabase"], f: FormData) {
  const duenoId = txt(f, "dueno_id", 40);
  const inquilinoId = txt(f, "inquilino_id", 40);
  const propiedadId = txt(f, "propiedad_id", 40);
  const r: { dueno_id: string | null; inquilino_id: string | null; propiedad_id: string | null } = {
    dueno_id: null,
    inquilino_id: null,
    propiedad_id: null,
  };
  if (esUuid(duenoId)) r.dueno_id = (await supabase.from("duenos").select("id").eq("id", duenoId).maybeSingle()).data?.id ?? null;
  if (esUuid(inquilinoId)) r.inquilino_id = (await supabase.from("inquilinos").select("id").eq("id", inquilinoId).maybeSingle()).data?.id ?? null;
  if (esUuid(propiedadId)) r.propiedad_id = (await supabase.from("propiedades").select("id").eq("id", propiedadId).maybeSingle()).data?.id ?? null;
  return r;
}

export async function agregarNota(f: FormData) {
  const { supabase, org, user } = await sesionConOrg();
  const texto = txt(f, "texto", 2000);
  const p = await persona(supabase, f);
  if (!texto || (!p.dueno_id && !p.inquilino_id && !p.propiedad_id)) return;
  await supabase.from("notas").insert({ organizacion_id: org.id, texto, autor_email: user.email ?? null, ...p });
  revalidatePath(volverA(f));
}

export async function agregarPendiente(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const titulo = txt(f, "titulo", 200);
  if (!titulo) return;
  const deQuien = txt(f, "de_quien", 20);
  const vence = txt(f, "vence", 10);
  const p = await persona(supabase, f);
  await supabase.from("pendientes").insert({
    organizacion_id: org.id,
    titulo,
    de_quien: ["administradora", "dueno", "inquilino"].includes(deQuien) ? deQuien : "administradora",
    vence: esFecha(vence) ? vence : null,
    ...p,
  });
  revalidatePath(volverA(f));
}

export async function marcarPendiente(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "id", 40);
  if (!esUuid(id)) return;
  const hecho = txt(f, "hecho", 1) === "1";
  await supabase.from("pendientes").update({ hecho_at: hecho ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath(volverA(f));
}
