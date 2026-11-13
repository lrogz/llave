import { Suspense } from "react";
import { connection } from "next/server";
import { FormReserva } from "@/components/vecino/FormReserva";
import { Cargando, LinkInvalido, Pantalla, Titulo } from "@/components/vecino/Piezas";
import { amenidadesVecino, hoyCDMX, urlsFirmadas } from "@/lib/condominios";

export default function Reservar({ params }: { params: Promise<{ token: string; id: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string; id: string }> }) {
  await connection();
  const { token, id } = await params;
  const am = await amenidadesVecino(token);
  const a = am?.amenidades.find((x) => x.id === id);
  if (!a) return <LinkInvalido />;
  const fotos = await urlsFirmadas([a.foto_path]);
  const foto = a.foto_path ? fotos.get(a.foto_path) : null;
  return (
    <Pantalla>
      <Titulo titulo={a.modo === "turnos" ? `Reservar ${a.nombre.toLowerCase()}` : a.nombre} atras={`/vecino/${token}/amenidades`} />
      <span className="-mt-2 w-fit rounded-full bg-[#D5E6CF] px-4 py-1 text-lg font-semibold text-[#1E4D2B]">Amenidades</span>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt={a.nombre} className="aspect-[1.9/1] w-full rounded-2xl object-cover" />
      ) : (
        a.descripcion && <p className="text-lg text-[#5A5547]">{a.descripcion}</p>
      )}
      <FormReserva token={token} a={a} hoy={hoyCDMX()} />
    </Pantalla>
  );
}
