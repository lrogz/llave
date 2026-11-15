import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { cancelarReserva, responderOferta } from "@/app/vecino/actions";
import { Boton } from "@/components/Boton";
import { Icono } from "@/components/vecino/Iconos";
import { Aviso, BotonContorno, Cargando, Chip, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { amenidadesVecino, cuando, datosVecino, dinero, urlsFirmadas, vigencia } from "@/lib/condominios";

const ESTADO: Record<string, { texto: string; clase: string }> = {
  confirmada: { texto: "Confirmada", clase: "bg-[#D5E6CF] text-[#1E4D2B]" },
  solicitada: { texto: "Por aprobar", clase: "bg-[#F6D9A0] text-[#6B4A0B]" },
  espera: { texto: "Lista de espera", clase: "bg-[#F4E3C1] text-[#6B4A0B]" },
  ofrecida: { texto: "¡Lugar libre!", clase: "bg-[#F6D9A0] text-[#6B4A0B]" },
  rechazada: { texto: "Rechazada", clase: "bg-[#FBE3D6] text-[#7A2E0A]" },
  cancelada: { texto: "Cancelada", clase: "bg-[#E7E3DA] text-[#5A5547]" },
};

export default function Amenidades({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ reserva?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ reserva?: string }> }) {
  await connection();
  const [{ token }, { reserva }] = await Promise.all([params, searchParams]);
  const [d, am] = await Promise.all([datosVecino(token), amenidadesVecino(token)]);
  if (!d || !am) return <LinkInvalido />;
  const fotos = await urlsFirmadas(am.amenidades.map((a) => a.foto_path));
  const proximas = am.reservas.filter((r) => new Date(r.fin) > new Date() && ["confirmada", "solicitada", "espera", "ofrecida"].includes(r.estado));
  return (
    <Pantalla>
      <Titulo titulo="Amenidades" sub={d.vivienda.numero} atras={`/vecino/${token}`} />
      {reserva === "confirmada" && <Aviso>¡Reservado! Te esperamos.</Aviso>}
      {reserva === "solicitada" && <Aviso>Enviamos tu solicitud. Te avisaremos cuando la administración la apruebe.</Aviso>}
      {reserva === "espera" && <Aviso>Ese horario está lleno: quedaste en lista de espera. Si alguien cancela, te avisamos para que confirmes.</Aviso>}

      {proximas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">Mis reservas</h2>
          <Tarjeta>
            <ul className="divide-y divide-[#E1DCD0]">
              {proximas.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-lg font-semibold">{r.amenidad}</span>
                      <span className="block text-base text-[#5A5547]">{vigencia(r.inicio, r.fin)}</span>
                      {Number(r.renta_centavos) + Number(r.deposito_centavos) > 0 && (
                        <span className="block text-sm text-[#5A5547]">
                          Renta {dinero(r.renta_centavos)} · depósito {dinero(r.deposito_centavos)}
                        </span>
                      )}
                    </span>
                    <Chip texto={ESTADO[r.estado]?.texto ?? r.estado} clase={ESTADO[r.estado]?.clase ?? ""} />
                  </div>
                  {r.estado === "ofrecida" ? (
                    <div className="flex flex-col gap-2 rounded-xl bg-[#F6D9A0]/50 p-3">
                      <p className="text-base font-semibold">Se liberó un lugar. Confírmalo antes de {r.oferta_expira ? cuando(r.oferta_expira) : "que venza"}.</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(["si", "no"] as const).map((v) => (
                          <form key={v} action={responderOferta}>
                            <input type="hidden" name="token" value={token} />
                            <input type="hidden" name="reserva_id" value={r.id} />
                            <input type="hidden" name="aceptar" value={v} />
                            <Boton estilo={v === "si" ? "primario" : "claro"} enviando="…" className="min-h-12 w-full rounded-xl! text-base!">
                              {v === "si" ? "Confirmar" : "Ya no"}
                            </Boton>
                          </form>
                        ))}
                      </div>
                    </div>
                  ) : r.deposito_estado !== "cargado" && (
                    <form action={cancelarReserva}>
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="reserva_id" value={r.id} />
                      <Boton estilo="claro" enviando="Cancelando…" className="min-h-11 rounded-xl! text-base!">
                        Cancelar
                      </Boton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Tarjeta>
        </section>
      )}

      {am.amenidades.length ? (
        am.amenidades.map((a) => {
          const foto = a.foto_path ? fotos.get(a.foto_path) : null;
          return (
            <Link key={a.id} href={`/vecino/${token}/amenidades/${a.id}`} className="overflow-hidden rounded-2xl border border-[#E1DCD0] bg-[#FBF9F4]">
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={foto} alt="" className="aspect-[2/1] w-full object-cover" />
              ) : (
                <div aria-hidden="true" className="aspect-[3/1] w-full bg-[linear-gradient(135deg,#DCE8D5,#E9E1CF)]" />
              )}
              <div className="flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-xl font-bold">{a.nombre}</span>
                  <span className="block text-base text-[#5A5547]">
                    {a.modo === "turnos" ? `Por turnos · ${a.hora_abre.slice(0, 5)} a ${a.hora_cierra.slice(0, 5)}` : `Con aprobación · hasta ${a.capacidad} personas`}
                    {Number(a.renta_centavos) ? ` · ${dinero(a.renta_centavos)}` : " · Incluido"}
                  </span>
                </span>
                <Icono nombre="adelante" className="size-6" />
              </div>
            </Link>
          );
        })
      ) : (
        <Vacio>Tu condominio aún no tiene amenidades para reservar.</Vacio>
      )}
      <BotonContorno href={`/vecino/${token}/mudanza`}>Agendar mudanza</BotonContorno>
    </Pantalla>
  );
}
