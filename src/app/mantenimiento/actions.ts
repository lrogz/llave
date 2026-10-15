"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PLANTILLAS_MANT, crearTicketMantenimiento, type Mantenimiento } from "@/lib/mantenimiento";
import { sesionConOrg } from "@/lib/sesion";
import { leerPaga } from "@/lib/datos";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

function volver(f: FormData) {
  const v = txt(f, "volver", 80);
  return /^\/(mantenimiento|propiedades\/[0-9a-f-]{36})$/i.test(v) ? v : "/mantenimiento";
}

export type EstadoMant = { ok: boolean; mensaje: string } | null;

// Devuelve el mensaje en vez de lanzar el error (en producción los errores lanzados no se ven).
export async function programarMantenimiento(_: EstadoMant, f: FormData): Promise<EstadoMant> {
  const { supabase, org } = await sesionConOrg();
  const tarea = txt(f, "tarea", 30);
  const plantilla = tarea === "otra" ? undefined : PLANTILLAS_MANT.find((p) => p.clave === tarea);
  const titulo = txt(f, "titulo", 120) || plantilla?.titulo || "";
  const meses = Number(txt(f, "cada_meses", 3)) || plantilla?.meses || 0;
  const proxima = txt(f, "proxima", 10);
  if (!titulo) return { ok: false, mensaje: "Escribe la tarea." };
  if (meses < 1 || meses > 60) return { ok: false, mensaje: "Pon cada cuántos meses se repite (de 1 a 60)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(proxima)) return { ok: false, mensaje: "Pon la fecha de la próxima vez." };
  const paga = leerPaga(f, null);
  if (paga.error) return { ok: false, mensaje: paga.error };
  const destino = txt(f, "propiedad_id", 40);
  // "todas": una tarea por cada propiedad de la cartera.
  const { data: props } = destino === "todas" ? await supabase.from("propiedades").select("id") : await supabase.from("propiedades").select("id").eq("id", esUuid(destino) ? destino : "00000000-0000-0000-0000-000000000000");
  if (!props?.length) return { ok: false, mensaje: "Elige la propiedad." };
  const { error } = await supabase.from("mantenimientos").insert(
    props.map((p) => ({
      organizacion_id: org.id,
      propiedad_id: p.id,
      titulo,
      categoria: plantilla?.categoria ?? "otro",
      cada_meses: meses,
      proxima,
      quien_paga: paga.quien_paga,
      ...(paga.reparto ? { reparto: paga.reparto } : {}),
      notas: txt(f, "notas", 500) || null,
    })),
  );
  if (error) {
    const falta = error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || error.code === "22P02";
    return { ok: false, mensaje: falta ? "Falta actualizar la base de datos: corre las migraciones pendientes en Supabase y vuelve a intentar." : "No pudimos guardar la tarea. Intenta de nuevo." };
  }
  revalidatePath("/mantenimiento");
  revalidatePath(volver(f));
  return { ok: true, mensaje: props.length > 1 ? `Listo: programada en ${props.length} propiedades.` : "Listo: tarea programada." };
}

async function deLaOrg(supabase: Awaited<ReturnType<typeof sesionConOrg>>["supabase"], id: string) {
  if (!esUuid(id)) throw new Error("Tarea no válida.");
  const { data } = await supabase.from("mantenimientos").select("id, organizacion_id, propiedad_id, titulo, categoria, cada_meses, proxima, quien_paga, reparto, notas, activo").eq("id", id).maybeSingle();
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
