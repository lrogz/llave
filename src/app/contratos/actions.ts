"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generarContrato } from "@/lib/contrato-plantilla";
import { hoyMX } from "@/lib/crm";
import { huella } from "@/lib/firma";
import { sesionConOrg } from "@/lib/sesion";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

type Db = Awaited<ReturnType<typeof sesionConOrg>>["supabase"];

// Arma el borrador del contrato con los datos del contrato, la casa, el dueño y la administradora.
export async function prepararContrato(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const contratoId = txt(f, "contrato_id", 40);
  if (!esUuid(contratoId)) return;
  const { data: previo } = await supabase.from("documentos_contrato").select("id").eq("contrato_id", contratoId).neq("estado", "firmado").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previo) redirect(`/contratos/${previo.id}`);

  const { data: c } = await supabase
    .from("contratos")
    .select("id, inicio, fin, renta, dia_pago, deposito, recargo_pct, referencia, poliza_proveedor, poliza_numero, inquilinos(nombre), propiedades(direccion, colonia, ciudad, nombre, mascotas, duenos(nombre))")
    .eq("id", contratoId)
    .maybeSingle();
  if (!c) throw new Error("No encontramos el contrato.");
  const k = c as unknown as {
    id: string;
    inicio: string;
    fin: string;
    renta: number;
    dia_pago: number;
    deposito: number | null;
    recargo_pct: number | null;
    referencia: string | null;
    poliza_proveedor: string | null;
    poliza_numero: string | null;
    inquilinos: { nombre: string } | null;
    propiedades: { direccion: string | null; colonia: string | null; ciudad: string | null; nombre: string; mascotas: boolean | null; duenos: { nombre: string } | null } | null;
  };
  const { data: o } = await supabase.from("organizaciones").select("nombre, datos_pago").eq("id", org.id).single();
  const p = k.propiedades;
  const contenido = generarContrato({
    ciudad: p?.ciudad || "Querétaro, Querétaro",
    hoy: hoyMX(),
    administradora: o?.nombre ?? org.nombre,
    arrendador: p?.duenos?.nombre ?? null,
    arrendatario: k.inquilinos?.nombre ?? "[NOMBRE DEL ARRENDATARIO]",
    fiador: txt(f, "fiador", 120) || null,
    inmueble: [p?.direccion, p?.colonia, p?.ciudad].filter(Boolean).join(", ") || p?.nombre || "[DIRECCIÓN DEL INMUEBLE]",
    inicio: k.inicio,
    fin: k.fin,
    renta: Number(k.renta),
    diaPago: k.dia_pago,
    deposito: k.deposito != null ? Number(k.deposito) : null,
    recargoPct: k.recargo_pct ? Number(k.recargo_pct) : null,
    datosPago: o?.datos_pago ?? null,
    referencia: k.referencia,
    mascotas: !!p?.mascotas,
    poliza: k.poliza_proveedor ? { proveedor: k.poliza_proveedor, numero: k.poliza_numero } : null,
  });
  const { data, error } = await supabase.from("documentos_contrato").insert({ organizacion_id: org.id, contrato_id: k.id, contenido }).select("id").single();
  if (error || !data) throw new Error("No pudimos crear el contrato.");
  redirect(`/contratos/${data.id}`);
}

async function documento(supabase: Db, id: string) {
  if (!esUuid(id)) throw new Error("Contrato no válido.");
  const { data } = await supabase.from("documentos_contrato").select("id, contenido, estado, contratos(inquilino_id, inquilinos(nombre, telefono), propiedades(duenos(nombre, telefono)))").eq("id", id).maybeSingle();
  if (!data) throw new Error("No encontramos el contrato.");
  return data as unknown as {
    id: string;
    contenido: string;
    estado: string;
    contratos: { inquilino_id: string; inquilinos: { nombre: string; telefono: string | null } | null; propiedades: { duenos: { nombre: string; telefono: string | null } | null } | null } | null;
  };
}

export async function guardarTexto(f: FormData) {
  const { supabase } = await sesionConOrg();
  const d = await documento(supabase, txt(f, "id", 40));
  if (d.estado !== "borrador") throw new Error("Ya se mandó a firmar.");
  const contenido = String(f.get("contenido") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 60000);
  if (contenido.length < 200) throw new Error("El contrato quedó demasiado corto.");
  await supabase.from("documentos_contrato").update({ contenido }).eq("id", d.id);
  revalidatePath(`/contratos/${d.id}`);
}

// Fija el texto (huella SHA-256) y crea un link de firma para cada persona.
export async function mandarAFirmar(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  const d = await documento(supabase, txt(f, "id", 40));
  if (d.estado !== "borrador") return;
  const inq = d.contratos?.inquilinos;
  const dueno = d.contratos?.propiedades?.duenos;
  const firmantes = [
    { rol: "arrendatario", nombre: inq?.nombre ?? "", telefono: inq?.telefono ?? null },
    ...(dueno && f.get("con_dueno") === "on" ? [{ rol: "arrendador", nombre: dueno.nombre, telefono: dueno.telefono }] : []),
    ...(txt(f, "fiador", 120) ? [{ rol: "fiador", nombre: txt(f, "fiador", 120), telefono: txt(f, "fiador_tel", 30) || null }] : []),
    ...(f.get("con_admin") === "on" && txt(f, "admin_nombre", 120) ? [{ rol: "administradora", nombre: txt(f, "admin_nombre", 120), telefono: null }] : []),
  ].filter((x) => x.nombre);
  if (!firmantes.length) throw new Error("Falta quién firma.");
  const { error } = await supabase.from("firmas_contrato").insert(firmantes.map((x) => ({ ...x, organizacion_id: org.id, documento_id: d.id })));
  if (error) throw new Error("No pudimos preparar las firmas.");
  await supabase.from("documentos_contrato").update({ estado: "enviado", hash: huella(d.contenido), enviado_at: new Date().toISOString() }).eq("id", d.id);
  revalidatePath(`/contratos/${d.id}`);
  if (d.contratos?.inquilino_id) revalidatePath(`/personas/inquilinos/${d.contratos.inquilino_id}`);
}

// Si nadie ha firmado, se puede regresar a borrador para corregir.
export async function regresarABorrador(f: FormData) {
  const { supabase } = await sesionConOrg();
  const d = await documento(supabase, txt(f, "id", 40));
  const { count } = await supabase.from("firmas_contrato").select("id", { count: "exact", head: true }).eq("documento_id", d.id).not("firmada_at", "is", null);
  if (count) throw new Error("Ya hay firmas; ya no se puede editar.");
  await supabase.from("firmas_contrato").delete().eq("documento_id", d.id);
  await supabase.from("documentos_contrato").update({ estado: "borrador", hash: null, enviado_at: null }).eq("id", d.id);
  revalidatePath(`/contratos/${d.id}`);
}

export async function guardarPoliza(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "contrato_id", 40);
  if (!esUuid(id)) return;
  const vence = txt(f, "poliza_vence", 10);
  const costo = Number(txt(f, "poliza_costo", 20).replace(/[^0-9.]/g, ""));
  const { data } = await supabase
    .from("contratos")
    .update({
      poliza_proveedor: txt(f, "poliza_proveedor", 80) || null,
      poliza_numero: txt(f, "poliza_numero", 80) || null,
      poliza_vence: /^\d{4}-\d{2}-\d{2}$/.test(vence) ? vence : null,
      poliza_costo: costo > 0 ? costo : null,
    })
    .eq("id", id)
    .select("inquilino_id")
    .maybeSingle();
  if (data) revalidatePath(`/personas/inquilinos/${data.inquilino_id}`);
}
