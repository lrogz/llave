import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { correoConfigurado, enviarCorreos, plantilla } from "./correo";
import { primerNombre } from "./crm";
import { pesos } from "./datos";
import { facturarSiAutomatico } from "./facturacion";
import { avisarEquipo } from "./push";
import { mesTexto } from "./reporte";
import { connectConfigurado, stripe } from "./stripe";
import { enviarPlantilla, telefonoValido, whatsappConfigurado } from "./whatsapp";

// Cobro de rentas con la cuenta de Stripe de cada administradora (Stripe Connect, cargos directos):
// el dinero llega a su cuenta; Black Key solo cobra una comisión si STRIPE_COMISION_PCT > 0.
export const cobroConfigurado = connectConfigurado;
const OXXO_MAX = 10_000;

export const centavos = (n: number) => Math.round(n * 100);
export function comision(total: number) {
  const pct = Number(process.env.STRIPE_COMISION_PCT ?? 0);
  return pct > 0 ? Math.round(centavos(total) * (pct / 100)) : 0;
}

const hoyMX = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());

type CobroStripe = {
  id: string;
  organizacion_id: string;
  monto: number;
  recargo: number;
  periodo: string;
  estado: string;
  token: string;
  contrato_id: string;
  organizaciones: { nombre: string; stripe_cuenta_id: string | null; stripe_cuenta_lista: boolean } | null;
  contratos: {
    id: string;
    stripe_cliente_id: string | null;
    stripe_metodo_id: string | null;
    domiciliado: boolean;
    propiedades: { nombre: string } | null;
    inquilinos: { nombre: string; email: string | null; telefono: string | null } | null;
  } | null;
};
const SELECT =
  "id, organizacion_id, monto, recargo, periodo, estado, token, contrato_id, organizaciones(nombre, stripe_cuenta_id, stripe_cuenta_lista), contratos(id, stripe_cliente_id, stripe_metodo_id, domiciliado, propiedades(nombre), inquilinos(nombre, email, telefono))";

export async function cobroPorToken(db: SupabaseClient, token: string) {
  const { data } = await db.from("cobros_renta").select(SELECT).eq("token", token).maybeSingle();
  return data as unknown as CobroStripe | null;
}

// Cliente del inquilino dentro de la cuenta de la administradora (uno por contrato).
export async function clienteDe(db: SupabaseClient, c: CobroStripe) {
  const cuenta = c.organizaciones!.stripe_cuenta_id!;
  if (c.contratos?.stripe_cliente_id) return c.contratos.stripe_cliente_id;
  const inq = c.contratos?.inquilinos;
  const cli = await stripe<{ id: string }>(
    "POST",
    "/customers",
    { name: inq?.nombre, email: inq?.email ?? undefined, description: c.contratos?.propiedades?.nombre, metadata: { contrato_id: c.contrato_id } },
    { cuenta, clave: `cliente-${c.contrato_id}` },
  );
  await db.from("contratos").update({ stripe_cliente_id: cli.id }).eq("id", c.contrato_id);
  return cli.id;
}

// Checkout para pagar una renta ahora: tarjeta, SPEI (CLABE única que se concilia sola) u OXXO.
export async function sesionDePago(db: SupabaseClient, c: CobroStripe, base: string) {
  const cuenta = c.organizaciones!.stripe_cuenta_id!;
  const total = Number(c.monto) + Number(c.recargo ?? 0);
  const cliente = await clienteDe(db, c);
  const metodos = ["card", "customer_balance", ...(total <= OXXO_MAX ? ["oxxo"] : [])];
  const fee = comision(total);
  const s = await stripe<{ url: string }>(
    "POST",
    "/checkout/sessions",
    {
      mode: "payment",
      customer: cliente,
      locale: "es-419",
      payment_method_types: Object.fromEntries(metodos.map((m, i) => [i, m])),
      payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "mx_bank_transfer" } }, oxxo: { expires_after_days: 3 } },
      line_items: { 0: { quantity: 1, price_data: { currency: "mxn", unit_amount: centavos(total), product_data: { name: `Renta de ${mesTexto(c.periodo)} · ${c.contratos?.propiedades?.nombre ?? ""}` } } } },
      payment_intent_data: { metadata: { cobro_id: c.id }, description: `Renta ${c.periodo.slice(0, 7)} · ${c.contratos?.propiedades?.nombre ?? ""}`, ...(fee ? { application_fee_amount: fee } : {}) },
      metadata: { cobro_id: c.id },
      success_url: `${base}/p/${c.token}?pago=ok`,
      cancel_url: `${base}/p/${c.token}`,
    },
    { cuenta },
  );
  return s.url;
}

