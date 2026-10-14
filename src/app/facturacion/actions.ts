"use server";

import { revalidatePath } from "next/cache";
import { REGIMENES, USOS_CFDI, facturarCobro, rfcValido } from "@/lib/facturacion";
import { cancelar, crearOrganizacion, datosFiscales, facturapiConfigurado, llaveOrganizacion, subirCertificado } from "@/lib/facturapi";
import { sesionConOrg } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
type Estado = { ok: boolean; mensaje: string; valores?: Record<string, string> } | null;

// Datos fiscales del dueño y su sello digital (CSD). Crea su emisor en Facturapi la primera vez.
export async function activarFacturacionDueno(_: Estado, f: FormData): Promise<Estado> {
  const { supabase, org } = await sesionConOrg();
  const id = txt(f, "dueno_id", 40);
  if (!esUuid(id)) return { ok: false, mensaje: "Dueño no válido." };
  const { data: d } = await supabase.from("duenos").select("id, nombre").eq("id", id).maybeSingle();
  if (!d) return { ok: false, mensaje: "No encontramos al dueño." };
  const rfc = txt(f, "rfc", 13).toUpperCase();
  const razon = txt(f, "razon_social", 200).toUpperCase();
  const regimen = txt(f, "regimen_fiscal", 3);
  const cp = txt(f, "cp_fiscal", 5);
  const valores = { rfc, razon_social: razon, regimen_fiscal: regimen, cp_fiscal: cp };
  const error = (mensaje: string) => ({ ok: false, mensaje, valores });
  if (!rfcValido(rfc)) return error("Revisa el RFC.");
  if (!razon || !REGIMENES.some(([v]) => v === regimen) || !/^\d{5}$/.test(cp)) return error("Escribe la razón social (como en la constancia), el régimen y el código postal fiscal.");
  await supabase.from("duenos").update({ rfc, razon_social: razon, regimen_fiscal: regimen, cp_fiscal: cp }).eq("id", d.id);

  const cer = f.get("cer");
  const key = f.get("key");
  const contrasena = String(f.get("contrasena") ?? "");
  const conCsd = cer instanceof File && cer.size > 0 && key instanceof File && key.size > 0;
  if (!conCsd) {
    revalidatePath(`/personas/duenos/${d.id}`);
    return { ok: true, mensaje: "Datos fiscales guardados. Para facturar falta subir su sello digital (.cer, .key y contraseña)." };
  }
  if (!facturapiConfigurado()) return error("Falta conectar Facturapi (FACTURAPI_KEY en Vercel).");
  if (!contrasena) return error("Escribe la contraseña de la llave privada (.key).");
  if ((cer as File).size > 20_000 || (key as File).size > 20_000) return error("Esos archivos no parecen un sello digital (.cer y .key).");

  const admin = createAdminClient();
  try {
    const { data: previo } = await admin.from("facturacion_duenos").select("facturapi_org_id").eq("dueno_id", d.id).maybeSingle();
    const orgId = previo?.facturapi_org_id ?? (await crearOrganizacion(`${razon} (${org.nombre})`)).id;
    if (!previo) await admin.from("facturacion_duenos").insert({ dueno_id: d.id, organizacion_id: org.id, facturapi_org_id: orgId });
    await datosFiscales(orgId, { nombre: d.nombre, razon_social: razon, regimen, cp });
    const r = await subirCertificado(orgId, cer as File, key as File, contrasena);
    const llave = await llaveOrganizacion(orgId);
    await admin.from("facturacion_duenos").update({ api_key: llave }).eq("dueno_id", d.id);
    const vence = r.certificate?.expires_at ? String(r.certificate.expires_at).slice(0, 10) : null;
    await admin.from("duenos").update({ facturacion_lista: true, csd_vence: vence }).eq("id", d.id);
  } catch (e) {
    return error(`Facturapi no aceptó los datos: ${e instanceof Error ? e.message : String(e)}`);
  }
  revalidatePath(`/personas/duenos/${d.id}`);
  return { ok: true, mensaje: "¡Listo! Ya puedes facturar las rentas de este dueño." };
}

