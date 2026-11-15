"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { sesionConOrg } from "@/lib/sesion";
import { avisarCondominio, avisarVivienda } from "@/lib/push";
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
  await supabase.rpc("demo_condominios_extra", { p_org: org.id });
  await supabase.rpc("demo_condominios_piloto", { p_org: org.id });
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
  const columnas: Record<string, [string, number]> = { timbre: ["timbre_token", 16], kiosco: ["kiosco_token", 24], lpr: ["lpr_token", 32] };
  if (columnas[cual]) {
    const [col, largo] = columnas[cual];
    const { data: nuevo } = await supabase.rpc("token_opaco", { largo });
    falla((await supabase.from("condominios").update({ [col]: nuevo }).eq("id", c.id)).error, "No pudimos cambiar el link.");
    revalidatePath(`/condominios/${c.id}`);
    return;
  }
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
  for (const l of filas) {
    const ind = Number(String(l[6] ?? "").replace(/[^0-9.]/g, ""));
    if (l[6] && ind > 0 && ind <= 100 && viv.has(l[0])) await supabase.from("viviendas").update({ indiviso: ind }).eq("id", viv.get(l[0])!);
  }
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
    equipo_id: esUuid(txt(f, "equipo_id", 40)) ? txt(f, "equipo_id", 40) : null,
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
  const urgente = f.get("urgente") === "on";
  const titulo = txt(f, "titulo", 120);
  const { error } = await supabase.from("avisos_condominio").insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, zona_id: esUuid(zona) ? zona : null, titulo, cuerpo: txt(f, "cuerpo", 2000), creado_por: user.email, urgente });
  falla(error, "Escribe título y mensaje.");
  // Urgente: notificación en el celular de cada residente (de la zona) que activó avisos.
  if (urgente) avisarCondominio(c.id, esUuid(zona) ? zona : null, (t) => ({ titulo: `⚠️ ${titulo}`, cuerpo: txt(f, "cuerpo", 160), url: `/vecino/${t}/avisos`, tag: `aviso-${Date.now()}` }));
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
    inventario: txt(f, "inventario", 2000) || null,
    minutos_oferta: Math.min(2880, Math.max(10, Number(txt(f, "minutos_oferta", 5)) || 120)),
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
  if (f.has("equipo_id")) cambios.equipo_id = esUuid(txt(f, "equipo_id", 40)) ? txt(f, "equipo_id", 40) : null;
  if (f.get("cerrar") === "1") {
    if (!cambios.resolucion) throw new Error("Escribe qué se hizo para cerrar el reporte.");
    cambios.estado = "resuelto";
    cambios.resuelto_at = new Date().toISOString();
  }
  const { error } = await supabase.from("tickets").update(cambios).eq("id", id);
  falla(error, "No pudimos guardar el seguimiento.");
  revalidatePath(`/tickets/${id}`);
}

// ─────────────────────────── Seguridad ───────────────────────────
export async function guardarVetado(f: FormData) {
  const { supabase, c, user } = await condominio(f);
  const id = txt(f, "vetado_id", 40);
  if (esUuid(id)) {
    falla((await supabase.from("vetados").update({ activo: txt(f, "accion") === "activar" }).eq("id", id).eq("condominio_id", c.id)).error, "No pudimos guardar.");
  } else {
    const { error } = await supabase.from("vetados").insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, nombre: txt(f, "nombre", 120) || null, placa: txt(f, "placa", 12).toUpperCase() || null, motivo: txt(f, "motivo", 300), creado_por: user.email });
    falla(error, "Escribe nombre o placa, y el motivo.");
  }
  revalidatePath(`/condominios/${c.id}`);
}

export async function atenderAlerta(f: FormData) {
  const { supabase, c, user } = await condominio(f);
  const id = txt(f, "alerta_id", 40);
  const q = supabase.from("alertas_condominio").update({ atendida_at: new Date().toISOString(), atendida_por: user.email }).eq("condominio_id", c.id).is("atendida_at", null);
  falla((esUuid(id) ? await q.eq("id", id) : await q).error, "No pudimos guardar.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function guardarVehiculoAdmin(f: FormData) {
  const { supabase, c } = await condominio(f);
  const borrar = txt(f, "vehiculo_id", 40);
  if (esUuid(borrar)) {
    falla((await supabase.from("vehiculos").delete().eq("id", borrar).eq("condominio_id", c.id)).error, "No pudimos quitarlo.");
  } else {
    const vivienda = txt(f, "vivienda_id", 40);
    const placa = txt(f, "placa", 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!esUuid(vivienda) || placa.length < 4) throw new Error("Elige la vivienda y escribe la placa.");
    falla((await supabase.from("vehiculos").insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, vivienda_id: vivienda, placa, descripcion: txt(f, "descripcion", 60) || null })).error, "Esa placa ya está registrada.");
  }
  revalidatePath(`/condominios/${c.id}`);
}

