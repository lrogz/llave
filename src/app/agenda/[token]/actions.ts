"use server";

import { revalidatePath } from "next/cache";
import { estaLibre, horarioValido } from "@/lib/agenda";
import { avisarProveedor } from "@/lib/citas";
import { origen } from "@/lib/util";
import { createAdminClient } from "@/lib/supabase/admin";

// El inquilino elige uno de los horarios libres del proveedor.
export async function elegirHorario(_: unknown, f: FormData): Promise<{ ok: boolean; mensaje: string } | null> {
  const token = String(f.get("token") ?? "");
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, mensaje: "Link no válido." };
  const [a, b] = String(f.get("espacio") ?? "").split("|");
  const inicio = new Date(a);
  const fin = new Date(b);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin <= inicio) return { ok: false, mensaje: "Elige un horario." };
  const admin = createAdminClient();
  const { data: c } = await admin.from("citas").select("id, estado, proveedor_id, proveedores(horario)").eq("token", token).maybeSingle();
  if (!c || c.estado !== "por_elegir") return { ok: false, mensaje: "Esta visita ya tiene horario o fue cancelada." };
  const horario = (c.proveedores as unknown as { horario: unknown } | null)?.horario;
  // El horario debe caer en la agenda del proveedor (que no manden uno inventado).
  const mx = new Date(inicio.getTime() - 6 * 3_600_000);
  const min = mx.getUTCHours() * 60 + mx.getUTCMinutes();
  const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const enHorario =
    horarioValido(horario) &&
    horario.dias.includes(mx.getUTCDay()) &&
    fin.getTime() - inicio.getTime() === horario.duracion * 60_000 &&
    min >= aMin(horario.desde) &&
    min + horario.duracion <= aMin(horario.hasta) &&
    (min - aMin(horario.desde)) % horario.duracion === 0;
  if (!enHorario || inicio.getTime() < Date.now() + 3_600_000)
    return { ok: false, mensaje: "Ese horario no está disponible. Elige otro." };
  if (!(await estaLibre(admin, c.proveedor_id, inicio, fin))) return { ok: false, mensaje: "Ese horario se acaba de ocupar. Elige otro." };
  const { error } = await admin.from("citas").update({ inicio: inicio.toISOString(), fin: fin.toISOString(), estado: "confirmada" }).eq("id", c.id).eq("estado", "por_elegir");
  if (error) return { ok: false, mensaje: error.code === "23505" ? "Ese horario se acaba de ocupar. Elige otro." : "No pudimos guardar el horario." };
  await avisarProveedor(admin, c.id, await origen());
  revalidatePath(`/agenda/${token}`);
  return { ok: true, mensaje: "¡Listo! Quedó agendada." };
}
