import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarPorCorreo, timbrar } from "./facturapi";
import { mesTexto } from "./reporte";

// Reglas fiscales del recibo de arrendamiento (CFDI 4.0). Son las usuales; la administradora debe validarlas con su contador.

export const REGIMENES = [
  ["606", "606 · Arrendamiento"],
  ["612", "612 · Actividades empresariales y profesionales"],
  ["626", "626 · Régimen Simplificado de Confianza (RESICO)"],
  ["601", "601 · General de Ley Personas Morales"],
  ["603", "603 · Personas Morales con Fines no Lucrativos"],
  ["605", "605 · Sueldos y salarios"],
  ["616", "616 · Sin obligaciones fiscales"],
] as const;

export const USOS_CFDI = [
  ["G03", "G03 · Gastos en general"],
  ["S01", "S01 · Sin efectos fiscales"],
] as const;

export const PUBLICO_GENERAL = { rfc: "XAXX010101000", razon: "PUBLICO EN GENERAL", regimen: "616", uso: "S01" };

const FORMA_PAGO: Record<string, string> = { efectivo: "01", spei: "03", transferencia_externa: "03", tarjeta: "04", oxxo: "01" };

export const esPersonaMoral = (rfc: string | null | undefined) => (rfc ?? "").trim().length === 12;
export const rfcValido = (rfc: string) => /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(rfc.toUpperCase());

type Impuesto = { type: "IVA" | "ISR"; rate?: number; withholding?: boolean; factor?: "Tasa" | "Exento" };

// Casa habitación sin amueblar: IVA exento. Local, oficina o amueblada: IVA 16%.
// Si quien paga es persona moral, retiene ISR 10% (1.25% si el dueño está en RESICO) y, si hay IVA, 2/3 del IVA.
export function impuestosRenta(o: { comercial: boolean; amueblada: boolean; inquilinoMoral: boolean; resico: boolean }) {
  const conIva = o.comercial || o.amueblada;
  const t: Impuesto[] = [conIva ? { type: "IVA", rate: 0.16 } : { type: "IVA", factor: "Exento" }];
  if (o.inquilinoMoral) {
    t.push({ type: "ISR", rate: o.resico ? 0.0125 : 0.1, withholding: true });
    if (conIva) t.push({ type: "IVA", rate: 0.106667, withholding: true });
  }
  return { taxes: t, conIva };
}

export function totales(subtotal: number, taxes: Impuesto[]) {
  let total = subtotal;
  for (const x of taxes) if (x.rate) total += (x.withholding ? -1 : 1) * Math.round(subtotal * x.rate * 100) / 100;
  return Math.round(total * 100) / 100;
}

type CobroFiscal = {
  id: string;
  organizacion_id: string;
  periodo: string;
  monto: number;
  recargo: number;
  estado: string;
  metodo: string | null;
  contratos: {
    inquilinos: { nombre: string; email: string | null; rfc: string | null; razon_social: string | null; regimen_fiscal: string | null; cp_fiscal: string | null; uso_cfdi: string | null } | null;
    propiedades: {
      nombre: string;
      tipo: string;
      amueblada: boolean | null;
      cuenta_predial: string | null;
      direccion: string | null;
      dueno_id: string | null;
      duenos: { nombre: string; regimen_fiscal: string | null; cp_fiscal: string | null; facturacion_lista: boolean } | null;
    } | null;
  } | null;
};

