import { Suspense } from "react";
import { connection } from "next/server";
import { guardarVehiculo } from "@/app/vecino/actions";
import { FormPin, FormVehiculo } from "@/components/vecino/FormsComunidad";
import { Cargando, Chip, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { comunidadVecino, cuando, datosVecino } from "@/lib/condominios";

export default function Accesos({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const [d, c] = await Promise.all([datosVecino(token), comunidadVecino(token)]);
  if (!d || !c) return <LinkInvalido />;
  const quitar = async (f: FormData) => {
    "use server";
    await guardarVehiculo(null, f);
  };
  return (
    <Pantalla>
      <Titulo titulo="Autos y entregas" sub={d.vivienda.numero} atras={`/vecino/${token}`} />
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Mis autos</h2>
        <p className="text-base text-[#5A5547]">Si tu privada tiene cámara de placas, tus autos entran sin detenerse. Las placas de tus visitas se ponen al crear su pase.</p>
        {c.vehiculos.length > 0 && (
          <Tarjeta>
            <ul className="divide-y divide-[#E1DCD0]">
              {c.vehiculos.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <b className="font-mono text-lg tracking-wider">{v.placa}</b>
                    {v.descripcion && <span className="block text-sm text-[#5A5547]">{v.descripcion}</span>}
                  </span>
                  <form action={quitar}>
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="borrar" value={v.id} />
                    <button className="min-h-11 rounded-xl border border-[#BDB8AC] px-3 text-base">Quitar</button>
                  </form>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}
        <FormVehiculo token={token} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Códigos para repartidores</h2>
        <p className="text-base text-[#5A5547]">El repartidor teclea el código en el cuarto de paquetes o se lo da a caseta. El paquete queda registrado a tu nombre y te avisamos.</p>
        <FormPin token={token} />
        {c.pines.length ? (
          <Tarjeta>
            <ul className="divide-y divide-[#E1DCD0]">
              {c.pines.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <b className="font-mono text-xl tracking-[0.2em]">{p.pin}</b>
                    <span className="block text-sm text-[#5A5547]">
                      {p.descripcion ?? "Entrega"} · {p.usado_at ? `usado ${cuando(p.usado_at)}` : `vence ${cuando(p.expira)}`}
                    </span>
                  </span>
                  <Chip texto={p.usado_at ? "Usado" : "Activo"} clase={p.usado_at ? "bg-[#E7E3DA] text-[#5A5547]" : "bg-[#D5E6CF] text-[#1E4D2B]"} />
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : (
          <Vacio>Aún no generas códigos.</Vacio>
        )}
      </section>
    </Pantalla>
  );
}
