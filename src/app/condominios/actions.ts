"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sesionConOrg } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { estadoPlan, puedeAgregar } from "@/lib/plan";
import { BUCKET, MAX_ENVIO, extension } from "@/lib/datos";
import { aCentavos, esUuid } from "@/lib/condominios";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const ruta = (id: string, vista?: string, extra = "") => `/condominios/${id}${vista ? `?vista=${vista}${extra}` : ""}`;

// Condominio de la administradora (RLS) o error.
async function condominio(f: FormData) {
  const s = await sesionConOrg();
  const id = txt(f, "condominio_id", 40);
  if (!esUuid(id)) throw new Error("Condominio no válido.");
  const { data: c } = await s.supabase.from("condominios").select("id, organizacion_id, nombre").eq("id", id).maybeSingle();
  if (!c) throw new Error("No encontramos el condominio.");
  return { ...s, c };
}
const falla = (e: { message?: string } | null, msg: string) => {
  if (!e) return;
  const m = e.message ?? "";
  throw new Error(/permission|violates|syntax|duplicate|function/i.test(m) || !m ? msg : m);
};

// ─── Condominio ───
export async function crearCondominio(f: FormData) {
  const { supabase, org } = await sesionConOrg();
  if (!puedeAgregar(await estadoPlan(supabase, org.id))) redirect("/plan?limite=1");
  const nombre = txt(f, "nombre", 120);
  if (!nombre) throw new Error("Escribe el nombre del condominio.");
  const { data, error } = await supabase.rpc("crear_condominio", { p_org: org.id, p_nombre: nombre, p_direccion: txt(f, "direccion") || null, p_colonia: txt(f, "colonia", 120) || null });
  falla(error, "No pudimos crear el condominio. Solo la propietaria o un admin puede hacerlo.");
  revalidatePath("/condominios");
  redirect(ruta(data as string, "viviendas"));
}

export async function cargarEjemplo() {
  const { supabase, org } = await sesionConOrg();
  if (!puedeAgregar(await estadoPlan(supabase, org.id), 2)) redirect("/plan?limite=1");
  const { error } = await supabase.rpc("demo_condominios", { p_org: org.id });
  falla(error, "No pudimos cargar los ejemplos.");
  revalidatePath("/condominios");
  redirect("/condominios?ejemplo=1");
}