// Arma y timbra la factura de un cobro pagado. `db` debe ser el cliente con llave de servicio.
export async function facturarCobro(db: SupabaseClient, cobroId: string, orgId: string): Promise<{ ok: boolean; mensaje: string }> {
  const { data } = await db
    .from("cobros_renta")
    .select("id, organizacion_id, periodo, monto, recargo, estado, metodo, contratos(inquilinos(nombre, email, rfc, razon_social, regimen_fiscal, cp_fiscal, uso_cfdi), propiedades(nombre, tipo, amueblada, cuenta_predial, direccion, dueno_id, duenos(nombre, regimen_fiscal, cp_fiscal, facturacion_lista)))")
    .eq("id", cobroId)
    .eq("organizacion_id", orgId)
    .maybeSingle();
  const c = data as unknown as CobroFiscal | null;
  if (!c) return { ok: false, mensaje: "No encontramos el cobro." };
  if (c.estado !== "pagado") return { ok: false, mensaje: "Solo se facturan rentas pagadas." };
  const p = c.contratos?.propiedades;
  const inq = c.contratos?.inquilinos;
  const dueno = p?.duenos;
  if (!p?.dueno_id || !dueno?.facturacion_lista) return { ok: false, mensaje: `Falta activar la facturación del dueño${dueno ? ` (${dueno.nombre})` : ""}: datos fiscales y sello digital en su ficha.` };
  const { data: ya } = await db.from("facturas").select("id").eq("cobro_id", c.id).eq("estado", "valida").maybeSingle();
  if (ya) return { ok: false, mensaje: "Este cobro ya tiene factura." };
  const { data: llave } = await db.from("facturacion_duenos").select("api_key").eq("dueno_id", p.dueno_id).maybeSingle();
  if (!llave?.api_key) return { ok: false, mensaje: "La facturación del dueño no está lista." };

  const conDatos = !!(inq?.rfc && inq.razon_social && inq.regimen_fiscal && inq.cp_fiscal);
  const cliente = conDatos
    ? { legal_name: inq!.razon_social!, tax_id: inq!.rfc!.toUpperCase(), tax_system: inq!.regimen_fiscal!, address: { zip: inq!.cp_fiscal! } }
    : { legal_name: PUBLICO_GENERAL.razon, tax_id: PUBLICO_GENERAL.rfc, tax_system: PUBLICO_GENERAL.regimen, address: { zip: dueno.cp_fiscal ?? "" } };
  const { taxes } = impuestosRenta({
    comercial: p.tipo === "local" || p.tipo === "oficina",
    amueblada: !!p.amueblada,
    inquilinoMoral: conDatos && esPersonaMoral(inq!.rfc),
    resico: dueno.regimen_fiscal === "626",
  });
  const subtotal = Number(c.monto) + Number(c.recargo ?? 0);
  const factura = {
    customer: cliente,
    items: [
      {
        quantity: 1,
        product: {
          description: `Arrendamiento de ${p.nombre}${p.direccion ? `, ${p.direccion}` : ""} correspondiente a ${mesTexto(c.periodo)}`,
          product_key: "80131500",
          unit_key: "E48",
          unit_name: "Unidad de servicio",
          price: subtotal,
          tax_included: false,
          taxes,
        },
        ...(p.cuenta_predial ? { property_tax_account: p.cuenta_predial } : {}),
      },
    ],
    payment_form: FORMA_PAGO[c.metodo ?? ""] ?? "03",
    payment_method: "PUE",
    use: conDatos ? (inq!.uso_cfdi ?? "G03") : PUBLICO_GENERAL.uso,
    // A público en general el SAT pide la información "global" (periodo que ampara).
    ...(conDatos ? {} : { global: { periodicity: "month", months: c.periodo.slice(5, 7), year: Number(c.periodo.slice(0, 4)) } }),
    external_id: c.id,
  };
  try {
    const r = await timbrar(llave.api_key, factura);
    const { error } = await db.from("facturas").insert({ organizacion_id: orgId, cobro_id: c.id, dueno_id: p.dueno_id, facturapi_id: r.id, uuid: r.uuid, folio: `${r.series ?? ""}${r.folio_number ?? ""}`, total: r.total });
    if (error) return { ok: false, mensaje: "Se timbró, pero no pudimos guardarla. Revisa en Facturapi." };
    if (inq?.email) await enviarPorCorreo(llave.api_key, r.id, inq.email).catch(() => {});
    return { ok: true, mensaje: `Factura timbrada (${r.uuid?.slice(0, 8)}…)${inq?.email ? " y enviada al inquilino" : ""}.` };
  } catch (e) {
    return { ok: false, mensaje: `El SAT/PAC rechazó la factura: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Si el inquilino tiene "facturar solo", se timbra al registrar su pago. Nunca detiene el registro del pago.
export async function facturarSiAutomatico(db: SupabaseClient, cobroId: string, orgId: string) {
  try {
    const { data } = await db.from("cobros_renta").select("contratos(inquilinos(factura_automatica))").eq("id", cobroId).maybeSingle();
    const auto = (data as unknown as { contratos: { inquilinos: { factura_automatica: boolean } | null } | null } | null)?.contratos?.inquilinos?.factura_automatica;
    if (auto) await facturarCobro(db, cobroId, orgId);
  } catch {
    /* sin facturación configurada no pasa nada */
  }
}
