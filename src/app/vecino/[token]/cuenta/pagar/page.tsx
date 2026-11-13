import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import { connection } from "next/server";
import { FormTransferencia } from "@/components/vecino/FormTransferencia";
import { Cargando, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { datosVecino, hoyCDMX } from "@/lib/condominios";

export default function Pagar({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const d = await datosVecino(token);
  if (!d) return <LinkInvalido />;
  const saldo = Number(d.cuenta?.saldo_centavos ?? 0);
  return (
    <Pantalla>
      <Titulo titulo="Registrar transferencia" sub={d.vivienda.numero} atras={`/vecino/${token}/cuenta`} />
      {!d.permisos.registrar_pagos ? (
        <Vacio>Tu cuenta no puede registrar pagos. Pídelo a tu administración.</Vacio>
      ) : (
        <>
          <Tarjeta className="p-4">
            <p className="text-base font-semibold">Transfiere a la cuenta del condominio</p>
            <p className="mt-1 text-base whitespace-pre-line text-[#2E2D27]">{d.cuenta?.datos_pago || "Tu administración aún no registra los datos bancarios. Pídelos antes de transferir."}</p>
            <p className="mt-2 text-sm text-[#5A5547]">En el concepto pon tu número de vivienda: {d.vivienda.numero}.</p>
          </Tarjeta>
          <FormTransferencia token={token} clave={randomUUID()} hoy={hoyCDMX()} sugerido={saldo > 0 ? (saldo / 100).toFixed(2) : ""} />
          <p className="text-sm text-[#5A5547]">La app registra transferencias ya hechas. La administración revisa el comprobante, confirma el pago y te emite tu recibo.</p>
        </>
      )}
    </Pantalla>
  );
}