export async function editarCondominio(f: FormData) {
  const { supabase, c } = await condominio(f);
  const cambios: Record<string, unknown> = {
    nombre: txt(f, "nombre", 120) || c.nombre,
    direccion: txt(f, "direccion") || null,
    datos_pago: txt(f, "datos_pago", 400) || null,
    comite_exporta: f.get("comite_exporta") === "on",
    recibo_serie: (txt(f, "recibo_serie", 8) || "R").toUpperCase().replace(/[^A-Z0-9]/g, "") || "R",
  };
  const foto = f.get("foto");
  if (foto instanceof File && foto.size > 0) {
    if (!foto.type.startsWith("image/") || foto.size > MAX_ENVIO) throw new Error("La foto debe ser una imagen de menos de 4 MB.");
    const path = `${c.organizacion_id}/condominios/${c.id}/portada-${randomUUID().slice(0, 8)}.${extension(foto.name, foto.type)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, foto, { contentType: foto.type });
    if (error) throw new Error("No pudimos subir la foto.");
    cambios.foto_path = path;
  }
  const { error } = await supabase.from("condominios").update(cambios).eq("id", c.id);
  falla(error, "No pudimos guardar.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function renovarLink(f: FormData) {
  const { supabase, c } = await condominio(f);
  const cual = txt(f, "cual", 10);
  const { error } = cual === "alta" ? await supabase.rpc("renovar_alta_token", { p_condominio: c.id }) : await supabase.rpc("renovar_token_condominio", { p_condominio: c.id, p_cual: cual });
  falla(error, "Solo la propietaria o un admin puede cambiar los links.");
  revalidatePath(`/condominios/${c.id}`);
}

// ─── Viviendas y residentes ───
export async function crearZona(f: FormData) {
  const { supabase, c } = await condominio(f);
  const nombre = txt(f, "nombre", 60);
  if (!nombre) return;
  const { error } = await supabase.from("zonas_condominio").insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, nombre, tipo: ["torre", "calle", "seccion"].includes(txt(f, "tipo")) ? txt(f, "tipo") : "calle" });
  falla(error, "Ya existe una zona con ese nombre.");
  revalidatePath(`/condominios/${c.id}`);
}

// "Casa" + del 1 al 60, o una lista (una por renglón).
export async function crearViviendas(f: FormData) {
  const { supabase, c } = await condominio(f);
  const zona = txt(f, "zona_id", 40);
  let numeros: string[] = [];
  const lista = txt(f, "lista", 20000);
  if (lista) numeros = lista.split(/\r?\n|,/).map((x) => x.trim().slice(0, 30)).filter(Boolean);
  else {
    const prefijo = txt(f, "prefijo", 20);
    const desde = Number(txt(f, "desde", 5));
    const hasta = Number(txt(f, "hasta", 5));
    if (!Number.isInteger(desde) || !Number.isInteger(hasta) || hasta < desde || hasta - desde > 999) throw new Error("Revisa el rango de números.");
    for (let i = desde; i <= hasta; i++) numeros.push(`${prefijo ? `${prefijo} ` : ""}${i}`.trim());
  }
  if (!numeros.length) return;
  const { error } = await supabase
    .from("viviendas")
    .upsert(
      [...new Set(numeros)].map((numero) => ({ organizacion_id: c.organizacion_id, condominio_id: c.id, numero, zona_id: esUuid(zona) ? zona : null })),
      { onConflict: "condominio_id,numero", ignoreDuplicates: true },
    );
  falla(error, "No pudimos crear las viviendas.");
  revalidatePath(`/condominios/${c.id}`);
}

// Padrón desde Excel/CSV: vivienda, zona, nombre, teléfono, tipo, saldo inicial (+ debe, − a favor).
export async function importarPadron(f: FormData) {
  const { supabase, c, user } = await condominio(f);
  const lineas = txt(f, "padron", 200000).split(/\r?\n/).map((l) => l.split(/\t|,|;/).map((x) => x.trim()));
  const filas = lineas.filter((l) => l[0] && !/^vivienda$/i.test(l[0]));
  if (!filas.length) throw new Error("Pega al menos un renglón.");
  if (filas.length > 2000) throw new Error("Máximo 2,000 renglones por vez.");

  const { data: zonasExistentes } = await supabase.from("zonas_condominio").select("id, nombre").eq("condominio_id", c.id);
  const zonas = new Map((zonasExistentes ?? []).map((z) => [z.nombre.toLowerCase(), z.id as string]));
  for (const nombre of new Set(filas.map((l) => l[1]).filter(Boolean))) {
    if (zonas.has(nombre.toLowerCase())) continue;
    const { data } = await supabase.from("zonas_condominio").insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, nombre: nombre.slice(0, 60), tipo: /torre/i.test(nombre) ? "torre" : "calle" }).select("id").single();
    if (data) zonas.set(nombre.toLowerCase(), data.id);
  }
  await supabase.from("viviendas").upsert(
    [...new Map(filas.map((l) => [l[0], l])).values()].map((l) => ({ organizacion_id: c.organizacion_id, condominio_id: c.id, numero: l[0].slice(0, 30), zona_id: l[1] ? (zonas.get(l[1].toLowerCase()) ?? null) : null })),
    { onConflict: "condominio_id,numero", ignoreDuplicates: true },
  );
  const { data: vs } = await supabase.from("viviendas").select("id, numero").eq("condominio_id", c.id);
  const viv = new Map((vs ?? []).map((v) => [v.numero, v.id as string]));
  const residentes = filas
    .filter((l) => l[2] && viv.has(l[0]))
    .map((l) => ({ organizacion_id: c.organizacion_id, condominio_id: c.id, vivienda_id: viv.get(l[0])!, nombre: l[2].slice(0, 120), telefono: l[3]?.slice(0, 30) || null, tipo: /inq/i.test(l[4] ?? "") ? "inquilino" : "propietario" }));
  if (residentes.length) falla((await supabase.from("residentes").insert(residentes)).error, "No pudimos guardar a los residentes.");
  const saldos = filas
    .map((l) => ({ v: viv.get(l[0]), n: Math.round(Number(String(l[5] ?? "").replace(/[^0-9.-]/g, "")) * 100) }))
    .filter((x) => x.v && Number.isSafeInteger(x.n) && x.n !== 0)
    .map((x) => ({ organizacion_id: c.organizacion_id, condominio_id: c.id, vivienda_id: x.v!, monto_centavos: x.n, tipo: "saldo_inicial", motivo: "Saldo inicial importado", creado_por: user.email }));
  if (saldos.length) falla((await supabase.from("ajustes_saldo").insert(saldos)).error, "No pudimos guardar los saldos iniciales.");
  revalidatePath(`/condominios/${c.id}`);
  redirect(ruta(c.id, "viviendas", `&importado=${filas.length}`));
}

export async function agregarResidente(f: FormData) {
  const { supabase, c } = await condominio(f);
  const vivienda = txt(f, "vivienda_id", 40);
  const nombre = txt(f, "nombre", 120);
  if (!esUuid(vivienda) || !nombre) throw new Error("Elige la vivienda y escribe el nombre.");
  const { data, error } = await supabase
    .from("residentes")
    .insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, vivienda_id: vivienda, nombre, telefono: txt(f, "telefono", 30) || null, email: txt(f, "email", 160).toLowerCase() || null, tipo: txt(f, "tipo") === "inquilino" ? "inquilino" : "propietario" })
    .select("id")
    .single();
  falla(error, "No pudimos guardar al residente.");
  revalidatePath(`/condominios/${c.id}`);
  redirect(ruta(c.id, "viviendas", `&nuevo=${data!.id}#r-${data!.id}`));
}

export async function guardarPermisos(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "residente_id", 40);
  if (!esUuid(id)) return;
  const permisos = Object.fromEntries(["pases", "reportes", "ver_cuenta", "registrar_pagos"].map((k) => [k, f.get(k) === "on"]));
  const { error } = await supabase.from("residentes").update({ permisos, tipo: txt(f, "tipo") === "inquilino" ? "inquilino" : "propietario" }).eq("id", id).eq("condominio_id", c.id);
  falla(error, "No pudimos guardar los permisos.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function estadoResidente(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "residente_id", 40);
  if (!esUuid(id)) return;
  if (txt(f, "accion") === "renovar") falla((await supabase.rpc("renovar_token_residente", { p_residente: id })).error, "No pudimos cambiar el link.");
  else falla((await supabase.from("residentes").update({ activo: txt(f, "accion") === "activar" }).eq("id", id).eq("condominio_id", c.id)).error, "No pudimos guardar.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function decidirAlta(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "solicitud_id", 40);
  if (!esUuid(id)) return;
  const { data, error } = await supabase.rpc("decidir_alta", { p_solicitud: id, p_aprobar: txt(f, "decision") === "aprobar", p_nota: txt(f, "nota", 300) });
  falla(error, "No pudimos guardar la decisión.");
  const r = data as { residente_id: string | null; borrar: string[] };
  // Minimización de datos: las fotos de la INE y la selfie se borran en cuanto se decide.
  if (r.borrar?.length) await createAdminClient().storage.from(BUCKET).remove(r.borrar);
  revalidatePath(`/condominios/${c.id}`);
  redirect(ruta(c.id, "viviendas", r.residente_id ? `&nuevo=${r.residente_id}#r-${r.residente_id}` : ""));
}

// ─── Cuotas, pagos, ajustes y gastos ───
export async function cargarCuota(f: FormData) {
  const { supabase, c } = await condominio(f);
  const monto = aCentavos(txt(f, "monto", 20));
  const periodo = txt(f, "periodo", 7);
  if (!monto || !/^\d{4}-\d{2}$/.test(periodo)) throw new Error("Revisa el monto y el mes.");
  const zona = txt(f, "zona_id", 40);
  const { data, error } = await supabase.rpc("cargar_cuota", {
    p_condominio: c.id,
    p_concepto: txt(f, "concepto", 20) || "mantenimiento",
    p_periodo: `${periodo}-01`,
    p_monto_centavos: monto,
    p_vence: txt(f, "vence", 10) || null,
    p_zona: esUuid(zona) ? zona : null,
    p_descripcion: txt(f, "descripcion", 120),
  });
  falla(error, "No pudimos cargar la cuota.");
  revalidatePath(`/condominios/${c.id}`);
  redirect(ruta(c.id, "cuotas", `&cargados=${data}`));
}

export async function registrarPago(f: FormData) {
  const { supabase, c, user } = await condominio(f);
  const vivienda = txt(f, "vivienda_id", 40);
  const monto = aCentavos(txt(f, "monto", 20));
  const clave = txt(f, "clave", 40);
  if (!esUuid(vivienda) || !monto || !esUuid(clave)) throw new Error("Elige la vivienda y el monto.");
  // La clave del formulario evita duplicar el pago si se envía dos veces.
  const { data: previo } = await supabase.from("pagos_condominio").select("id").eq("condominio_id", c.id).eq("clave_cliente", clave).maybeSingle();
  let id = previo?.id as string | undefined;
  if (!id) {
    const { data, error } = await supabase
      .from("pagos_condominio")
      .insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, vivienda_id: vivienda, monto_centavos: monto, referencia: txt(f, "referencia", 60) || null, pagado_el: txt(f, "pagado_el", 10), registrado_por: user.email ?? "administradora", clave_cliente: clave })
      .select("id")
      .single();
    falla(error, "No pudimos registrar el pago.");
    id = data!.id;
  }
  falla((await supabase.rpc("confirmar_pago_condominio", { p_pago: id })).error, "No pudimos confirmar el pago.");
  revalidatePath(`/condominios/${c.id}`);
  redirect(ruta(c.id, "cuotas", "&pago=1"));
}

