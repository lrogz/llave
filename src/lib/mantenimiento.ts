import type { SupabaseClient } from "@supabase/supabase-js";

// Mantenimiento preventivo: tareas que se repiten cada N meses. Unos días antes se crea el ticket solo.

export const PLANTILLAS_MANT = [
  { clave: "impermeabilizar", titulo: "Impermeabilizar azotea", categoria: "humedad", meses: 12 },
  { clave: "fumigar", titulo: "Fumigación", categoria: "otro", meses: 6 },
  { clave: "tinaco", titulo: "Lavar tinaco", categoria: "plomeria", meses: 6 },
  { clave: "cisterna", titulo: "Lavar cisterna", categoria: "plomeria", meses: 12 },
  { clave: "boiler", titulo: "Servicio al boiler / calentador", categoria: "gas", meses: 12 },
  { clave: "gas", titulo: "Revisión de instalación de gas", categoria: "gas", meses: 12 },
  { clave: "minisplit", titulo: "Mantenimiento de minisplits", categoria: "electrodomesticos", meses: 6 },
  { clave: "electrica", titulo: "Revisión eléctrica", categoria: "electricidad", meses: 12 },
  { clave: "jardin", titulo: "Jardinería y poda", categoria: "otro", meses: 3 },
  { clave: "pintura", titulo: "Pintura de fachada", categoria: "otro", meses: 24 },
  { clave: "extintor", titulo: "Recarga de extintor", categoria: "otro", meses: 12 },
] as const;

export const DIAS_ANTES = 7;

const fechaMX = (dias = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(Date.now() + dias * 86_400_000));

export function sumarMeses(fecha: string, meses: number) {
  const [y, m, d] = fecha.split("-").map(Number);
  const total = y * 12 + (m - 1) + meses;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

export type Mantenimiento = { id: string; organizacion_id: string; propiedad_id: string; titulo: string; categoria: string | null; cada_meses: number; proxima: string; quien_paga: string | null; reparto?: unknown; notas: string | null };

// Crea el ticket de una tarea y recorre su próxima fecha (sirve con el cliente de la administradora o con la llave de servicio).
export async function crearTicketMantenimiento(db: SupabaseClient, m: Mantenimiento) {
  const { data: t, error } = await db
    .from("tickets")
    .insert({
      organizacion_id: m.organizacion_id,
      propiedad_id: m.propiedad_id,
      titulo: `Mantenimiento: ${m.titulo}`,
      descripcion: [`Mantenimiento preventivo programado cada ${m.cada_meses} ${m.cada_meses === 1 ? "mes" : "meses"} (fecha: ${m.proxima}).`, m.notas].filter(Boolean).join("\n"),
      categoria: m.categoria,
      quien_paga: m.quien_paga,
      reparto: m.reparto ?? null,
      urgencia: "baja",
      canal_origen: "panel",
    })
    .select("id")
    .single();
  if (error || !t) throw new Error(`No se pudo crear el ticket: ${error?.message}`);
  // Si la fecha ya pasó hace varios ciclos, la siguiente queda en el futuro.
  let proxima = sumarMeses(m.proxima, m.cada_meses);
  while (proxima <= fechaMX()) proxima = sumarMeses(proxima, m.cada_meses);
  await db.from("mantenimientos").update({ proxima, ultimo_ticket_id: t.id }).eq("id", m.id);
  return t.id as string;
}

// Corre cada mañana con los avisos: tareas que tocan en los próximos 7 días.
export async function generarMantenimientos(db: SupabaseClient, orgId: string) {
  const { data, error } = await db
    .from("mantenimientos")
    .select("id, organizacion_id, propiedad_id, titulo, categoria, cada_meses, proxima, quien_paga, reparto, notas")
    .eq("organizacion_id", orgId)
    .eq("activo", true)
    .lte("proxima", fechaMX(DIAS_ANTES));
  if (error) return 0; // sin la tabla (migración pendiente) no pasa nada
  let n = 0;
  for (const m of (data ?? []) as Mantenimiento[]) {
    try {
      await crearTicketMantenimiento(db, m);
      n++;
    } catch {
      /* se intenta de nuevo mañana */
    }
  }
  return n;
}