export async function guardarFiscalInquilino(_: Estado, f: FormData): Promise<Estado> {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "inquilino_id", 40);
  if (!esUuid(id)) return { ok: false, mensaje: "Inquilino no válido." };
  const rfc = txt(f, "rfc", 13).toUpperCase();
  const quiere = rfc.length > 0;
  const regimen = txt(f, "regimen_fiscal", 3);
  const cp = txt(f, "cp_fiscal", 5);
  const uso = txt(f, "uso_cfdi", 4);
  const valores = { rfc, razon_social: txt(f, "razon_social", 200), regimen_fiscal: regimen, cp_fiscal: cp, uso_cfdi: uso };
  if (quiere && !rfcValido(rfc)) return { ok: false, mensaje: "Revisa el RFC.", valores };
  if (quiere && (!txt(f, "razon_social") || !REGIMENES.some(([v]) => v === regimen) || !/^\d{5}$/.test(cp))) return { ok: false, mensaje: "Con RFC también se necesita la razón social, el régimen y el código postal fiscal.", valores };
  const { error } = await supabase
    .from("inquilinos")
    .update({
      rfc: rfc || null,
      razon_social: txt(f, "razon_social", 200).toUpperCase() || null,
      regimen_fiscal: regimen || null,
      cp_fiscal: cp || null,
      uso_cfdi: USOS_CFDI.some(([v]) => v === uso) ? uso : "G03",
      factura_automatica: f.get("factura_automatica") === "on",
    })
    .eq("id", id);
  if (error) return { ok: false, mensaje: "No pudimos guardar." };
  revalidatePath(`/personas/inquilinos/${id}`);
  return { ok: true, mensaje: "Guardado." };
}

export async function facturar(_: Estado, f: FormData): Promise<Estado> {
  const { supabase, org } = await sesionConOrg();
  const id = txt(f, "cobro_id", 40);
  if (!esUuid(id)) return { ok: false, mensaje: "Cobro no válido." };
  const { data } = await supabase.from("cobros_renta").select("id").eq("id", id).maybeSingle(); // RLS: que sea suyo
  if (!data) return { ok: false, mensaje: "No encontramos el cobro." };
  const r = await facturarCobro(createAdminClient(), id, org.id);
  if (r.ok) revalidatePath("/pagos");
  return r;
}

// Factura todos los cobros pagados del mes que aún no tienen factura.
export async function facturarMes(_: Estado, f: FormData): Promise<Estado> {
  const { supabase, org } = await sesionConOrg();
  const periodo = txt(f, "periodo", 10);
  if (!/^\d{4}-\d{2}-01$/.test(periodo)) return { ok: false, mensaje: "Mes no válido." };
  const { data: cobros } = await supabase.from("cobros_renta").select("id, facturas(id, estado)").eq("periodo", periodo).eq("estado", "pagado");
  const pendientes = ((cobros ?? []) as { id: string; facturas: { estado: string }[] }[]).filter((c) => !c.facturas.some((x) => x.estado === "valida"));
  const admin = createAdminClient();
  let hechas = 0;
  const errores: string[] = [];
  for (const c of pendientes) {
    const r = await facturarCobro(admin, c.id, org.id);
    if (r.ok) hechas++;
    else errores.push(r.mensaje);
  }
  revalidatePath("/pagos");
  if (!pendientes.length) return { ok: true, mensaje: "No hay rentas pagadas sin factura este mes." };
  return { ok: errores.length === 0, mensaje: `Timbramos ${hechas} de ${pendientes.length}.${errores.length ? ` Pendientes: ${[...new Set(errores)].slice(0, 3).join(" · ")}` : ""}` };
}

export async function cancelarFactura(f: FormData) {
  const { supabase } = await sesionConOrg();
  const id = txt(f, "factura_id", 40);
  if (!esUuid(id)) return;
  const { data: fac } = await supabase.from("facturas").select("id, facturapi_id, dueno_id, estado").eq("id", id).maybeSingle();
  if (!fac || fac.estado !== "valida") return;
  const admin = createAdminClient();
  const { data: llave } = await admin.from("facturacion_duenos").select("api_key").eq("dueno_id", fac.dueno_id).maybeSingle();
  if (!llave?.api_key) throw new Error("Falta la llave del emisor.");
  await cancelar(llave.api_key, fac.facturapi_id, "02");
  await admin.from("facturas").update({ estado: "cancelada", cancelada_at: new Date().toISOString() }).eq("id", fac.id);
  revalidatePath("/pagos");
}
