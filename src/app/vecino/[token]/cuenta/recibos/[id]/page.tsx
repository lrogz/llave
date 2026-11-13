import { Suspense } from "react";
import { connection } from "next/server";
import { BotonImprimir } from "@/components/BotonImprimir";
import { Cargando, LinkInvalido, Pantalla, Titulo } from "@/components/vecino/Piezas";
import { createAdminClient } from "@/lib/supabase/admin";
import { cuando, dineroMXN, esToken, esUuid } from "@/lib/condominios";

type Recibo = { folio: string; monto_centavos: number; pagado_el: string; referencia: string | null; emitido: string; vivienda: string; condominio: string; administradora: string; residente: string; saldo_centavos: number };

export default function ReciboPagina({ params }: { params: Promise<{ token: string; id: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string; id: string }> }) {
  await connection();
  const { token, id } = await params;
  if (!esToken(token) || !esUuid(id)) return <LinkInvalido />;
  const { data, error } = await createAdminClient().rpc("vecino_recibo", { p_token: token, p_pago: id });
  if (error || !data) return <LinkInvalido />;
  const r = data as Recibo;
  const filas: [string, string][] = [
    ["Condominio", r.condominio],
    ["Vivienda", r.vivienda],
    ["Recibimos de", r.residente],
    ["Fecha de pago", cuando(`${r.pagado_el}T12:00:00-06:00`).split(" · ")[0]],
    ["Referencia", r.referencia ?? "—"],
    ["Emitido", cuando(r.emitido)],
  ];
  return (
    <Pantalla>
      <div className="print:hidden">
        <Titulo titulo="Recibo de pago" atras={`/vecino/${token}/cuenta/recibos`} />
      </div>
      <article className="rounded-2xl border border-[#E1DCD0] bg-white p-6 print:border-0">
        <p className="text-sm font-semibold tracking-wide text-[#5A5547] uppercase">{r.administradora}</p>
        <h1 className="mt-1 font-display text-2xl font-bold">Recibo {r.folio}</h1>
        <p className="mt-4 font-display text-4xl font-bold">{dineroMXN(r.monto_centavos)}</p>
        <dl className="mt-5 divide-y divide-[#EEE9DF] text-base">
          {filas.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <dt className="text-[#5A5547]">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-sm text-[#5A5547]">Comprobante de pago de cuotas del condominio. No es un comprobante fiscal (CFDI).</p>
      </article>
      <div className="print:hidden">
        <BotonImprimir />
      </div>
    </Pantalla>
  );
}
