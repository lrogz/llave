import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Icono } from "@/components/vecino/Iconos";
import { Cargando, Chip, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { cuando, datosVecino, dinero } from "@/lib/condominios";

const ESTADO = {
  confirmado: { texto: "Confirmado", clase: "bg-[#D5E6CF] text-[#1E4D2B]" },
  pendiente: { texto: "En revisión", clase: "bg-[#F6D9A0] text-[#6B4A0B]" },
  rechazado: { texto: "Rechazado", clase: "bg-[#FBE3D6] text-[#7A2E0A]" },
} as const;

export default function Recibos({ params }: { params: Promise<{ token: string }> }) {
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
  const pagos = d.cuenta?.pagos ?? [];
  return (
    <Pantalla>
      <Titulo titulo="Pagos y recibos" sub={d.vivienda.numero} atras={`/vecino/${token}/cuenta`} />
      {!d.cuenta ? (
        <Vacio>Tu cuenta no puede ver recibos.</Vacio>
      ) : pagos.length ? (
        <Tarjeta>
          <ul className="divide-y divide-[#E1DCD0]">
            {pagos.map((p) => {
              const e = ESTADO[p.estado as keyof typeof ESTADO] ?? ESTADO.pendiente;
              const fila = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold tabular-nums">{dinero(p.monto_centavos)}</span>
                    <span className="block text-base text-[#5A5547]">
                      {cuando(`${p.pagado_el}T12:00:00-06:00`).split(" · ")[0]}
                      {p.recibo ? ` · Recibo ${p.recibo}` : ""}
                      {p.estado === "rechazado" && p.nota ? ` · ${p.nota}` : ""}
                    </span>
                  </span>
                  <Chip texto={e.texto} clase={e.clase} />
                </>
              );
              return (
                <li key={p.id}>
                  {p.recibo ? (
                    <Link href={`/vecino/${token}/cuenta/recibos/${p.id}`} className="flex items-center gap-3 px-4 py-4">
                      {fila}
                      <Icono nombre="adelante" className="size-5 text-[#5A5547]" />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-4">{fila}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      ) : (
        <Vacio>Aún no hay pagos registrados.</Vacio>
      )}
    </Pantalla>
  );
}
