import type { Metadata } from "next";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { pesos } from "@/lib/datos";
import { estadoPlan, GRATIS_HASTA, MAS_DE, PLANES, planPara, planPorClave } from "@/lib/plan";
import { sesionConOrg } from "@/lib/sesion";
import { stripeConfigurado } from "@/lib/stripe";
import { administrarPlan, elegirPlan } from "./actions";

export const metadata: Metadata = { title: "Plan · Black Key" };

type Busqueda = { listo?: string; limite?: string; cambiado?: string; no_cabe?: string };

export default function Plan({ searchParams }: { searchParams: Promise<Busqueda> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const { supabase, org, user } = await sesionConOrg();
  const { listo, limite, cambiado, no_cabe } = await searchParams;
  const [e, { data: yo }] = await Promise.all([
    estadoPlan(supabase, org.id),
    supabase.from("miembros").select("rol").eq("organizacion_id", org.id).eq("user_id", user.id).maybeSingle(),
  ]);
  const admin = yo?.rol === "propietario" || yo?.rol === "admin";
  const pagos = stripeConfigurado();
  // Recomendado: el más chico donde caben las que tiene + 1 (para que pueda seguir agregando).
  const sugerido = planPara(e.propiedades + 1);
  const contacto = process.env.LEGAL_CORREO;

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
        {cambiado && (
          <p role="status" className="rounded-2xl bg-verde-claro p-4 text-sm font-semibold text-verde-oscuro">
            Listo: cambiaste al plan {planPorClave(cambiado)?.nombre}. Stripe ajusta el cobro de forma proporcional.
          </p>
        )}
        {no_cabe && (
          <p role="alert" className="rounded-2xl bg-naranja-claro p-4 text-sm font-semibold text-naranja-oscuro">
            Tienes {e.propiedades} propiedades y el plan {planPorClave(no_cabe)?.nombre} incluye hasta {planPorClave(no_cabe)?.hasta}. Elige uno más grande.
          </p>
        )}
        {limite && (
          <p role="alert" className="rounded-2xl bg-naranja-claro p-4 text-sm font-semibold text-naranja-oscuro">
            {e.plan ? `Tu plan ${e.plan.nombre} incluye hasta ${e.plan.hasta} propiedades.` : `El plan gratis incluye hasta ${GRATIS_HASTA} propiedades.`} {sugerido ? `Sube al plan ${sugerido.nombre} para agregar más.` : "Escríbenos para un plan a la medida."}
          </p>
        )}

        <section aria-label="Estado del plan" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6">
          <div>
            <p className="text-sm text-gris">Plan actual</p>
            <p className="font-display text-3xl font-bold">{e.plan ? e.plan.nombre : "Gratis"}</p>
            <p className="text-sm text-gris">
              {e.pagando
                ? `${pesos.format(e.plan!.precio)} al mes · suscripción ${e.suscripcion === "past_due" ? "con pago pendiente" : "activa"}`
                : `Hasta ${GRATIS_HASTA} propiedades, sin costo.`}
            </p>
          </div>
          <div className="min-w-56 flex-1 sm:max-w-xs">
            <p className="text-sm">
              <strong className="font-mono text-lg">{e.propiedades}</strong> de {e.limite} propiedades
            </p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-fondo" role="presentation">
              <div className={`h-full rounded-full ${e.propiedades >= e.limite ? "bg-naranja" : "bg-verde"}`} style={{ width: `${Math.min(100, (e.propiedades / Math.max(1, e.limite)) * 100)}%` }} />
            </div>
          </div>
          {admin && pagos && e.pagando && (
            <form action={administrarPlan}>
              <Boton estilo="claro" enviando="Abriendo…">
                Tarjeta, facturas o cancelar
              </Boton>
            </form>
          )}
        </section>

        {!admin ? (
          <p className="text-sm text-gris">Solo la dueña de la cuenta o una administradora puede cambiar el plan.</p>
        ) : !pagos ? (
          <p className="rounded-xl bg-naranja-claro p-3 text-sm text-naranja-oscuro">Los pagos en línea aún no están conectados.</p>
        ) : null}

        <section aria-label="Planes" className="grid gap-4 md:grid-cols-3">
          {PLANES.map((p) => {
            const actual = e.plan?.clave === p.clave;
            const noCabe = e.propiedades > p.hasta;
            const recomendado = !e.pagando && sugerido?.clave === p.clave;
            return (
              <article key={p.clave} aria-label={`Plan ${p.nombre}`} className={`flex flex-col gap-3 rounded-2xl bg-white p-6 ${recomendado ? "ring-2 ring-verde" : actual ? "ring-2 ring-tinta" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-2xl font-bold">{p.nombre}</h2>
                  {actual ? <span className="rounded-full bg-tinta px-2.5 py-0.5 text-xs font-bold text-white">Tu plan</span> : recomendado ? <span className="rounded-full bg-verde-claro px-2.5 py-0.5 text-xs font-bold text-verde-oscuro">Recomendado</span> : null}
                </div>
                <p className="text-sm text-gris">{p.para}</p>
                <p>
                  <span className="font-display text-4xl font-bold">{pesos.format(p.precio)}</span>
                  <span className="text-sm text-gris"> /mes + IVA</span>
                </p>
                <p className="text-sm font-semibold">Hasta {p.hasta} propiedades</p>
                <p className="text-xs text-gris">≈ {pesos.format(Math.round(p.precio / p.hasta))} por propiedad</p>
                {admin && pagos && !actual && (
                  <form action={elegirPlan} className="mt-auto">
                    <input type="hidden" name="plan" value={p.clave} />
                    <Boton estilo={recomendado ? "primario" : "claro"} className="w-full" enviando="Abriendo…">
                      {noCabe ? `No caben tus ${e.propiedades}` : e.pagando ? (e.plan && p.precio > e.plan.precio ? "Subir a este plan" : "Cambiar a este plan") : "Elegir plan"}
                    </Boton>
                  </form>
                )}
              </article>
            );
          })}
        </section>

        <section aria-label="Cómo se cobra" className="flex flex-col gap-2 rounded-2xl bg-white p-6 text-sm">
          <h2 className="font-bold">Cómo funciona</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>Gratis para siempre con hasta {GRATIS_HASTA} propiedades, para que lo pruebes con tu cartera real.</li>
            <li>Todos los planes incluyen todo: tickets, proveedores, cobros, reportes, avisos, app y equipo.</li>
            <li>Si creces, subes de plan cuando quieras; el cobro se ajusta de forma proporcional.</li>
            <li>
              ¿Más de {MAS_DE} propiedades? {contacto ? <a className="font-semibold text-verde underline" href={`mailto:${contacto}?subject=Plan a la medida`}>Escríbenos</a> : "Escríbenos"} para un plan a la medida.
            </li>
            <li>Pagas con tarjeta y cancelas cuando quieras.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
