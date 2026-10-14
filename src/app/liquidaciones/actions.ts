"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { clabeValida } from "@/lib/clabe";
import { BUCKET, MAX_ENVIO, extension } from "@/lib/datos";
import { armarReporte } from "@/lib/reporte";
import { sesionConOrg } from "@/lib/sesion";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const esPeriodo = (s: string) => /^\d{4}-\d{2}-01$/.test(s);
const monto = (s: string) => {
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

type Db = Awaited<ReturnType<typeof sesionConOrg>>["supabase"];

async function duenoDeLaOrg(supabase: Db, id: string) {
  if (!esUuid(id)) throw new Error("Dueño no válido.");
  const { data } = await supabase.from("duenos").select("id, nombre").eq("id", id).maybeSingle();
  if (!data) throw new Error("No encontramos al dueño.");
  return data;
}

async function yaLiquidado(supabase: Db, duenoId: string, periodo: string) {
  const { data } = await supabase.from("liquidaciones").select("id").eq("dueno_id", duenoId).eq("periodo", periodo).maybeSingle();
  return !!data;
}

const refrescar = (duenoId: string) => {
  revalidatePath(`/liquidaciones/${duenoId}`);
  revalidatePath("/liquidaciones");
};

export async function agregarMovimiento(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const d = await duenoDeLaOrg(supabase, txt(f, "dueno_id", 40));
  const periodo = txt(f, "periodo", 10);
  const tipo = txt(f, "tipo", 10);
  const concepto = txt(f, "concepto", 160);
  const cantidad = monto(txt(f, "monto", 20));
  if (!esPeriodo(periodo) || (tipo !== "cargo" && tipo !== "abono") || !concepto || !cantidad) throw new Error("Escribe el concepto y el monto.");
  if (await yaLiquidado(supabase, d.id, periodo)) throw new Error("Este mes ya está liquidado. Deshaz la liquidación para cambiarlo.");
  const propiedadId = txt(f, "propiedad_id", 40);
  const propiedad = esUuid(propiedadId) ? ((await supabase.from("propiedades").select("id").eq("id", propiedadId).eq("dueno_id", d.id).maybeSingle()).data?.id ?? null) : null;
  const { error } = await supabase.from("movimientos_dueno").insert({ organizacion_id: org.id, dueno_id: d.id, propiedad_id: propiedad, periodo, tipo, concepto, monto: cantidad });
  if (error) throw new Error("No pudimos guardarlo.");
  refrescar(d.id);
}

export async function borrarMovimiento(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "id", 40);
  if (!esUuid(id)) return;
  const { data: m } = await supabase.from("movimientos_dueno").select("id, dueno_id, periodo").eq("id", id).maybeSingle();
  if (!m) return;
  if (await yaLiquidado(supabase, m.dueno_id, m.periodo)) throw new Error("Este mes ya está liquidado.");
  await supabase.from("movimientos_dueno").delete().eq("id", m.id);
  refrescar(m.dueno_id);
}

export async function guardarBanco(_: unknown, f: FormData): Promise<{ ok: boolean; mensaje: string; banco: string; clabe: string }> {
  const { supabase } = await sesionConOrg();
  const d = await duenoDeLaOrg(supabase, txt(f, "dueno_id", 40));
  const valores = { banco: txt(f, "banco", 60), clabe: txt(f, "clabe", 30) };
  const clabe = txt(f, "clabe", 30).replace(/\D/g, "");
  if (clabe && !clabeValida(clabe)) return { ok: false, mensaje: "La CLABE no es válida: revisa los 18 dígitos.", ...valores };
  const { error } = await supabase.from("duenos").update({ banco: txt(f, "banco", 60) || null, clabe: clabe || null }).eq("id", d.id);
  if (error) return { ok: false, mensaje: "No pudimos guardar los datos bancarios.", ...valores };
  refrescar(d.id);
  return { ok: true, mensaje: "Guardado.", ...valores };
}

// Guarda cómo quedó el mes y lo marca como transferido.
export async function marcarLiquidada(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const d = await duenoDeLaOrg(supabase, txt(f, "dueno_id", 40));
  const periodo = txt(f, "periodo", 10);
  const fecha = txt(f, "pagada_el", 10);
  if (!esPeriodo(periodo) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Elige la fecha de la transferencia.");
  if (await yaLiquidado(supabase, d.id, periodo)) return;
  const rep = await armarReporte(supabase, d.id, periodo);
  if (!rep) throw new Error("No pudimos calcular la liquidación.");

  let comprobante: string | null = null;
  const archivo = f.get("comprobante");
  if (archivo instanceof File && archivo.size > 0) {
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"].includes(archivo.type)) throw new Error("El comprobante debe ser PDF o foto.");
    if (archivo.size > MAX_ENVIO) throw new Error("El comprobante pesa más de 4 MB.");
    comprobante = `${org.id}/liquidaciones/${randomUUID()}.${extension(archivo.name, archivo.type)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(comprobante, archivo, { contentType: archivo.type });
    if (error) throw new Error("No pudimos subir el comprobante.");
  }

  const t = rep.totales;
  const { error } = await supabase.from("liquidaciones").insert({
    organizacion_id: org.id,
    dueno_id: d.id,
    periodo,
    renta_cobrada: t.rentaCobrada,
    comision: t.comision,
    mantenimiento: t.gastos,
    cargos: t.cargos,
    abonos: t.abonos,
    total: t.saldo,
    pagada_el: fecha,
    referencia: txt(f, "referencia", 80) || null,
    comprobante_path: comprobante,
  });
  if (error) throw new Error("No pudimos guardar la liquidación.");
  // Deja listo el link del reporte para mandárselo al dueño.
  await supabase.from("reportes_dueno").upsert({ organizacion_id: org.id, dueno_id: d.id, periodo }, { onConflict: "dueno_id,periodo", ignoreDuplicates: true });
  refrescar(d.id);
}

export async function deshacerLiquidacion(f: FormData) {
  const { supabase } = await sesionConOrg();
  const d = await duenoDeLaOrg(supabase, txt(f, "dueno_id", 40));
  const periodo = txt(f, "periodo", 10);
  if (!esPeriodo(periodo)) return;
  const { data, error } = await supabase.from("liquidaciones").delete().eq("dueno_id", d.id).eq("periodo", periodo).select("comprobante_path");
  if (error || !data?.length) throw new Error("Solo la dueña de la cuenta o una administradora puede deshacer una liquidación.");
  const path = data[0].comprobante_path;
  if (path) await supabase.storage.from(BUCKET).remove([path]);
  refrescar(d.id);
}