export async function guardarPunto(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "punto_id", 40);
  if (esUuid(id)) falla((await supabase.from("puntos_rondin").update({ activo: txt(f, "accion") === "activar" }).eq("id", id).eq("condominio_id", c.id)).error, "No pudimos guardar.");
  else falla((await supabase.from("puntos_rondin").insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, nombre: txt(f, "nombre", 80), orden: Number(txt(f, "orden", 3)) || 0 })).error, "Escribe el nombre del punto.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function guardarRelevadores(f: FormData) {
  const { supabase, c } = await condominio(f);
  const url = (k: string) => {
    const v = txt(f, k, 300);
    if (v && !/^https:\/\/[^\s]+$/.test(v)) throw new Error("Las ligas deben empezar con https://");
    return v || null;
  };
  const cambios: Record<string, unknown> = { pluma_url: url("pluma_url"), paquetes_url: url("paquetes_url"), lpr_abre_visitas: f.get("lpr_abre_visitas") === "on" };
  const auth = txt(f, "pluma_auth", 300);
  if (auth) cambios.pluma_auth = auth === "-" ? null : auth;
  falla((await supabase.from("condominios").update(cambios).eq("id", c.id)).error, "Solo la propietaria o un admin puede configurar los relevadores.");
  revalidatePath(`/condominios/${c.id}`);
}

// ─────────────────────────── Comunidad ───────────────────────────
export async function guardarAsamblea(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "asamblea_id", 40);
  const fila: Record<string, unknown> = {
    titulo: txt(f, "titulo", 120),
    tipo: txt(f, "tipo") === "extraordinaria" ? "extraordinaria" : "ordinaria",
    lugar: txt(f, "lugar", 200) || null,
    orden_del_dia: txt(f, "orden_del_dia", 4000) || null,
    acta: txt(f, "acta", 20000) || null,
    estado: ["convocada", "celebrada", "cancelada"].includes(txt(f, "estado")) ? txt(f, "estado") : "convocada",
  };
  const fecha = txt(f, "fecha", 16);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fecha)) fila.fecha = `${fecha}:00-06:00`;
  const { error } = esUuid(id)
    ? await supabase.from("asambleas").update(fila).eq("id", id).eq("condominio_id", c.id)
    : await supabase.from("asambleas").insert({ ...fila, organizacion_id: c.organizacion_id, condominio_id: c.id });
  falla(error, "Revisa título y fecha.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function guardarAcuerdo(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "acuerdo_id", 40);
  if (esUuid(id)) {
    falla((await supabase.from("acuerdos").update({ estado: txt(f, "estado", 20) }).eq("id", id).eq("condominio_id", c.id)).error, "No pudimos guardar.");
  } else {
    const asamblea = txt(f, "asamblea_id", 40);
    falla(
      (await supabase.from("acuerdos").insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, asamblea_id: esUuid(asamblea) ? asamblea : null, texto: txt(f, "texto", 500), responsable: txt(f, "responsable", 80) || null, fecha_limite: txt(f, "fecha_limite", 10) || null })).error,
      "Escribe el acuerdo.",
    );
  }
  revalidatePath(`/condominios/${c.id}`);
}