// Checkout en modo "guardar tarjeta" para que la renta se cobre sola cada mes.
export async function sesionDomiciliar(db: SupabaseClient, c: CobroStripe, base: string) {
  const cuenta = c.organizaciones!.stripe_cuenta_id!;
  const cliente = await clienteDe(db, c);
  const s = await stripe<{ url: string }>(
    "POST",
    "/checkout/sessions",
    {
      mode: "setup",
      customer: cliente,
      locale: "es-419",
      currency: "mxn",
      payment_method_types: { 0: "card" },
      setup_intent_data: { metadata: { contrato_id: c.contrato_id }, description: `Pago automático de renta · ${c.contratos?.propiedades?.nombre ?? ""}` },
      metadata: { contrato_id: c.contrato_id },
      success_url: `${base}/p/${c.token}?domiciliado=1`,
      cancel_url: `${base}/p/${c.token}`,
    },
    { cuenta },
  );
  return s.url;
}

const METODO: Record<string, string> = { card: "tarjeta", customer_balance: "spei", oxxo: "oxxo" };

// Marca la renta como pagada (desde el webhook o el cobro automático). Revisa que la cuenta sea la de esa administradora.
export async function marcarPagado(db: SupabaseClient, cobroId: string, cuenta: string | null | undefined, pago: { id: string; tipo?: string | null }) {
  const { data } = await db.from("cobros_renta").select("id, estado, organizacion_id, monto, recargo, organizaciones(stripe_cuenta_id), contratos(propiedades(nombre), inquilinos(nombre))").eq("id", cobroId).maybeSingle();
  const c = data as unknown as { id: string; estado: string; organizacion_id: string; monto: number; recargo: number; organizaciones: { stripe_cuenta_id: string | null } | null; contratos: { propiedades: { nombre: string } | null; inquilinos: { nombre: string } | null } | null } | null;
  if (!c || !cuenta || c.organizaciones?.stripe_cuenta_id !== cuenta) return false;
  if (c.estado === "pagado") return true;
  const { error } = await db
    .from("cobros_renta")
    .update({ estado: "pagado", metodo: METODO[pago.tipo ?? "card"] ?? "tarjeta", pagado_at: new Date().toISOString(), stripe_pago_id: pago.id, error_cobro: null, nota: "Cobrado en línea (Stripe)" })
    .eq("id", c.id)
    .neq("estado", "pagado");
  if (error) return false;
  await facturarSiAutomatico(db, c.id, c.organizacion_id);
  avisarEquipo(c.organizacion_id, {
    titulo: "Renta cobrada ✓",
    cuerpo: `${c.contratos?.inquilinos?.nombre ?? "Inquilino"} · ${c.contratos?.propiedades?.nombre ?? ""} · ${pesos.format(Number(c.monto) + Number(c.recargo ?? 0))}`,
    url: "/pagos",
    tag: `cobro-${c.id}`,
  });
  return true;
}

