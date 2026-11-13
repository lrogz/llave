import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { cancelarMudanza } from "@/app/vecino/actions";
import { Boton } from "@/components/Boton";
import { FormMudanza } from "@/components/vecino/FormMudanza";
import { Aviso, Cargando, Chip, LinkInvalido, Pantalla, Tarjeta, Titulo } from "@/components/vecino/Piezas";
import { amenidadesVecino, datosVecino, hoyCDMX, vigencia } from "@/lib/condominios";

const ESTADO: Record<string, { texto: string; clase: string }> = {
  solicitada: { texto: "Por aprobar", clase: "bg-[#F6D9A0] text-[#6B4A0B]" },
  aprobada: { texto: "Aprobada", clase: "bg-[#D5E6CF] text-[#1E4D2B]" },
  rechazada: { texto: "Rechazada", clase: "bg-[#FBE3D6] text-[#7A2E0A]" },
  cancelada: { texto: "Cancelada", clase: "bg-[#E7E3DA] text-[#5A5547]" },
};

export default function Mudanza({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ enviada?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ enviada?: string }> }) {
  await connection();
  const [{ token }, { enviada }] = await Promise.all([params, searchParams]);
  const [d, am] = await Promise.all([datosVecino(token), amenidadesVecino(token)]);
  if (!d || !am) return <LinkInvalido />;
  const sub = d.vivienda.zona ? `${d.vivienda.zona} · ${d.vivienda.numero}` : d.vivienda.numero;
  return (
    <Pantalla>
      <Titulo titulo="Agendar mudanza" sub={sub} atras={`/vecino/${token}/amenidades`} />
      {enviada && <Aviso>Enviamos tu solicitud. Al aprobarla te llega el pase QR para la mudanza.</Aviso>}
      {am.mudanzas.length > 0 && (
        <Tarjeta>
          <ul className="divide-y divide-[#E1DCD0]">
            {am.mudanzas.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-lg font-semibold">
                      {m.tipo === "entrada" ? "Entrada" : "Salida"} · {m.empresa}
                    </span>
                    <span className="block text-base text-[#5A5547]">{vigencia(m.inicio, m.fin)}</span>
                    {m.nota && <span className="block text-sm text-[#5A5547]">{m.nota}</span>}
                  </span>
                  <Chip texto={ESTADO[m.estado]?.texto ?? m.estado} clase={ESTADO[m.estado]?.clase ?? ""} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.pase_codigo && (
                    <Link href={`/pase/${m.pase_codigo}`} className="flex min-h-11 items-center rounded-xl bg-[#17583A] px-4 text-base font-semibold text-white">
                      Ver pase QR
                    </Link>
                  )}
                  {["solicitada", "aprobada"].includes(m.estado) && (
                    <form action={cancelarMudanza}>
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="mudanza_id" value={m.id} />
                      <Boton estilo="claro" enviando="Cancelando…" className="rounded-xl! text-base!">
                        Cancelar
                      </Boton>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
      <FormMudanza token={token} hoy={hoyCDMX()} />
    </Pantalla>
  );
}
