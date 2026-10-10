import type { Metadata } from "next";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { fechaConAnio } from "@/lib/crm";
import { pesos } from "@/lib/datos";
import { estadoPlan, GRATIS_HASTA, PRECIO_PROPIEDAD } from "@/lib/plan";
import { sesionConOrg } from "@/lib/sesion";
import { stripeConfigurado } from "@/lib/stripe";
import { activarPlan, administrarPlan } from "./actions";

export const metadata: Metadata = { title: "Plan · Black Key" };

export default function Plan({ searchParams }: { searchParams: Promise<{ listo?: string; limite?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<{ listo?: string; limite?: string }> }) {
  const { supabase, org, user } = await sesionConOrg();
  const { listo, limite } = await searchParams;
  const [e, { data: yo }] = await Promise.all([
    estadoPlan(supabase, org.id),
    supabase.from("miembros").select("rol").eq("organizacion_id", org.id).eq("user_id", user.id).maybeSingle(),
  ]);
  const admin = yo?.rol === "propietario" || yo?.rol === "admin";
  const pagos = stripeConfigurado();

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Plan" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <h1 className="font-display text-4xl font-bold tracking-tight">Tu plan</h1>

        {listo && (
          <p role="status" className="rounded-2xl bg-verde-claro p-4 text-sm font-semibold text-verde-oscuro">
            ¡Gracias! Tu pago se está confirmando; en un momento verás tu plan activo.
          </p>
        )}
        {limite && !e.pagando && (
          <p role="alert" className="rounded-2xl bg-naranja-claro p-4 text-sm font-semibold text-naranja-oscuro">
            El plan gratis incluye hasta {GRATIS_HASTA} propiedades. Activa tu plan para agregar más.
          </p>
        )}

        <div className="flex flex-wrap items-start gap-5">
          <section aria-label="Estado del plan" className="flex flex-[1.3_1_340px] flex-col gap-4 rounded-2xl bg-white p-6">
            <div>
              <p className="text-sm text-gris">Plan actual</p>
              <p className="font-display text-3xl font-bold">
                {e.pagando ? "Black Key Pro" : e.enPrueba ? "Prueba gratis" : "Gratis"}
              </p>
              <p className="text-sm text-gris">
                {e.pagando
                  ? `Suscripción ${e.suscripcion === "past_due" ? "con pago pendiente" : "activa"}`
                  : e.enPrueba
                    ? `Te quedan ${e.diasPrueba} ${e.diasPrueba === 1 ? "día" : "días"} con todo ilimitado (hasta el ${fechaConAnio(e.pruebaHasta)}).`
                    : `Incluye hasta ${GRATIS_HASTA} propiedades.`}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-fondo p-4">
                <dt className="text-sm text-gris">Propiedades</dt>
                <dd className="font-mono text-2xl font-bold">{e.propiedades}</dd>
              </div>
              <div className="rounded-xl bg-fondo p-4">
                <dt className="text-sm text-gris">{e.pagando ? "Pagas al mes" : "Costaría al mes"}</dt>
                <dd className="font-mono text-2xl font-bold">{pesos.format(e.pagando ? Math.max(1, e.propiedades) * PRECIO_PROPIEDAD : e.costoMensual)}</dd>
              </div>
            </dl>

            {!admin ? (
              <p className="text-sm text-gris">Solo la dueña de la cuenta o una administradora puede cambiar el plan.</p>
            ) : !pagos ? (
              <p className="rounded-xl bg-naranja-claro p-3 text-sm text-naranja-oscuro">Los pagos en línea aún no están conectados.</p>
            ) : e.pagando ? (
              <form action={administrarPlan}>
                <Boton estilo="claro" enviando="Abriendo…">
                  Cambiar tarjeta, ver facturas o cancelar
                </Boton>
              </form>
            ) : (
              <form action={activarPlan}>
                <Boton enviando="Abriendo pago…">Activar plan · {pesos.format(Math.max(1, e.propiedades) * PRECIO_PROPIEDAD)} al mes</Boton>
              </form>
            )}
          </section>

          <section aria-label="Cómo se cobra" className="flex flex-[1_1_280px] flex-col gap-2 rounded-2xl bg-white p-6 text-sm">
            <h2 className="font-bold">Cómo se cobra</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                <strong>{pesos.format(PRECIO_PROPIEDAD)} por propiedad al mes</strong>, más IVA.
              </li>
              <li>Gratis para siempre hasta {GRATIS_HASTA} propiedades.</li>
              <li>30 días de prueba sin límite al crear tu cuenta.</li>
              <li>Incluye todo: tickets, proveedores, cobros, reportes, avisos y equipo.</li>
              <li>Si agregas o quitas propiedades, el cobro se ajusta solo desde el siguiente mes.</li>
              <li>Pagas con tarjeta y cancelas cuando quieras.</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
