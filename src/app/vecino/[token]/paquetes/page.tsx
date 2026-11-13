import { Suspense } from "react";
import { connection } from "next/server";
import { Icono } from "@/components/vecino/Iconos";
import { Cargando, Chip, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { cuando, datosVecino } from "@/lib/condominios";

export default function Paquetes({ params }: { params: Promise<{ token: string }> }) {
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
  return (
    <Pantalla>
      <Titulo titulo="Paquetes" sub={d.vivienda.numero} atras={`/vecino/${token}`} />
      {d.paquetes.length ? (
        <Tarjeta>
          <ul className="divide-y divide-[#E1DCD0]">
            {d.paquetes.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-4 py-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#DCE8D5]">
                  <Icono nombre="paquete" className="size-7" grueso={1.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{[p.paqueteria, p.descripcion].filter(Boolean).join(" · ") || "Paquete"}</span>
                  <span className="block text-base text-[#5A5547]">
                    {p.entregado_at ? `Entregado a ${p.entregado_a} · ${cuando(p.entregado_at)}` : `Llegó ${cuando(p.recibido_at)}`}
                  </span>
                </span>
                {p.entregado_at ? <Chip texto="Entregado" clase="bg-[#E7E3DA] text-[#5A5547]" /> : <Chip texto="En caseta" clase="bg-[#D5E6CF] text-[#1E4D2B]" />}
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : (
        <Vacio>Cuando llegue un paquete a caseta lo verás aquí.</Vacio>
      )}
    </Pantalla>
  );
}
