import { Suspense } from "react";
import { connection } from "next/server";
import { Icono, type NombreIcono } from "@/components/vecino/Iconos";
import { Aviso, BotonContorno, BotonGrande, Cargando, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { CONCEPTOS, datosVecino, dinero, dineroMXN, etiquetaDe, hoyCDMX, mesTexto } from "@/lib/condominios";

const ICONO: Record<string, NombreIcono> = { mantenimiento: "llave", agua: "gota", extraordinaria: "documento", multa: "alerta", otro: "recibo" };

export default function Cuenta({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ enviado?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ enviado?: string }> }) {
  await connection();
  const [{ token }, { enviado }] = await Promise.all([params, searchParams]);
  const d = await datosVecino(token);
  if (!d) return <LinkInvalido />;
  const base = `/vecino/${token}`;
  if (!d.cuenta) {
    return (
      <Pantalla>
        <Titulo titulo="Mi cuenta" sub={d.vivienda.numero} />
        <Vacio>El estado de cuenta de tu vivienda lo ve el propietario. Si necesitas verlo, pide el permiso a tu administración.</Vacio>
      </Pantalla>
    );
  }
  const c = d.cuenta;
  const mes = hoyCDMX().slice(0, 7);
  const delMes = c.cargos.filter((x) => x.periodo.startsWith(mes));
  const sumaMes = delMes.reduce((s, x) => s + Number(x.monto_centavos), 0);
  const saldo = Number(c.saldo_centavos);
  const resto = saldo - sumaMes;
  const enRevision = c.pagos.filter((p) => p.estado === "pendiente");

  return (
    <Pantalla>
      <Titulo titulo="Mi cuenta" sub={d.vivienda.numero} />
      {enviado && <Aviso>Recibimos tu transferencia. Te avisamos aquí cuando la administración la confirme.</Aviso>}
      <section className={`rounded-2xl p-6 ${saldo > 0 ? "bg-[#DCE8D5]" : "bg-[#E4EEDD]"}`}>
        <p className="text-xl text-[#2E2D27]">{saldo > 0 ? "Saldo pendiente" : saldo < 0 ? "Saldo a favor" : "Estás al corriente"}</p>
        <p className="mt-1 font-display text-[40px] leading-tight font-bold tracking-tight">{dineroMXN(Math.abs(saldo))}</p>
        <p className="mt-1 text-lg text-[#5A5547]">{mesTexto(mes)}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold">Desglose</h2>
        <Tarjeta>
          <ul className="divide-y divide-[#E1DCD0]">
            {delMes.map((x, i) => (
              <li key={i} className="flex items-center gap-4 px-4 py-4 text-lg">
                <Icono nombre={ICONO[x.concepto] ?? "recibo"} className="size-7 shrink-0" grueso={1.5} />
                <span className="min-w-0 flex-1">
                  {etiquetaDe(CONCEPTOS, x.concepto)}
                  {x.descripcion ? <span className="block text-base text-[#5A5547]">{x.descripcion}</span> : null}
                </span>
                <span className="tabular-nums">{dinero(x.monto_centavos)}</span>
              </li>
            ))}
            {resto !== 0 && (
              <li className="flex items-center gap-4 px-4 py-4 text-lg">
                <Icono nombre="reloj" className="size-7 shrink-0" grueso={1.5} />
                <span className="flex-1">{resto > 0 ? "Adeudo anterior" : "Pagos y saldo a favor"}</span>
                <span className="tabular-nums">{resto > 0 ? dinero(resto) : `−${dinero(-resto)}`}</span>
              </li>
            )}
            {!delMes.length && resto === 0 && <li className="px-4 py-4 text-base text-[#5A5547]">Sin cargos este mes.</li>}
          </ul>
        </Tarjeta>
      </section>

      {enRevision.length > 0 && (
        <p className="rounded-xl bg-[#FFF4E0] px-4 py-3 text-base text-[#6B4A0B]">
          {enRevision.length === 1 ? "1 transferencia" : `${enRevision.length} transferencias`} en revisión por {dinero(enRevision.reduce((s, p) => s + Number(p.monto_centavos), 0))}. Aún no se descuenta del saldo.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {d.permisos.registrar_pagos && (
          <BotonGrande href={`${base}/cuenta/pagar`} icono="banco">
            Registrar transferencia
          </BotonGrande>
        )}
        <BotonContorno href={`${base}/cuenta/recibos`}>Ver recibos</BotonContorno>
      </div>
    </Pantalla>
  );
}
