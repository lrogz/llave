import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { BotonImprimir } from "@/components/BotonImprimir";
import { Logo } from "@/components/Logo";
import { mesINPC, pctTexto } from "@/lib/aumento";
import { formatoFecha, pesos } from "@/lib/datos";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Aviso de renovación · Black Key", robots: { index: false } };

type Props = { params: Promise<{ token: string }> };

export default function AvisoAumento(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-6">
      <div className="print:hidden">
        <Logo />
      </div>
      <Suspense fallback={<p className="text-sm text-gris">Cargando…</p>}>
        <Contenido {...props} />
      </Suspense>
    </main>
  );
}

type Aumento = {
  id: string;
  renta_anterior: number;
  renta_nueva: number;
  pct: number;
  metodo: string;
  inpc_inicial: number | null;
  inpc_final: number | null;
  periodo_inicial: string | null;
  periodo_final: string | null;
  desde: string;
  nuevo_fin: string | null;
  created_at: string;
  visto_at: string | null;
  organizaciones: { nombre: string } | null;
  contratos: { inicio: string; dia_pago: number; propiedades: { nombre: string; direccion: string | null; colonia: string | null } | null; inquilinos: { nombre: string } | null } | null;
};

async function Contenido({ params }: Props) {
  await connection();
  const { token } = await params;
  const admin = createAdminClient();
  const { data } = /^[0-9a-f]{32}$/.test(token)
    ? await admin
        .from("aumentos_renta")
        .select("id, renta_anterior, renta_nueva, pct, metodo, inpc_inicial, inpc_final, periodo_inicial, periodo_final, desde, nuevo_fin, created_at, visto_at, organizaciones(nombre), contratos(inicio, dia_pago, propiedades(nombre, direccion, colonia), inquilinos(nombre))")
        .eq("token", token)
        .maybeSingle()
    : { data: null };
  const a = data as unknown as Aumento | null;
  if (!a) return <p className="rounded-2xl bg-white p-6">Este link no es válido. Pídelo de nuevo a tu administradora.</p>;
  if (!a.visto_at) await admin.from("aumentos_renta").update({ visto_at: new Date().toISOString() }).eq("id", a.id);
  const k = a.contratos;
  const casa = [k?.propiedades?.nombre, k?.propiedades?.direccion, k?.propiedades?.colonia].filter(Boolean).join(", ");
  const diferencia = Number(a.renta_nueva) - Number(a.renta_anterior);

  return (
    <article className="flex flex-col gap-5 rounded-2xl bg-white p-6 print:p-0">
      <header>
        <p className="text-sm text-gris">
          {a.organizaciones?.nombre} · {formatoFecha(a.created_at.slice(0, 10))}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">Renovación de contrato y ajuste de renta</h1>
      </header>
      <p>
        {k?.inquilinos?.nombre ? `Estimado(a) ${k.inquilinos.nombre}:` : "Estimado(a) inquilino(a):"} te informamos que el contrato de arrendamiento de <strong>{casa}</strong>
        {a.nuevo_fin ? (
          <>
            {" "}
            queda vigente hasta el <strong>{formatoFecha(a.nuevo_fin)}</strong>
          </>
        ) : null}{" "}
        y que a partir del <strong>{formatoFecha(a.desde)}</strong> la renta mensual será la siguiente:
      </p>
      <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-fondo p-4 sm:grid-cols-4">
        <Dato t="Renta actual" v={pesos.format(a.renta_anterior)} />
        <Dato t="Ajuste" v={`${Number(a.pct) >= 0 ? "+" : ""}${pctTexto(Number(a.pct))}`} />
        <Dato t="Renta nueva" v={pesos.format(a.renta_nueva)} fuerte />
        <Dato t="Diferencia al mes" v={pesos.format(diferencia)} />
      </dl>
      {a.metodo === "inpc" && a.inpc_inicial && a.inpc_final && a.periodo_inicial && a.periodo_final ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-bold">¿Cómo se calculó?</h2>
          <p className="text-sm">
            Con el Índice Nacional de Precios al Consumidor (INPC) que publica el INEGI, comparando el último mes publicado antes de la renovación con el mismo mes del año anterior:
          </p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-borde-suave">
              <tr>
                <td className="py-1.5">INPC de {mesINPC(a.periodo_final)}</td>
                <td className="py-1.5 text-right font-mono">{Number(a.inpc_final).toFixed(3)}</td>
              </tr>
              <tr>
                <td className="py-1.5">INPC de {mesINPC(a.periodo_inicial)}</td>
                <td className="py-1.5 text-right font-mono">{Number(a.inpc_inicial).toFixed(3)}</td>
              </tr>
              <tr>
                <td className="py-1.5">Inflación de 12 meses ({Number(a.inpc_final).toFixed(3)} ÷ {Number(a.inpc_inicial).toFixed(3)} − 1)</td>
                <td className="py-1.5 text-right font-mono">{pctTexto((Number(a.inpc_final) / Number(a.inpc_inicial) - 1) * 100)}</td>
              </tr>
              <tr className="font-bold">
                <td className="py-1.5">Ajuste aplicado según tu contrato</td>
                <td className="py-1.5 text-right font-mono">{pctTexto(Number(a.pct))}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gris">Puedes consultar el INPC en inegi.org.mx (Índices de precios › INPC). Base: segunda quincena de julio 2018 = 100.</p>
        </section>
      ) : (
        <p className="text-sm">{a.metodo === "fijo" ? "El ajuste corresponde al porcentaje pactado en el contrato." : "El ajuste fue acordado con la administración."}</p>
      )}
      <p className="text-sm">
        El pago sigue siendo el día {k?.dia_pago ?? 1} de cada mes. Si tienes dudas, responde a tu administradora. Gracias por tu confianza.
      </p>
      <p className="text-sm font-semibold">{a.organizaciones?.nombre}</p>
      <div className="print:hidden">
        <BotonImprimir />
      </div>
    </article>
  );
}

function Dato({ t, v, fuerte }: { t: string; v: string; fuerte?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-gris">{t}</dt>
      <dd className={`font-mono ${fuerte ? "text-xl font-bold text-verde-oscuro" : "font-semibold"}`}>{v}</dd>
    </div>
  );
}
