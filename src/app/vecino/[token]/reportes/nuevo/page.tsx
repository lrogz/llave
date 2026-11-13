import { Suspense } from "react";
import { connection } from "next/server";
import { FormReporte } from "@/components/vecino/FormReporte";
import { Cargando, LinkInvalido, Pantalla, Titulo, Vacio } from "@/components/vecino/Piezas";
import { datosVecino } from "@/lib/condominios";

export default function NuevoReporte({ params }: { params: Promise<{ token: string }> }) {
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
      <Titulo titulo="Nuevo reporte" sub={d.vivienda.numero} atras={`/vecino/${token}/reportes`} />
      {d.permisos.reportes ? <FormReporte token={token} /> : <Vacio>Tu cuenta no puede levantar reportes.</Vacio>}
    </Pantalla>
  );
}
