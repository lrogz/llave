import { Suspense } from "react";
import { connection } from "next/server";
import { cancelarEvento, cancelarPase } from "@/app/vecino/actions";
import { Boton } from "@/components/Boton";
import { Icono } from "@/components/vecino/Iconos";
import { FormFiesta, FormMasInvitados } from "@/components/vecino/FormFiesta";
import { Aviso, Cargando, Chip, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { datosVecino, eventosVecino, hoyCDMX, reglaAcceso, vigencia } from "@/lib/condominios";
import { linkWhatsApp, origen } from "@/lib/util";

export default function Fiesta({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ evento?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ evento?: string }> }) {
  await connection();
  const [{ token }, { evento }] = await Promise.all([params, searchParams]);
  const [d, eventos, regla] = await Promise.all([datosVecino(token), eventosVecino(token), reglaAcceso(token, "fiesta")]);
  if (!d || !eventos) return <LinkInvalido />;
  const base = await origen();
  const activos = eventos.filter((e) => e.estado === "activo" && new Date(e.fin) > new Date());
  return (
    <Pantalla>
      <Titulo titulo="Fiesta o reunión" sub={d.vivienda.numero} atras={`/vecino/${token}/visitas`} />
      {evento && <Aviso>Listo. Cada invitado tiene su propio pase: compártelo por WhatsApp. Si cancelas uno, los demás siguen activos.</Aviso>}
      {activos.map((e) => {
        const usados = e.invitados.filter((i) => i.usos > 0).length;
        const vigentes = e.invitados.filter((i) => i.estado === "activo");
        return (
          <Tarjeta key={e.id}>
            <div className="flex items-start justify-between gap-3 px-4 pt-4">
              <div>
                <h2 className="font-display text-2xl font-bold">{e.nombre}</h2>
                <p className="text-base text-[#5A5547]">{vigencia(e.inicio, e.fin)}</p>
              </div>
              <Chip texto={`${usados}/${vigentes.length} llegaron`} clase="bg-[#D5E6CF] text-[#1E4D2B]" />
            </div>
            <ul className="mt-2 divide-y divide-[#E1DCD0]">
              {e.invitados.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-lg font-semibold ${i.estado === "cancelado" ? "text-[#8A8577] line-through" : ""}`}>{i.nombre}</p>
                    <p className="text-sm text-[#5A5547]">
                      #{i.folio}
                      {i.cajon ? ` · cajón ${i.cajon}` : ""}
                      {i.usos > 0 ? " · ya entró" : ""}
                    </p>
                  </div>
                  {i.estado === "activo" && i.usos === 0 && (
                    <>
                      <a
                        href={linkWhatsApp(null, `Hola ${i.nombre}, este es tu pase para "${e.nombre}" en ${d.condominio.nombre}. Muéstralo en caseta: ${base}/pase/${i.codigo}`)}
                        target="_blank"
                        rel="noopener"
                        aria-label={`Compartir pase de ${i.nombre}`}
                        className="flex size-12 items-center justify-center rounded-xl bg-[#17583A] text-white"
                      >
                        <Icono nombre="whatsapp" className="size-6" />
                      </a>
                      <form action={cancelarPase}>
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="pase_id" value={i.id} />
                        <Boton estilo="claro" enviando="…" className="min-h-12 rounded-xl! px-3! text-base!">
                          Quitar
                        </Boton>
                      </form>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <FormMasInvitados token={token} evento={e.id} />
            <form action={cancelarEvento} className="px-4 pb-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="evento_id" value={e.id} />
              <Boton estilo="claro" enviando="Cancelando…" className="min-h-13 w-full rounded-xl! text-base!">
                Cancelar la fiesta y todos sus pases
              </Boton>
            </form>
          </Tarjeta>
        );
      })}
      <h2 className="font-display text-2xl font-bold">Nueva fiesta</h2>
      {regla?.instrucciones && <p className="text-base text-[#5A5547]">Reglas de la privada: {regla.instrucciones}</p>}
      {d.permisos.pases ? (
        <FormFiesta token={token} hoy={hoyCDMX()} maxCajones={regla?.max_cajones ?? 0} maxInvitados={regla?.max_invitados ?? null} />
      ) : (
        <Vacio>Tu cuenta no puede crear pases.</Vacio>
      )}
    </Pantalla>
  );
}