export async function revisarPago(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "pago_id", 40);
  if (!esUuid(id)) return;
  const { error } = txt(f, "decision") === "confirmar" ? await supabase.rpc("confirmar_pago_condominio", { p_pago: id }) : await supabase.rpc("rechazar_pago_condominio", { p_pago: id, p_nota: txt(f, "nota", 300) });
  falla(error, "No pudimos guardar la revisión.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function ajustarSaldo(f: FormData) {
  const { supabase, c, user } = await condominio(f);
  const vivienda = txt(f, "vivienda_id", 40);
  const monto = aCentavos(txt(f, "monto", 20));
  const motivo = txt(f, "motivo", 300);
  if (!esUuid(vivienda) || !monto || motivo.length < 3) throw new Error("Elige la vivienda, el monto y el motivo.");
  const signo = txt(f, "sentido") === "favor" ? -1 : 1;
  const { error } = await supabase.from("ajustes_saldo").insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, vivienda_id: vivienda, monto_centavos: signo * monto, tipo: txt(f, "tipo") === "saldo_inicial" ? "saldo_inicial" : "ajuste", motivo, creado_por: user.email });
  falla(error, "No pudimos guardar el ajuste.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function registrarGasto(f: FormData) {
  const { supabase, c, user } = await condominio(f);
  const monto = aCentavos(txt(f, "monto", 20));
  const descripcion = txt(f, "descripcion", 300);
  if (!monto || !descripcion) throw new Error("Escribe el concepto y el monto.");
  const proveedor = txt(f, "proveedor_id", 40);
  let comprobante: string | null = null;
  const archivo = f.get("comprobante");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > MAX_ENVIO) throw new Error("El comprobante pesa más de 4 MB.");
    comprobante = `${c.organizacion_id}/condominios/${c.id}/gastos/${randomUUID()}.${extension(archivo.name, archivo.type)}`;
    if ((await supabase.storage.from(BUCKET).upload(comprobante, archivo, { contentType: archivo.type })).error) throw new Error("No pudimos subir el comprobante.");
  }
  const { error } = await supabase.from("gastos_condominio").insert({
    organizacion_id: c.organizacion_id,
    condominio_id: c.id,
    categoria: txt(f, "categoria", 40) || "Otro",
    descripcion,
    proveedor_id: esUuid(proveedor) ? proveedor : null,
    monto_centavos: monto,
    fecha: txt(f, "fecha", 10),
    comprobante_path: comprobante,
    creado_por: user.email,
  });
  falla(error, "No pudimos guardar el gasto.");
  revalidatePath(`/condominios/${c.id}`);
}

