import { Suspense } from "react";
import { connection } from "next/server";
import { revocarRecogida } from "@/app/vecino/actions";
import { Boton } from "@/components/Boton";
import { FormRecogida } from "@/components/vecino/FormRecogida";
import { Icono } from "@/components/vecino/Iconos";
import { Cargando, Chip, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { cuando, datosVecino, recogidasVecino, urlsFirmadas } from "@/lib/condominios";
import { linkWhatsApp, origen } from "@/lib/util";

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
  const [d, rec] = await Promise.all([datosVecino(token), recogidasVecino(token)]);
  if (!d || !rec) return <LinkInvalido />;
  const extra = new Map(rec.paquetes.map((p) => [p.id, p]));
  const fotos = await urlsFirmadas(rec.paquetes.flatMap((p) => [p.foto_path, p.entrega_foto_path]));
  const pendientes = d.paquetes.filter((p) => !p.entregado_at);
  const base = await origen();
  const ahora = new Date();
  const activas = rec.autorizaciones.filter((a) => !a.usado_at && !a.revocado_at && new Date(a.expira) > ahora);
  const pasadas = rec.autorizaciones.filter((a) => !activas.includes(a)).slice(0, 5);
  return (
    <Pantalla>
      <Titulo titulo="Paquetes" sub={d.vivienda.numero} atras={`/vecino/${token}`} />
      {d.paquetes.length ? (
        <Tarjeta>
          <ul className="divide-y divide-[#E1DCD0]">
            {d.paquetes.map((p) => {
              const x = extra.get(p.id);
              const foto = x?.foto_path ? fotos.get(x.foto_path) : null;
              const evidencia = x?.entrega_foto_path ? fotos.get(x.entrega_foto_path) : null;
              return (
                <li key={p.id} className="flex flex-col gap-2 px-4 py-4">
                  <div className="flex items-center gap-4">
                    {foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={foto} alt="Foto del paquete" className="size-14 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[#DCE8D5]">
                        <Icono nombre="paquete" className="size-7" grueso={1.5} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-semibold">{[p.paqueteria, p.descripcion].filter(Boolean).join(" · ") || "Paquete"}</span>
                      <span className="block text-base text-[#5A5547]">
                        {p.entregado_at ? `Entregado a ${p.entregado_a} · ${cuando(p.entregado_at)}` : `Llegó ${cuando(p.recibido_at)}${p.ubicacion ? ` · ${p.ubicacion}` : ""}`}
                      </span>
                    </span>
                    {p.entregado_at ? <Chip texto="Entregado" clase="bg-[#E7E3DA] text-[#5A5547]" /> : <Chip texto="En caseta" clase="bg-[#D5E6CF] text-[#1E4D2B]" />}
                  </div>
                  {evidencia && (
                    <a href={evidencia} target="_blank" rel="noopener" className="text-base font-semibold text-[#17583A] underline">
                      Ver foto de la entrega
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      ) : (
        <Vacio>Cuando llegue un paquete a caseta lo verás aquí.</Vacio>
      )}

      {pendientes.length > 0 && (
        <>
          <h2 className="font-display text-2xl font-bold">¿Lo recoge alguien más?</h2>
          <Tarjeta className="p-4">
            <FormRecogida token={token} paquetes={pendientes.map((p) => ({ id: p.id, texto: [p.paqueteria, p.descripcion].filter(Boolean).join(" · ") || "Paquete" }))} />
          </Tarjeta>
        </>
      )}
      {(activas.length > 0 || pasadas.length > 0) && (
        <Tarjeta>
          <ul className="divide-y divide-[#E1DCD0]">
            {[...activas, ...pasadas].map((a) => {
              const activa = activas.includes(a);
              return (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold">{a.nombre}</p>
                    <p className="text-sm text-[#5A5547]">
                      {activa ? `PIN ${a.pin} · vence ${cuando(a.expira)}` : a.usado_at ? `Recogió ${cuando(a.usado_at)}` : a.revocado_at ? "Cancelada" : "Venció"}
                    </p>
                  </div>
                  {activa && (
                    <>
                      <a
                        href={linkWhatsApp(null, `Hola ${a.nombre}, te autoricé a recoger mi paquete en caseta de ${d.condominio.nombre}. Tu PIN: ${a.pin}. Detalles: ${base}/recoger/${a.token}`)}
                        target="_blank"
                        rel="noopener"
                        aria-label={`Mandar PIN a ${a.nombre}`}
                        className="flex size-12 items-center justify-center rounded-xl bg-[#17583A] text-white"
                      >
                        <Icono nombre="whatsapp" className="size-6" />
                      </a>
                      <form action={revocarRecogida}>
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="autorizacion_id" value={a.id} />
                        <Boton estilo="claro" enviando="…" className="min-h-12 rounded-xl! px-3! text-base!">
                          Cancelar
                        </Boton>
                      </form>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      )}
    </Pantalla>
  );
}
