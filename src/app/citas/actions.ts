"use server";

import { revalidatePath } from "next/cache";
import { enMX, estaLibre, horarioValido } from "@/lib/agenda";
import { avisarProveedor } from "@/lib/citas";
import { origen } from "@/lib/util";
import { sesionConOrg } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoCita = { ok: boolean; mensaje: string } | null;
const txt = (f: FormData, k: string, max = 60) => String(f.get(k) ?? "").trim().slice(0, max);
const uuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

async function datos(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const ticketId = txt(f, "ticket_id");
  const proveedorId = txt(f, "proveedor_id");
  if (!uuid(ticketId) || !uuid(proveedorId)) throw new Error("Datos no válidos.");
  const [{ data: t }, { data: p }] = await Promise.all([
    supabase.from("tickets").select("id, propiedad_id").eq("id", ticketId).eq("organizacion_id", org.id).maybeSingle(),
    supabase.from("proveedores").select("id, horario").eq("id", proveedorId).maybeSingle(),
  ]);
  if (!t || !p) throw new Error("No encontramos el ticket o el proveedor.");
  return { supabase, org, ticket: t as { id: string; propiedad_id: string }, proveedor: p as { id: string; horario: unknown } };
}

// La administradora agenda la visita: en un horario libre del proveedor o en una fecha que ya acordaron.
export async function agendarCita(_: EstadoCita, f: FormData): Promise<EstadoCita> {
  const { supabase, org, ticket, proveedor } = await datos(f);
  let inicio: Date;
  let fin: Date;
  const espacio = txt(f, "espacio", 80);
  if (espacio && espacio !== "otro") {
    const [a, b] = espacio.split("|");
    inicio = new Date(a);
    fin = new Date(b);
  } else {
    const fecha = txt(f, "fecha", 10);
    const hora = txt(f, "hora", 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) return { ok: false, mensaje: "Elige un horario o pon fecha y hora." };
    inicio = enMX(fecha, hora);
    fin = new Date(inicio.getTime() + (Number(txt(f, "duracion", 3)) || 60) * 60_000);
  }
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin <= inicio) return { ok: false, mensaje: "Horario no válido." };
  if (inicio.getTime() < Date.now() - 3_600_000) return { ok: false, mensaje: "Esa fecha ya pasó." };
  const admin = createAdminClient();
  if (!(await estaLibre(admin, proveedor.id, inicio, fin))) return { ok: false, mensaje: "El proveedor ya tiene otra visita a esa hora. Elige otro horario." };
  const { data, error } = await supabase
    .from("citas")
    .insert({ organizacion_id: org.id, proveedor_id: proveedor.id, ticket_id: ticket.id, propiedad_id: ticket.propiedad_id, inicio: inicio.toISOString(), fin: fin.toISOString(), estado: "confirmada", notas: txt(f, "notas", 300) || null })
    .select("id")
    .single();
  if (error || !data) return { ok: false, mensaje: error?.code === "23505" ? "Ese horario se acaba de ocupar. Elige otro." : "No pudimos agendar la visita." };
  // Si había un link pendiente para que el inquilino eligiera, ya no hace falta.
  await supabase.from("citas").update({ estado: "cancelada" }).eq("ticket_id", ticket.id).eq("proveedor_id", proveedor.id).eq("estado", "por_elegir");
  const avisado = await avisarProveedor(admin, data.id, await origen());
  revalidatePath(`/tickets/${ticket.id}`);
  return { ok: true, mensaje: avisado ? "Visita agendada. Le avisamos al proveedor por WhatsApp." : "Visita agendada." };
}

// Crea un link para que el inquilino elija el horario entre los libres del proveedor.
export async function pedirAlInquilino(_: EstadoCita, f: FormData): Promise<EstadoCita> {
  const { supabase, org, ticket, proveedor } = await datos(f);
  if (!horarioValido(proveedor.horario)) return { ok: false, mensaje: "El proveedor aún no tiene horario. Pásale su link de agenda para que lo ponga, o agenda tú una fecha." };
  const { data: ya } = await supabase.from("citas").select("id").eq("ticket_id", ticket.id).eq("proveedor_id", proveedor.id).eq("estado", "por_elegir").maybeSingle();
  if (!ya) {
    const { error } = await supabase.from("citas").insert({ organizacion_id: org.id, proveedor_id: proveedor.id, ticket_id: ticket.id, propiedad_id: ticket.propiedad_id, estado: "por_elegir" });
    if (error) return { ok: false, mensaje: "No pudimos crear el link." };
  }
  revalidatePath(`/tickets/${ticket.id}`);
  return { ok: true, mensaje: "Listo: mándale el link al inquilino." };
}

export async function cancelarCita(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const id = txt(f, "cita_id");
  if (!uuid(id)) return;
  const { data } = await supabase.from("citas").update({ estado: "cancelada" }).eq("id", id).eq("organizacion_id", org.id).in("estado", ["por_elegir", "confirmada"]).select("ticket_id").maybeSingle();
  if (data?.ticket_id) revalidatePath(`/tickets/${data.ticket_id}`);
}
