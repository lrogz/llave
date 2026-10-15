import type { SupabaseClient } from "@supabase/supabase-js";
import { conectarStripe, revisarCuenta } from "@/app/cobro/actions";
import { cobroConfigurado } from "@/lib/cobro";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { Boton } from "./Boton";

// Ajustes › Cobro automático: conectar la cuenta de Stripe de la administradora.
export async function CobroAutomatico({ db, orgId, puedeEditar }: { db: SupabaseClient; orgId: string; puedeEditar: boolean }) {
  const { data: o, error } = await db.from("organizaciones").select("stripe_cuenta_id, stripe_cuenta_lista").eq("id", orgId).single();
  if (error) return null; // base sin la migración de cobro automático
  let lista = !!o?.stripe_cuenta_lista;
  // Si ya empezó el alta y no está lista, revisamos con Stripe (p. ej. al volver de llenar sus datos).
  if (o?.stripe_cuenta_id && !lista && cobroConfigurado()) {
    const c = await stripe<{ charges_enabled: boolean }>("GET", `/accounts/${o.stripe_cuenta_id}`).catch(() => null);
    if (c?.charges_enabled) {
      lista = true;
      await createAdminClient().from("organizaciones").update({ stripe_cuenta_lista: true }).eq("id", orgId);
    }
  }
  const { count } = await db.from("contratos").select("id", { count: "exact", head: true }).eq("organizacion_id", orgId).eq("activo", true).eq("domiciliado", true);
  const pct = Number(process.env.STRIPE_COMISION_PCT ?? 0);

  return (
    <section id="cobro" aria-label="Cobro automático" className="flex scroll-mt-6 flex-col gap-3 rounded-2xl bg-white p-5">
      <h2 className="font-bold">Cobro automático de rentas</h2>
      <p className="text-sm text-gris">
        Tus inquilinos pagan desde su link con tarjeta, SPEI (con CLABE única, se registra sola) u OXXO, o guardan su tarjeta para que la renta se cobre sola cada mes. El dinero llega a tu cuenta de Stripe y de ahí a tu banco.
      </p>
      {!cobroConfigurado() ? (
        <p className="text-sm text-gris">Falta configurar Stripe en el servidor (ver README).</p>
      ) : lista ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-verde-oscuro">✓ Tu cuenta de Stripe está lista para cobrar.</p>
          <p className="text-sm">
            {count ?? 0} {count === 1 ? "inquilino tiene" : "inquilinos tienen"} pago automático.
          </p>
          <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" className="flex min-h-11 items-center self-start rounded-xl border border-borde px-4 text-sm font-bold">
            Ver mis cobros y depósitos en Stripe
          </a>
        </div>
      ) : o?.stripe_cuenta_id ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="w-full text-sm text-naranja-oscuro">Falta terminar tus datos en Stripe (identificación, RFC y cuenta bancaria).</p>
          {puedeEditar && (
            <form action={conectarStripe}>
              <Boton enviando="Abriendo Stripe…">Continuar en Stripe</Boton>
            </form>
          )}
          <form action={revisarCuenta}>
            <Boton estilo="claro" enviando="Revisando…">
              Ya terminé
            </Boton>
          </form>
        </div>
      ) : puedeEditar ? (
        <form action={conectarStripe}>
          <Boton enviando="Abriendo Stripe…">Conectar mi cuenta de Stripe</Boton>
        </form>
      ) : (
        <p className="text-sm text-gris">La dueña de la cuenta puede conectarlo.</p>
      )}
      <p className="text-xs text-gris">
        Stripe cobra su comisión por cada pago (la tarjeta cuesta más que SPEI){pct > 0 ? ` y Black Key ${pct}% por el servicio` : ""}. Tarifas vigentes en stripe.com/mx/pricing.
      </p>
    </section>
  );
}
