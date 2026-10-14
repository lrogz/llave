import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Agenda del proveedor: su horario semanal y las citas ya ocupadas (de todas las administradoras).
// México centro no tiene horario de verano desde 2022: siempre -06:00.
export type Horario = { dias: number[]; desde: string; hasta: string; duracion: number };
export const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function horarioValido(h: unknown): h is Horario {
  const x = h as Partial<Horario> | null;
  return !!x && Array.isArray(x.dias) && x.dias.length > 0 && /^\d{2}:\d{2}$/.test(x.desde ?? "") && /^\d{2}:\d{2}$/.test(x.hasta ?? "") && (x.duracion ?? 0) >= 30 && x.desde! < x.hasta!;
}

const fechaMX = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d);
const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const enMX = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-06:00`);

export type Espacio = { inicio: string; fin: string };

// Horarios libres de los próximos `dias` días (desde dentro de 2 horas).
export async function horariosLibres(db: SupabaseClient, proveedorId: string, horario: Horario, dias = 10): Promise<Espacio[]> {
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + dias * 86_400_000);
  const { data } = await db.from("citas").select("inicio, fin").eq("proveedor_id", proveedorId).eq("estado", "confirmada").gte("fin", ahora.toISOString()).lte("inicio", limite.toISOString());
  const ocupadas = (data ?? []).map((c) => [Date.parse(c.inicio), Date.parse(c.fin)] as const);
  const libres: Espacio[] = [];
  const hoy = fechaMX(ahora);
  for (let d = 0; d < dias; d++) {
    const fecha = fechaMX(new Date(Date.parse(`${hoy}T12:00:00-06:00`) + d * 86_400_000));
    const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    if (!horario.dias.includes(dia)) continue;
    for (let m = aMin(horario.desde); m + horario.duracion <= aMin(horario.hasta); m += horario.duracion) {
      const ini = enMX(fecha, aHora(m));
      const fin = new Date(ini.getTime() + horario.duracion * 60_000);
      if (ini.getTime() < ahora.getTime() + 2 * 3_600_000) continue;
      if (ocupadas.some(([a, b]) => ini.getTime() < b && fin.getTime() > a)) continue;
      libres.push({ inicio: ini.toISOString(), fin: fin.toISOString() });
    }
  }
  return libres;
}

export async function estaLibre(db: SupabaseClient, proveedorId: string, inicio: Date, fin: Date, salvoCita?: string) {
  let q = db.from("citas").select("id").eq("proveedor_id", proveedorId).eq("estado", "confirmada").lt("inicio", fin.toISOString()).gt("fin", inicio.toISOString());
  if (salvoCita) q = q.neq("id", salvoCita);
  const { data } = await q;
  return !(data ?? []).length;
}

const formato = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" });
export const fechaCita = (iso: string) => formato.format(new Date(iso));