export async function crearVotacion(f: FormData) {
  const { supabase, c } = await condominio(f);
  const opciones = txt(f, "opciones", 600).split(/\r?\n/).map((x) => x.trim().slice(0, 80)).filter(Boolean);
  if (opciones.length < 2) throw new Error("Escribe al menos dos opciones, una por renglón.");
  const cierra = txt(f, "cierra", 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cierra)) throw new Error("Elige cuándo cierra.");
  const asamblea = txt(f, "asamblea_id", 40);
  const { error } = await supabase.from("votaciones").insert({
    organizacion_id: c.organizacion_id,
    condominio_id: c.id,
    asamblea_id: esUuid(asamblea) ? asamblea : null,
    pregunta: txt(f, "pregunta", 300),
    descripcion: txt(f, "descripcion", 1000) || null,
    opciones,
    cierra: `${cierra}:00-06:00`,
    solo_propietarios: f.get("solo_propietarios") === "on",
    resultados_en_vivo: f.get("en_vivo") === "on",
  });
  falla(error, "Revisa la pregunta y la fecha de cierre.");
  avisarCondominio(c.id, null, (t) => ({ titulo: "🗳️ Nueva votación", cuerpo: txt(f, "pregunta", 140), url: `/vecino/${t}/comunidad`, tag: `vot-${c.id}` }));
  revalidatePath(`/condominios/${c.id}`);
}

export async function cerrarVotacion(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "votacion_id", 40);
  if (!esUuid(id)) return;
  falla((await supabase.from("votaciones").update({ cierra: new Date().toISOString() }).eq("id", id).eq("condominio_id", c.id).gt("cierra", new Date().toISOString())).error, "No pudimos cerrarla.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function subirDocumento(f: FormData) {
  const { supabase, c } = await condominio(f);
  const archivo = f.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Elige el archivo.");
  if (archivo.size > MAX_ENVIO) throw new Error("El archivo pesa más de 4 MB.");
  const ruta = `${c.organizacion_id}/condominios/${c.id}/documentos/${randomUUID()}.${extension(archivo.name, archivo.type)}`;
  if ((await supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type })).error) throw new Error("No pudimos subir el archivo.");
  falla(
    (await supabase.from("documentos_condominio").insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, titulo: txt(f, "titulo", 120) || archivo.name.slice(0, 120), categoria: txt(f, "categoria", 30) || "otro", storage_path: ruta, visible_residentes: f.get("visible") === "on" })).error,
    "No pudimos guardar el documento.",
  );
  revalidatePath(`/condominios/${c.id}`);
}

export async function editarDocumento(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "documento_id", 40);
  if (!esUuid(id)) return;
  if (txt(f, "accion") === "borrar") {
    const { data: d } = await supabase.from("documentos_condominio").select("storage_path").eq("id", id).eq("condominio_id", c.id).maybeSingle();
    falla((await supabase.from("documentos_condominio").delete().eq("id", id)).error, "Solo la propietaria o un admin puede borrar documentos.");
    if (d) await supabase.storage.from(BUCKET).remove([d.storage_path]);
  } else {
    falla((await supabase.from("documentos_condominio").update({ visible_residentes: txt(f, "accion") === "mostrar" }).eq("id", id).eq("condominio_id", c.id)).error, "No pudimos guardar.");
  }
  revalidatePath(`/condominios/${c.id}`);
}

export async function ocultarPublicacion(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "publicacion_id", 40);
  if (esUuid(id)) falla((await supabase.from("tablero").update({ oculto: true }).eq("id", id).eq("condominio_id", c.id)).error, "No pudimos ocultarla.");
  revalidatePath(`/condominios/${c.id}`);
}