// ─── Accesos, avisos y caseta ───
export async function revisarAcceso(f: FormData) {
  const { supabase, c, user } = await condominio(f);
  const id = txt(f, "acceso_id", 40);
  if (!esUuid(id)) return;
  const { error } = await supabase.from("accesos").update({ revision: "revisado", nota_revision: txt(f, "nota", 300) || null, revisado_por: user.email }).eq("id", id).eq("condominio_id", c.id);
  falla(error, "No pudimos guardar.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function publicarAviso(f: FormData) {
  const { supabase, c, user } = await condominio(f);
  const zona = txt(f, "zona_id", 40);
  const { error } = await supabase.from("avisos_condominio").insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, zona_id: esUuid(zona) ? zona : null, titulo: txt(f, "titulo", 120), cuerpo: txt(f, "cuerpo", 2000), creado_por: user.email });
  falla(error, "Escribe título y mensaje.");
  revalidatePath(`/condominios/${c.id}`);
  redirect(ruta(c.id, "avisos", "&publicado=1"));
}

export async function guardarGuardia(f: FormData) {
  const { supabase, c } = await condominio(f);
  const pin = txt(f, "pin", 8);
  let id = txt(f, "guardia_id", 40);
  if (!esUuid(id)) {
    const nombre = txt(f, "nombre", 80);
    if (!nombre || !/^\d{4,8}$/.test(pin)) throw new Error("Escribe el nombre y un PIN de 4 a 8 números.");
    const { data, error } = await supabase.from("guardias").insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, nombre }).select("id").single();
    falla(error, "No pudimos guardar al guardia.");
    id = data!.id;
  }
  if (txt(f, "accion") === "baja" || txt(f, "accion") === "alta") {
    falla((await supabase.from("guardias").update({ activo: txt(f, "accion") === "alta" }).eq("id", id)).error, "No pudimos guardar.");
  } else if (pin) {
    falla((await supabase.rpc("fijar_pin_guardia", { p_guardia: id, p_pin: pin })).error, "El PIN debe tener de 4 a 8 números.");
  }
  revalidatePath(`/condominios/${c.id}`);
}

