import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatoFecha, pesos } from "@/lib/datos";
import { mesTexto } from "@/lib/reporte";
import { ComprobanteForm } from "./ComprobanteForm";
import { Boton } from "@/components/Boton";
import { domiciliarRenta, pagarEnLinea, quitarDomiciliacion } from "./actions";

export const metadata: Metadata = { title: "Pago de renta · Black Key", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ pago?: string; domiciliado?: string }> };

export default function PagoRenta({ params, searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">
      <Logo />
      <Suspense fallback={<p className="text-sm text-gris">Cargando…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

type Datos = {
  periodo: string;
  monto: number;
  recargo: number;
  vence: string;
  estado: string;
  pagado_at: string | null;
  nota: string | null;
  contrato_id: string;
  organizaciones: { nombre: string; datos_pago: string | null } | null;
  contratos: { propiedades: { nombre: string } | null; inquilinos: { nombre: string } | null } | null;
};

async function Contenido({ params, searchParams }: Props) {
  await connection();
  const { token } = await params;
  const { pago, domiciliado } = await searchParams;
  if (!/^[0-9a-f]{32}$/.test(token)) return <Invalido />;
  const admin = createAdminClient();
  const { data } = await admin
    .from("cobros_renta")
    .select("periodo, monto, recargo, vence, estado, pagado_at, nota, contrato_id, organizaciones(nombre, datos_pago), contratos(propiedades(nombre), inquilinos(nombre))")
    .eq("token", token)
    .maybeSingle();
  const c = data as unknown as Datos | null;
  if (!c) return <Invalido />;
  const total = Number(c.monto) + Number(c.recargo ?? 0);
  // Referencia numérica para la transferencia (si la base ya la tiene).
  const { data: ref } = await admin.from("contratos").select("referencia").eq("id", c.contrato_id).maybeSingle();
  const referencia = (ref as { referencia?: string | null } | null)?.referencia ?? null;
  const nombre = c.contratos?.inquilinos?.nombre?.split(" ")[0];
  // Pago en línea (si la administradora conectó Stripe y la base ya tiene esas columnas).
  const [{ data: org }, { data: dom }] = await Promise.all([
    admin.from("cobros_renta").select("organizaciones(stripe_cuenta_lista)").eq("token", token).maybeSingle(),
    admin.from("contratos").select("domiciliado, tarjeta_texto").eq("id", c.contrato_id).maybeSingle(),
  ]);
  const enLinea = !!(org as unknown as { organizaciones: { stripe_cuenta_lista: boolean } | null } | null)?.organizaciones?.stripe_cuenta_lista;
  const auto = dom as { domiciliado: boolean; tarjeta_texto: string | null } | null;
  const { data: err } = await admin.from("cobros_renta").select("error_cobro").eq("token", token).maybeSingle();
  const errorCobro = (err as { error_cobro?: string | null } | null)?.error_cobro ?? null;

  return (
    <>
      <header>
        <p className="text-sm text-gris">
          {c.contratos?.propiedades?.nombre} · {c.organizaciones?.nombre}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {nombre ? `${nombre}, ` : ""}renta de {mesTexto(c.periodo).split(" de ")[0]}
        </h1>
      </header>

      <section className="flex flex-col gap-1 rounded-2xl bg-white p-5">
        <span className="text-sm text-gris">Total a pagar</span>
        <span className="font-mono text-4xl font-bold">{pesos.format(total)}</span>
        {Number(c.recargo) > 0 && <span className="text-sm text-naranja-oscuro">Incluye recargo por atraso de {pesos.format(c.recargo)}</span>}
        <span className={`text-sm ${c.estado === "vencido" ? "font-bold text-naranja-oscuro" : "text-gris"}`}>
          {c.estado === "vencido" ? "Venció" : "Vence"} el {formatoFecha(c.vence)}
        </span>
      </section>

      {pago === "ok" && c.estado !== "pagado" && (
        <Estado titulo="Estamos confirmando tu pago" texto="Si pagaste con tarjeta, en unos segundos aparece aquí. Si elegiste SPEI u OXXO, se registra solo en cuanto llegue tu pago." />
      )}
      {domiciliado && <Estado titulo="Listo: tu renta se cobrará sola" texto="Te cobraremos a tu tarjeta en cada fecha de pago y te llegará el recibo." verde />}

      {c.estado === "pagado" ? (
        <Estado titulo="¡Gracias! Tu pago está registrado" texto={c.pagado_at ? `Pagado el ${formatoFecha(c.pagado_at)}.` : ""} verde />
      ) : c.estado === "condonado" ? (
        <Estado titulo="No tienes que pagar este mes" texto="La administración condonó esta renta." verde />
      ) : (
        <>
          {c.estado === "por_confirmar" && (
            <Estado titulo="Recibimos tu comprobante" texto="La administración lo está revisando. Si necesitas cambiarlo, sube otro abajo." />
          )}
          {c.nota && c.estado !== "por_confirmar" && <Estado titulo="Revisa tu comprobante" texto={c.nota} />}
          {errorCobro && <Estado titulo="No pasó el cobro a tu tarjeta" texto={`${errorCobro} Paga con otro método o cambia tu tarjeta.`} />}
          {enLinea && (
            <section aria-label="Pagar en línea" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Paga en línea</h2>
              <p className="text-sm text-gris">Tarjeta de crédito o débito, transferencia SPEI (se registra sola) u OXXO.</p>
              <form action={pagarEnLinea}>
                <input type="hidden" name="token" value={token} />
                <Boton className="w-full" enviando="Abriendo pago seguro…">
                  Pagar {pesos.format(total)}
                </Boton>
              </form>
            </section>
          )}
          {c.organizaciones?.datos_pago && (
            <section className="flex flex-col gap-2 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Datos para depositar</h2>
              <p className="whitespace-pre-line font-mono text-sm">{c.organizaciones.datos_pago}</p>
              {referencia && (
                <div className="mt-1 rounded-xl bg-verde-claro p-3 text-verde-oscuro">
                  <p className="text-sm">Escribe esta referencia numérica en tu transferencia para que tu pago se registre solo:</p>
                  <p className="font-mono text-2xl font-bold tracking-widest" aria-label="Referencia numérica">{referencia}</p>
                </div>
              )}
            </section>
          )}
          <section className="flex flex-col gap-3">
            <h2 className="font-bold">{enLinea ? "¿Pagaste por fuera? Sube tu comprobante" : "¿Ya pagaste? Sube tu comprobante"}</h2>
            <ComprobanteForm token={token} />
          </section>
        </>
      )}
      {enLinea && <PagoAutomatico token={token} auto={auto} />}
    </>
  );
}

function PagoAutomatico({ token, auto }: { token: string; auto: { domiciliado: boolean; tarjeta_texto: string | null } | null }) {
  return (
    <section aria-label="Pago automático" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
      <h2 className="font-bold">Pago automático</h2>
      {auto?.domiciliado ? (
        <>
          <p className="text-sm">
            ✓ Tu renta se cobra sola a tu {auto.tarjeta_texto ?? "tarjeta"} en cada fecha de pago.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={domiciliarRenta}>
              <input type="hidden" name="token" value={token} />
              <Boton estilo="claro" enviando="Abriendo…">
                Cambiar tarjeta
              </Boton>
            </form>
            <form action={quitarDomiciliacion}>
              <input type="hidden" name="token" value={token} />
              <Boton estilo="peligro" enviando="Quitando…">
                Quitar pago automático
              </Boton>
            </form>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gris">Guarda tu tarjeta y olvídate: la renta se cobra sola cada mes en tu fecha de pago. Puedes quitarlo cuando quieras.</p>
          <form action={domiciliarRenta}>
            <input type="hidden" name="token" value={token} />
            <Boton estilo="oscuro" enviando="Abriendo…">
              Activar pago automático
            </Boton>
          </form>
        </>
      )}
    </section>
  );
}

function Estado({ titulo, texto, verde }: { titulo: string; texto: string; verde?: boolean }) {
  return (
    <section className={`flex flex-col gap-1 rounded-2xl p-5 ${verde ? "bg-verde-claro text-verde-oscuro" : "bg-[#E8EEFB] text-[#2A4A93]"}`}>
      <p className="font-bold">{titulo}</p>
      {texto && <p className="text-sm">{texto}</p>}
    </section>
  );
}

function Invalido() {
  return <p className="rounded-2xl bg-white p-6 text-sm">Este link ya no es válido. Pídele uno nuevo a tu administración.</p>;
}
