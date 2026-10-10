import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatoFecha, pesos } from "@/lib/datos";
import { mesTexto } from "@/lib/reporte";
import { ComprobanteForm } from "./ComprobanteForm";

export const metadata: Metadata = { title: "Pago de renta · Black Key", robots: { index: false } };

export default function PagoRenta({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">
      <Logo />
      <Suspense fallback={<p className="text-sm text-gris">Cargando…</p>}>
        <Contenido params={params} />
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
  organizaciones: { nombre: string; datos_pago: string | null } | null;
  contratos: { propiedades: { nombre: string } | null; inquilinos: { nombre: string } | null } | null;
};

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) return <Invalido />;
  const admin = createAdminClient();
  const { data } = await admin
    .from("cobros_renta")
    .select("periodo, monto, recargo, vence, estado, pagado_at, nota, organizaciones(nombre, datos_pago), contratos(propiedades(nombre), inquilinos(nombre))")
    .eq("token", token)
    .maybeSingle();
  const c = data as unknown as Datos | null;
  if (!c) return <Invalido />;
  const total = Number(c.monto) + Number(c.recargo ?? 0);
  const nombre = c.contratos?.inquilinos?.nombre?.split(" ")[0];

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
          {c.organizaciones?.datos_pago && (
            <section className="flex flex-col gap-2 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Datos para depositar</h2>
              <p className="whitespace-pre-line font-mono text-sm">{c.organizaciones.datos_pago}</p>
            </section>
          )}
          <section className="flex flex-col gap-3">
            <h2 className="font-bold">¿Ya pagaste? Sube tu comprobante</h2>
            <ComprobanteForm token={token} />
          </section>
        </>
      )}
    </>
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