// Cobra las rentas que ya vencen hoy (o antes) a quien tiene pago automático. Hasta 3 intentos, cada 2 días.
export async function cobrarDomiciliados(db: SupabaseClient, orgId: string, base: string) {
  if (!cobroConfigurado()) return { cobrados: 0, fallidos: 0 };
  const { data: o, error: eOrg } = await db.from("organizaciones").select("nombre, stripe_cuenta_id, stripe_cuenta_lista").eq("id", orgId).maybeSingle();
  if (eOrg || !o?.stripe_cuenta_id || !o.stripe_cuenta_lista) return { cobrados: 0, fallidos: 0 };
  const hace2 = new Date(Date.now() - 2 * 86_400_000 + 3_600_000).toISOString();
  const { data } = await db
    .from("cobros_renta")
    .select(SELECT)
    .eq("organizacion_id", orgId)
    .in("estado", ["pendiente", "vencido"])
    .lte("vence", hoyMX())
    .is("stripe_pago_id", null)
    .lt("intentos_cobro", 3)
    .or(`ultimo_intento_at.is.null,ultimo_intento_at.lt.${hace2}`)
    .limit(200);
  let cobrados = 0;
  let fallidos = 0;
  for (const c of (data ?? []) as unknown as CobroStripe[]) {
    const k = c.contratos;
    if (!k?.domiciliado || !k.stripe_metodo_id || !k.stripe_cliente_id) continue;
    const total = Number(c.monto) + Number(c.recargo ?? 0);
    const intento = await db
      .from("cobros_renta")
      .update({ intentos_cobro: (await intentosDe(db, c.id)) + 1, ultimo_intento_at: new Date().toISOString() })
      .eq("id", c.id)
      .select("intentos_cobro")
      .single();
    const fee = comision(total);
    try {
      const pi = await stripe<{ id: string; status: string }>(
        "POST",
        "/payment_intents",
        {
          amount: centavos(total),
          currency: "mxn",
          customer: k.stripe_cliente_id,
          payment_method: k.stripe_metodo_id,
          off_session: true,
          confirm: true,
          description: `Renta ${c.periodo.slice(0, 7)} · ${k.propiedades?.nombre ?? ""}`,
          metadata: { cobro_id: c.id, automatico: "1" },
          ...(fee ? { application_fee_amount: fee } : {}),
        },
        { cuenta: o.stripe_cuenta_id, clave: `renta-${c.id}-${intento.data?.intentos_cobro ?? 1}` },
      );
      if (pi.status === "succeeded" && (await marcarPagado(db, c.id, o.stripe_cuenta_id, { id: pi.id, tipo: "card" }))) cobrados++;
    } catch (e) {
      fallidos++;
      const msg = e instanceof Error ? e.message.replace(/^Stripe: /, "") : "No se pudo cobrar";
      await db.from("cobros_renta").update({ error_cobro: msg.slice(0, 300) }).eq("id", c.id);
      await avisarFallo(o.nombre, c, total, base);
    }
  }
  return { cobrados, fallidos };
}

async function intentosDe(db: SupabaseClient, id: string) {
  const { data } = await db.from("cobros_renta").select("intentos_cobro").eq("id", id).single();
  return Number(data?.intentos_cobro ?? 0);
}

async function avisarFallo(orgNombre: string, c: CobroStripe, total: number, base: string) {
  const inq = c.contratos?.inquilinos;
  const casa = c.contratos?.propiedades?.nombre ?? "tu casa";
  const link = `${base}/p/${c.token}`;
  if (inq && correoConfigurado() && inq.email) {
    await enviarCorreos([
      {
        para: inq.email,
        asunto: `No pudimos cobrar la renta de ${casa}`,
        html: plantilla({
          org: orgNombre,
          titulo: `${primerNombre(inq.nombre)}, no pasó el cobro de tu renta`,
          parrafos: [`Intentamos cobrar ${pesos.format(total)} de la renta de ${casa} a tu tarjeta y el banco lo rechazó.`, "Puedes pagar con otra tarjeta, SPEI u OXXO, o cambiar la tarjeta para los próximos meses."],
          boton: { texto: "Pagar o cambiar tarjeta", url: link },
        }),
      },
    ]).catch(() => {});
  }
  if (inq && whatsappConfigurado() && telefonoValido(inq.telefono)) {
    await enviarPlantilla({ telefono: inq.telefono!, plantilla: "bk_cobro_fallido", variables: [primerNombre(inq.nombre), orgNombre, casa, pesos.format(total), link] }).catch(() => {});
  }
  avisarEquipo(c.organizacion_id, { titulo: "No pasó un cobro automático", cuerpo: `${inq?.nombre ?? "Inquilino"} · ${casa} · ${pesos.format(total)}. Le avisamos para que pague o cambie su tarjeta.`, url: "/pagos", tag: `cobro-${c.id}` });
}