// ─── Amenidades, reservas y mudanzas ───
export async function guardarAmenidad(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "amenidad_id", 40);
  const duraciones = txt(f, "duraciones", 60).split(/[ ,]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 15 && n <= 1440);
  const fila: Record<string, unknown> = {
    nombre: txt(f, "nombre", 80),
    tipo: txt(f, "tipo", 20) || "otro",
    modo: txt(f, "modo") === "solicitud" ? "solicitud" : "turnos",
    capacidad: Math.max(1, Number(txt(f, "capacidad", 5)) || 1),
    hora_abre: txt(f, "hora_abre", 5) || "07:00",
    hora_cierra: txt(f, "hora_cierra", 5) || "22:00",
    duraciones: duraciones.length ? duraciones : [60],
    renta_centavos: aCentavos(txt(f, "renta", 20)) ?? 0,
    deposito_centavos: aCentavos(txt(f, "deposito", 20)) ?? 0,
    descripcion: txt(f, "descripcion", 300) || null,
    reglas: txt(f, "reglas", 2000) || null,
    activo: f.get("activo") !== "off",
  };
  const foto = f.get("foto");
  if (foto instanceof File && foto.size > 0) {
    if (!foto.type.startsWith("image/") || foto.size > MAX_ENVIO) throw new Error("La foto debe ser una imagen de menos de 4 MB.");
    const path = `${c.organizacion_id}/condominios/${c.id}/amenidades/${randomUUID()}.${extension(foto.name, foto.type)}`;
    if ((await supabase.storage.from(BUCKET).upload(path, foto, { contentType: foto.type })).error) throw new Error("No pudimos subir la foto.");
    fila.foto_path = path;
  }
  const { error } = esUuid(id)
    ? await supabase.from("amenidades").update(fila).eq("id", id).eq("condominio_id", c.id)
    : await supabase.from("amenidades").insert({ ...fila, organizacion_id: c.organizacion_id, condominio_id: c.id });
  falla(error, "Revisa los datos de la amenidad.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function revisarReserva(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "reserva_id", 40);
  if (!esUuid(id)) return;
  const d = txt(f, "decision");
  const { error } =
    d === "devolver" || d === "retener"
      ? await supabase.rpc("cerrar_deposito", { p_reserva: id, p_devolver: d === "devolver", p_nota: txt(f, "nota", 300) })
      : d === "cancelar"
        ? await supabase.from("reservas").update({ estado: "cancelada", nota: txt(f, "nota", 300) || "Cancelada por la administración" }).eq("id", id).eq("condominio_id", c.id)
        : await supabase.rpc("decidir_reserva", { p_reserva: id, p_aprobar: d === "aprobar", p_nota: txt(f, "nota", 300) });
  falla(error, "No pudimos guardar.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function revisarMudanza(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "mudanza_id", 40);
  if (!esUuid(id)) return;
  const { error } = await supabase.rpc("decidir_mudanza", { p_mudanza: id, p_aprobar: txt(f, "decision") === "aprobar", p_nota: txt(f, "nota", 300) });
  falla(error, "No pudimos guardar.");
  revalidatePath(`/condominios/${c.id}`);
}

// ─── Reportes de vecinos (desde el ticket) ───
export async function seguimientoReporte(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "ticket_id", 40);
  if (!esUuid(id)) return;
  const cambios: Record<string, unknown> = {
    responsable: txt(f, "responsable", 80) || null,
    fecha_compromiso: txt(f, "fecha_compromiso", 10) || null,
    resolucion: txt(f, "resolucion", 500) || null,
  };
  if (f.get("cerrar") === "1") {
    if (!cambios.resolucion) throw new Error("Escribe qué se hizo para cerrar el reporte.");
    cambios.estado = "resuelto";
    cambios.resuelto_at = new Date().toISOString();
  }
  const { error } = await supabase.from("tickets").update(cambios).eq("id", id);
  falla(error, "No pudimos guardar el seguimiento.");
  revalidatePath(`/tickets/${id}`);
}
