"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PLANTILLAS_MANT, crearTicketMantenimiento, type Mantenimiento } from "@/lib/mantenimiento";
import { sesionConOrg } from "@/lib/sesion";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const PAGA = ["dueno", "inquilino", "condominio", "administradora"];

function volver(f: FormData) {
  const v = txt(f, "volver", 80);
  return /^\/(mantenimiento|propiedades\/[0-9a-f-]{36})$/i.test(v) ? v : "/mantenimiento";
}

export async function programarMantenimiento(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const plantilla = PLANTILLAS_MANT.find((p) => p.clave === txt(f, "tarea", 30));
  const titulo = txt(f, "titulo", 120) || plantilla?.titulo || "";
  const meses = Number(txt(f, "cada_meses", 3)) || plantilla?.meses || 0;
  const proxima = txt(f, "proxima", 10);
  if (!titulo || meses < 1 || meses > 60 || !/^\d{4}-\d{2}-\d{2}$/.test(proxima)) throw new Error("Elige la tarea, cada cuántos meses y la fecha.");
  const paga = txt(f, "quien_paga", 20);
  const destino = txt(f, "propiedad_id", 40);
  // "todas": una tarea por cada propiedad de la cartera.
  const { data: props } = destino === "todas" ? await supabase.from("propiedades").select("id") : await supabase.from("propiedades").select("id").eq("id", esUuid(destino) ? destino : "00000000-0000-0000-0000-000000000000");
  if (!props?.length) throw new Error("Elige la propiedad.");
  const { error } = await supabase.from("mantenimientos").insert(
    props.map((p) => ({
      organizacion_id: org.id,
      propiedad_id: p.id,
      titulo,
      categoria: plantilla?.categoria ?? "otro",
      cada_meses: meses,
      proxima,
      quien_paga: PAGA.includes(paga) ? paga : null,
      notas: txt(f, "notas", 500) || null,
    })),
  );
  if (error) throw new Error("No pudimos guardar la tarea.");
  revalidatePath("/mantenimiento");
  revalidatePath(volver(f));
}

async function deLaOrg(supabase: Awaited<ReturnType<typeof sesionConOrg>>["supabase"], id: string) {
  if (!esUuid(id)) throw new Error("Tarea no válida.");
  const { data } = await supabase.from("mantenimientos").select("id, organizacion_id, propiedad_id, titulo, categoria, cada_meses, proxima, quien_paga, notas, activo").eq("id", id).maybeSingle();
  if (!data) throw new Error("No encontramos la tarea.");
  return data as Mantenimiento & { activo: boolean };
}

export async function ticketAhora(f: FormData) {
  const { supabase } = await sesionConOrg();
  const m = await deLaOrg(supabase, txt(f, "id", 40));
  const ticket = await crearTicketMantenimiento(supabase, m);
  revalidatePath("/mantenimiento");
  redirect(`/tickets/${ticket}`);
}

export async function alternarMantenimiento(f: FormData) {
  const { supabase } = await sesionConOrg();
  const m = await deLaOrg(supabase, txt(f, "id", 40));
  await supabase.from("mantenimientos").update({ activo: !m.activo }).eq("id", m.id);
  revalidatePath("/mantenimiento");
  revalidatePath(volver(f));
}

export async function borrarMantenimiento(f: FormData) {
  const { supabase } = await sesionConOrg();
  const m = await deLaOrg(supabase, txt(f, "id", 40));
  await supabase.from("mantenimientos").delete().eq("id", m.id);
  revalidatePath("/mantenimiento");
  revalidatePath(volver(f));
}
