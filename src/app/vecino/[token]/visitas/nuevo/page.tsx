import { Suspense } from "react";
import { connection } from "next/server";
import { FormPase } from "@/components/vecino/FormPase";
import { Cargando, LinkInvalido, Pantalla, Titulo, Vacio } from "@/components/vecino/Piezas";
import { datosVecino, hoyCDMX } from "@/lib/condominios";

export default function NuevoPase({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ personal?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ personal?: string }> }) {
  await connection();
  const [{ token }, { personal }] = await Promise.all([params, searchParams]);
  const d = await datosVecino(token);
  if (!d) return <LinkInvalido />;
  const esPersonal = personal === "1";
  return (
    <Pantalla>
      <Titulo titulo={esPersonal ? "Alta de personal doméstico" : "Nuevo pase"} sub={d.vivienda.numero} atras={`/vecino/${token}/visitas`} />
      {d.permisos.pases ? <FormPase token={token} hoy={hoyCDMX()} personal={esPersonal} /> : <Vacio>Tu cuenta no puede crear pases.</Vacio>}
    </Pantalla>
  );
}
