import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { FormPase } from "@/components/vecino/FormPase";
import { Cargando, LinkInvalido, Pantalla, Titulo, Vacio } from "@/components/vecino/Piezas";
import { datosVecino, hoyCDMX } from "@/lib/condominios";

export default function NuevoPase({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ personal?: string; motivo?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ personal?: string; motivo?: string }> }) {
  await connection();
  const [{ token }, { personal, motivo }] = await Promise.all([params, searchParams]);
  const d = await datosVecino(token);
  if (!d) return <LinkInvalido />;
  const esPersonal = personal === "1";
  const servicio = motivo === "servicio";
  const motivos: [string, string, boolean][] = [
    ["Visita", `/vecino/${token}/visitas/nuevo`, !servicio],
    ["Servicio", `/vecino/${token}/visitas/nuevo?motivo=servicio`, servicio],
    ["Fiesta", `/vecino/${token}/fiesta`, false],
    ["Mudanza", `/vecino/${token}/mudanza`, false],
  ];
  return (
    <Pantalla>
      <Titulo titulo={esPersonal ? "Alta de personal doméstico" : "Nuevo pase"} sub={d.vivienda.numero} atras={`/vecino/${token}/visitas`} />
      {!esPersonal && (
        <nav aria-label="Motivo" className="mb-5 grid grid-cols-4 gap-1.5">
          {motivos.map(([t, href, activo]) => (
            <Link key={t} href={href} aria-current={activo ? "page" : undefined} className={`flex min-h-12 items-center justify-center rounded-xl border text-base ${activo ? "border-transparent bg-[#D5E6CF] font-semibold text-[#1E4D2B]" : "border-[#BDB8AC] bg-[#FBF9F4]"}`}>
              {t}
            </Link>
          ))}
        </nav>
      )}
      {d.permisos.pases ? <FormPase key={motivo ?? "visita"} token={token} hoy={hoyCDMX()} personal={esPersonal} servicio={servicio} /> : <Vacio>Tu cuenta no puede crear pases.</Vacio>}
    </Pantalla>
  );
}
