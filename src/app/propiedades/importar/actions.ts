"use server";

import { revalidatePath } from "next/cache";
import { sesionConOrg } from "@/lib/sesion";
import { convertir, MAX_FILAS, simplificar, type Celda, type Clave, type FilaImportada, type Mapeo } from "@/lib/importar";

export type Resultado = {
  creadas: number;
  duenosNuevos: number;
  omitidas: { nombre: string; motivo: string }[];
  error?: string;
};

const CLAVES: Clave[] = ["nombre", "direccion", "colonia", "ciudad", "tipo", "estado", "renta", "dueno", "dueno_telefono", "dueno_email", "notas"];

// Vuelve a normalizar en el servidor: no confiamos en lo que manda el navegador.
function limpiar(entrada: unknown): FilaImportada | null {
  if (!entrada || typeof entrada !== "object") return null;
  const o = entrada as Record<string, unknown>;
  const fila: Celda[] = CLAVES.map((c) => {
    const v = o[c];
    return typeof v === "string" || typeof v === "number" ? v : null;
  });
  const mapeo = Object.fromEntries(CLAVES.map((c, i) => [c, i])) as Mapeo;
  return convertir(fila, mapeo);
}

export async function importarPropiedades(entrada: unknown[]): Promise<Resultado> {
  const { supabase, org } = await sesionConOrg();
  if (!Array.isArray(entrada) || entrada.length === 0) return { creadas: 0, duenosNuevos: 0, omitidas: [], error: "El archivo no trae propiedades." };
  if (entrada.length > MAX_FILAS) return { creadas: 0, duenosNuevos: 0, omitidas: [], error: `Máximo ${MAX_FILAS} propiedades por archivo.` };

  const omitidas: Resultado["omitidas"] = [];
  const { data: existentes } = await supabase.from("propiedades").select("nombre").eq("organizacion_id", org.id);
  const vistos = new Set((existentes ?? []).map((p) => simplificar(p.nombre)));

  const filas: FilaImportada[] = [];
  for (const e of entrada) {
    const f = limpiar(e);
    if (!f) {
      omitidas.push({ nombre: "(sin nombre)", motivo: "Falta el nombre" });
      continue;
    }
    const llave = simplificar(f.nombre);
    if (vistos.has(llave)) {
      omitidas.push({ nombre: f.nombre, motivo: "Ya existe una propiedad con ese nombre" });
      continue;
    }
    vistos.add(llave);
    filas.push(f);
  }

  // Dueños: reutiliza los que ya existen (mismo nombre) y crea los nuevos de una vez.
  const { data: duenosActuales } = await supabase.from("duenos").select("id, nombre").eq("organizacion_id", org.id);
  const idDueno = new Map((duenosActuales ?? []).map((d) => [simplificar(d.nombre), d.id as string]));
  const nuevos = new Map<string, { organizacion_id: string; nombre: string; telefono: string | null; email: string | null }>();
  for (const f of filas) {
    if (!f.dueno) continue;
    const llave = simplificar(f.dueno);
    if (idDueno.has(llave) || nuevos.has(llave)) continue;
    nuevos.set(llave, { organizacion_id: org.id, nombre: f.dueno, telefono: f.dueno_telefono, email: f.dueno_email });
  }
  if (nuevos.size) {
    const { data, error } = await supabase.from("duenos").insert([...nuevos.values()]).select("id, nombre");
    if (error) return { creadas: 0, duenosNuevos: 0, omitidas, error: "No pudimos guardar a los dueños." };
    for (const d of data ?? []) idDueno.set(simplificar(d.nombre), d.id);
  }

  if (filas.length) {
    const { error } = await supabase.from("propiedades").insert(
      filas.map((f) => ({
        organizacion_id: org.id,
        nombre: f.nombre,
        direccion: f.direccion,
        colonia: f.colonia,
        ...(f.ciudad ? { ciudad: f.ciudad } : {}),
        tipo: f.tipo,
        estado: f.estado,
        renta_mensual: f.renta,
        notas: f.notas,
        dueno_id: f.dueno ? (idDueno.get(simplificar(f.dueno)) ?? null) : null,
      })),
    );
    if (error) return { creadas: 0, duenosNuevos: nuevos.size, omitidas, error: "No pudimos guardar las propiedades." };
  }

  revalidatePath("/");
  return { creadas: filas.length, duenosNuevos: nuevos.size, omitidas };
}