// ─────────────────────────── Conciliación bancaria ───────────────────────────
// Lee un estado de cuenta pegado o subido (CSV de cualquier banco): detecta columnas de fecha, concepto, referencia y abono.
function leerEstadoCuenta(texto: string) {
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = [";", "\t", ","].map((s) => [s, (lineas[0]?.match(new RegExp(s === "\t" ? "\t" : `\\${s}`, "g")) ?? []).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const partir = (l: string) => {
    const out: string[] = [];
    let cur = "";
    let comillas = false;
    for (const ch of l) {
      if (ch === '"') comillas = !comillas;
      else if (ch === sep && !comillas) {
        out.push(cur.trim());
        cur = "";
      }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const filas = lineas.map(partir);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const enc = filas[0].map(norm);
  const col = (...k: string[]) => enc.findIndex((h) => k.some((x) => h.includes(x)));
  const iF = col("fecha", "date");
  const iD = col("descripcion", "concepto", "detalle", "movimiento");
  const iR = col("referencia", "rastreo", "folio");
  const iA = col("abono", "deposito", "credito", "ingreso", "importe", "monto");
  if (iF < 0 || iA < 0) throw new Error("No encontramos las columnas de fecha y abono/depósito en el encabezado.");
  const fecha = (v: string) => {
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  };
  const vistos = new Map<string, number>();
  return filas
    .slice(1)
    .map((f) => {
      const monto = aCentavos((f[iA] ?? "").replace(/[$\s]/g, ""));
      const fe = fecha(f[iF] ?? "");
      if (!monto || !fe || (f[iA] ?? "").trim().startsWith("-")) return null;
      const descripcion = (iD >= 0 ? f[iD] : "")?.slice(0, 200) || null;
      const referencia = (iR >= 0 ? f[iR] : "")?.slice(0, 60) || null;
      const base = `${fe}|${monto}|${descripcion}|${referencia}`;
      const n = (vistos.get(base) ?? 0) + 1;
      vistos.set(base, n);
      return { fecha: fe, monto_centavos: monto, descripcion, referencia, huella: createHash("sha256").update(`${base}|${n}`).digest("hex") };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

export async function importarBanco(f: FormData) {
  const { supabase, c } = await condominio(f);
  let texto = txt(f, "texto", 500000);
  const archivo = f.get("archivo");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > MAX_ENVIO) throw new Error("El archivo pesa más de 4 MB.");
    texto = await archivo.text();
  }
  if (!texto) throw new Error("Sube el CSV o pega el estado de cuenta.");
  const movs = leerEstadoCuenta(texto);
  if (!movs.length) throw new Error("No encontramos abonos en el archivo.");
  const { error, count } = await supabase
    .from("movimientos_banco")
    .upsert(movs.map((m) => ({ ...m, organizacion_id: c.organizacion_id, condominio_id: c.id })), { onConflict: "condominio_id,huella", ignoreDuplicates: true, count: "exact" });
  falla(error, "No pudimos guardar los movimientos.");
  revalidatePath(`/condominios/${c.id}`);
  redirect(ruta(c.id, "cuotas", `&banco=${count ?? movs.length}#conciliacion`));
}

export async function conciliar(f: FormData) {
  const { supabase, c } = await condominio(f);
  const mov = txt(f, "movimiento_id", 40);
  if (!esUuid(mov)) return;
  if (txt(f, "accion") === "ignorar") {
    falla((await supabase.from("movimientos_banco").update({ estado: "ignorado" }).eq("id", mov).eq("condominio_id", c.id)).error, "No pudimos guardar.");
  } else {
    const pago = txt(f, "pago_id", 40);
    const vivienda = txt(f, "vivienda_id", 40);
    const { error } = await supabase.rpc("conciliar_movimiento", { p_movimiento: mov, p_pago: esUuid(pago) ? pago : null, p_vivienda: esUuid(vivienda) ? vivienda : null });
    falla(error, "No pudimos conciliar.");
  }
  revalidatePath(`/condominios/${c.id}`);
}

// ─────────────────────────── Piloto: reglas, cajones, incidentes, equipos y obras ───────────────────────────
const MOTIVOS = ["visita", "fiesta", "mudanza", "servicio"];
const entero = (f: FormData, k: string) => {
  const v = txt(f, k, 6);
  return v === "" ? null : Math.max(0, Math.round(Number(v))) || null;
};

export async function guardarRegla(f: FormData) {
  const { supabase, c } = await condominio(f);
  const motivo = txt(f, "motivo", 20);
  if (!MOTIVOS.includes(motivo)) throw new Error("Tipo de pase no válido.");
  const { error } = await supabase.from("reglas_acceso").upsert(
    {
      organizacion_id: c.organizacion_id,
      condominio_id: c.id,
      motivo,
      max_horas: entero(f, "max_horas"),
      hora_desde: txt(f, "hora_desde", 5) || null,
      hora_hasta: txt(f, "hora_hasta", 5) || null,
      acceso: txt(f, "acceso", 120) || null,
      instrucciones: txt(f, "instrucciones", 500) || null,
      max_invitados: motivo === "fiesta" ? entero(f, "max_invitados") : null,
      max_cajones: Math.min(50, Number(txt(f, "max_cajones", 3)) || 0),
    },
    { onConflict: "condominio_id,motivo" },
  );
  falla(error, "Revisa la regla.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function guardarCajones(f: FormData) {
  const { supabase, c } = await condominio(f);
  const quitar = txt(f, "quitar", 40);
  if (esUuid(quitar)) {
    const { error } = await supabase.from("cajones").update({ activo: false }).eq("id", quitar).eq("condominio_id", c.id);
    falla(error, "No pudimos quitar el cajón.");
  } else {
    const nombres = txt(f, "nombres", 1000).split(/[\n,]+/).map((x) => x.trim().slice(0, 30)).filter(Boolean).slice(0, 100);
    if (!nombres.length) throw new Error("Escribe los cajones (V-1, V-2…).");
    const { error } = await supabase
      .from("cajones")
      .upsert(nombres.map((nombre) => ({ organizacion_id: c.organizacion_id, condominio_id: c.id, nombre, activo: true })), { onConflict: "condominio_id,nombre" });
    falla(error, "No pudimos guardar los cajones.");
  }
  revalidatePath(`/condominios/${c.id}`);
}

export async function agruparReportes(f: FormData) {
  const { supabase, c } = await condominio(f);
  const tickets = f.getAll("ticket_id").map(String).filter(esUuid);
  const inc = txt(f, "incidente_id", 40);
  if (!tickets.length) throw new Error("Marca los reportes que son el mismo problema.");
  const { error } = await supabase.rpc("agrupar_reportes", { p_condominio: c.id, p_tickets: tickets, p_incidente: esUuid(inc) ? inc : null, p_titulo: txt(f, "titulo", 120) || null });
  falla(error, "No pudimos agrupar los reportes.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function desagruparReporte(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "ticket_id", 40);
  if (!esUuid(id)) return;
  const { error } = await supabase.rpc("desagrupar_reporte", { p_ticket: id });
  falla(error, "No pudimos separar el reporte.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function avanceIncidente(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "incidente_id", 40);
  if (!esUuid(id)) return;
  const nota = txt(f, "nota", 500);
  const estado = txt(f, "estado", 20);
  const { data, error } = await supabase.rpc("publicar_avance_incidente", {
    p_incidente: id,
    p_nota: nota,
    p_estado: estado,
    p_responsable: txt(f, "responsable", 80) || null,
    p_fecha: txt(f, "fecha_compromiso", 10) || null,
  });
  falla(error, "No pudimos publicar el avance.");
  // Cada vivienda afectada recibe el aviso en su celular; nadie ve quién más reportó.
  const viviendas = (data as string[] | null) ?? [];
  const { data: inc } = await supabase.from("incidentes").select("titulo").eq("id", id).maybeSingle();
  for (const v of viviendas)
    avisarVivienda(v, (t) => ({ titulo: estado === "resuelto" ? `✅ Resuelto: ${inc?.titulo ?? "tu reporte"}` : `Avance: ${inc?.titulo ?? "tu reporte"}`, cuerpo: nota.slice(0, 140), url: `/vecino/${t}/reportes`, tag: `incidente-${id}` }));
  revalidatePath(`/condominios/${c.id}`);
}

export async function guardarEquipo(f: FormData) {
  const { supabase, c } = await condominio(f);
  const id = txt(f, "equipo_id", 40);
  const prov = txt(f, "proveedor_id", 40);
  const fila = {
    nombre: txt(f, "nombre", 80),
    tipo: txt(f, "tipo", 20) || "otro",
    ubicacion: txt(f, "ubicacion", 120) || null,
    marca: txt(f, "marca", 80) || null,
    modelo: txt(f, "modelo", 80) || null,
    serie: txt(f, "serie", 80) || null,
    instalado: txt(f, "instalado", 10) || null,
    garantia_hasta: txt(f, "garantia_hasta", 10) || null,
    proveedor_id: esUuid(prov) ? prov : null,
    notas: txt(f, "notas", 1000) || null,
  };
  const { error } = esUuid(id)
    ? await supabase.from("equipos_condominio").update(fila).eq("id", id).eq("condominio_id", c.id)
    : await supabase.from("equipos_condominio").insert({ ...fila, organizacion_id: c.organizacion_id, condominio_id: c.id });
  falla(error, "Revisa los datos del equipo.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function guardarObra(f: FormData) {
  const { supabase, c } = await condominio(f);
  const presupuesto = aCentavos(txt(f, "presupuesto", 20));
  if (!presupuesto) throw new Error("Escribe el presupuesto aprobado.");
  const prov = txt(f, "proveedor_id", 40);
  const asamblea = txt(f, "asamblea_id", 40);
  const { data, error } = await supabase
    .from("obras")
    .insert({
      organizacion_id: c.organizacion_id,
      condominio_id: c.id,
      nombre: txt(f, "nombre", 120),
      descripcion: txt(f, "descripcion", 500) || null,
      presupuesto_centavos: presupuesto,
      proveedor_id: esUuid(prov) ? prov : null,
      asamblea_id: esUuid(asamblea) ? asamblea : null,
    })
    .select("id")
    .single();
  falla(error, "Revisa los datos de la obra.");
  // Etapas: "Anticipo 40%" o "Anticipo: 38400"
  const etapas = txt(f, "etapas", 2000).split("\n").map((l) => l.trim()).filter(Boolean);
  const filas = etapas.map((l, i) => {
    const pct = l.match(/(\d+(?:\.\d+)?)\s*%\s*$/);
    const monto = pct ? Math.round((presupuesto * Number(pct[1])) / 100) : aCentavos(l.split(/[:\s]+/).pop() ?? "");
    return { organizacion_id: c.organizacion_id, condominio_id: c.id, obra_id: data!.id, orden: i + 1, nombre: l.replace(/[:\s]*\$?[\d.,]+\s*%?\s*$/, "").slice(0, 120) || `Etapa ${i + 1}`, monto_centavos: monto ?? 0 };
  });
  if (filas.some((x) => !x.monto_centavos)) throw new Error("Cada etapa necesita monto o porcentaje (ej. Anticipo 50%).");
  if (filas.length) falla((await supabase.from("etapas_obra").insert(filas)).error, "No pudimos guardar las etapas.");
  revalidatePath(`/condominios/${c.id}`);
}

export async function avanceEtapa(f: FormData) {
  const { supabase, c, user } = await condominio(f);
  const id = txt(f, "etapa_id", 40);
  if (!esUuid(id)) return;
  const { data: e } = await supabase.from("etapas_obra").select("id, nombre, monto_centavos, gasto_id, obra_id, obras(nombre, proveedor_id, estado)").eq("id", id).eq("condominio_id", c.id).maybeSingle();
  if (!e) throw new Error("Etapa no encontrada.");
  const cambios: Record<string, unknown> = { avance_pct: Math.min(100, Math.max(0, Number(txt(f, "avance", 3)) || 0)) };
  if (f.get("pagar") === "1" && !e.gasto_id) {
    const o = e.obras as unknown as { nombre: string; proveedor_id: string | null; estado: string };
    const { data: g, error } = await supabase
      .from("gastos_condominio")
      .insert({ organizacion_id: c.organizacion_id, condominio_id: c.id, categoria: "Obra", descripcion: `${o.nombre} · ${e.nombre}`.slice(0, 300), proveedor_id: o.proveedor_id, monto_centavos: e.monto_centavos, fecha: new Date().toISOString().slice(0, 10), creado_por: user.email })
      .select("id")
      .single();
    falla(error, "No pudimos registrar el pago.");
    cambios.gasto_id = g!.id;
  }
  falla((await supabase.from("etapas_obra").update(cambios).eq("id", id)).error, "No pudimos guardar el avance.");
  const { data: todas } = await supabase.from("etapas_obra").select("avance_pct").eq("obra_id", e.obra_id);
  const estado = (todas ?? []).every((x) => x.avance_pct === 100) ? "terminada" : "en_curso";
  await supabase.from("obras").update({ estado }).eq("id", e.obra_id);
  revalidatePath(`/condominios/${c.id}`);
}

export async function cuotaObra(f: FormData) {
  const { supabase, c } = await condominio(f);
  const obra = txt(f, "obra_id", 40);
  const total = aCentavos(txt(f, "total", 20));
  if (!esUuid(obra) || !total) throw new Error("Escribe el total a recaudar.");
  const { data, error } = await supabase.rpc("cargar_cuota_obra", { p_obra: obra, p_total_centavos: total, p_periodo: `${txt(f, "mes", 7)}-01`, p_vence: txt(f, "vence", 10) || null, p_por_indiviso: f.get("indiviso") === "on" });
  falla(error, "No pudimos cargar la cuota.");
  revalidatePath(`/condominios/${c.id}`);
  redirect(ruta(c.id, "obras", `&cargados=${Number(data) || 0}`));
}
