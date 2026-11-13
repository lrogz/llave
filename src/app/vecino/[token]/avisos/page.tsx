import { Suspense } from "react";
import { connection } from "next/server";
import { Cargando, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { cuando, datosVecino } from "@/lib/condominios";

export default function Avisos({ params }: { params: Promise<{ token: string }> }) {
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
      <Titulo titulo="Avisos" sub={d.condominio.nombre} atras={`/vecino/${token}`} />
      {d.avisos.length ? (
        d.avisos.map((a, i) => (
          <Tarjeta key={i} className="p-5">
            <p className="text-sm text-[#5A5547]">
              {cuando(a.created_at)}
              {a.zona ? ` · ${a.zona}` : ""}
            </p>
            <h2 className="mt-1 text-xl font-bold">{a.titulo}</h2>
            <p className="mt-2 text-lg whitespace-pre-line">{a.cuerpo}</p>
          </Tarjeta>
        ))
      ) : (
        <Vacio>Sin avisos por ahora.</Vacio>
      )}
    </Pantalla>
  );
}
