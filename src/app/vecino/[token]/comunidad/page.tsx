import { Suspense } from "react";
import { connection } from "next/server";
import { borrarPublicacion, responderPublicacion, votar } from "@/app/vecino/actions";
import { Boton } from "@/components/Boton";
import { FormPublicar } from "@/components/vecino/FormsComunidad";
import { CAMPO, Cargando, Chip, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { CATEGORIAS_DOCUMENTO, TIPOS_TABLERO, comunidadVecino, cuando, datosVecino, etiquetaDe } from "@/lib/condominios";

export default function Comunidad({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

const H2 = "text-2xl font-bold";

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const [d, c] = await Promise.all([datosVecino(token), comunidadVecino(token)]);
  if (!d || !c) return <LinkInvalido />;
  const proxima = c.asambleas.find((a) => a.estado === "convocada" && new Date(a.fecha) > new Date());
  return (
    <Pantalla>
      <Titulo titulo="Comunidad" sub={d.condominio.nombre} atras={`/vecino/${token}`} />

      <section className="flex flex-col gap-3">
        <h2 className={H2}>Votaciones</h2>
        {c.votaciones.length ? (
          c.votaciones.map((v) => {
            const puede = v.abierta && v.mi_voto === null && (!v.solo_propietarios || d.residente.tipo === "propietario");
            const total = v.resultados?.votos ?? 0;
            return (
              <Tarjeta key={v.id} className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-bold">{v.pregunta}</h3>
                  <Chip texto={v.abierta ? "Abierta" : "Cerrada"} clase={v.abierta ? "bg-[#D5E6CF] text-[#1E4D2B]" : "bg-[#E7E3DA] text-[#5A5547]"} />
                </div>
                {v.descripcion && <p className="text-base text-[#2E2D27]">{v.descripcion}</p>}
                <p className="text-sm text-[#5A5547]">
                  {v.abierta ? `Cierra ${cuando(v.cierra)}` : `Cerró ${cuando(v.cierra)}`} · un voto por vivienda{v.solo_propietarios ? " (vota el propietario)" : ""}
                </p>
                {puede ? (
                  <form action={votar} className="flex flex-col gap-2">
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="votacion_id" value={v.id} />
                    {v.opciones.map((o, i) => (
                      <button key={i} name="opcion" value={i} className="min-h-14 rounded-xl border border-[#BDB8AC] bg-white text-lg font-semibold hover:border-[#17583A]">
                        {o}
                      </button>
                    ))}
                    <p className="text-xs text-[#5A5547]">Tu voto no se puede cambiar.</p>
                  </form>
                ) : v.mi_voto !== null ? (
                  <p className="rounded-xl bg-[#DCE8D5] px-4 py-2 text-base">Tu vivienda votó: <b>{v.opciones[v.mi_voto]}</b></p>
                ) : null}
                {v.resultados && (
                  <div className="flex flex-col gap-2">
                    {v.resultados.opciones.map((o) => {
                      const pct = total ? Math.round((100 * o.votos) / total) : 0;
                      return (
                        <div key={o.opcion}>
                          <div className="flex justify-between text-base">
                            <span>{o.opcion}</span>
                            <span className="tabular-nums">
                              {o.votos} · {pct}%{Number(o.indiviso) ? ` · ${Number(o.indiviso).toFixed(2)}% indiviso` : ""}
                            </span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-[#E7E3DA]">
                            <div className="h-full rounded-full bg-[#17583A]" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-sm text-[#5A5547]">
                      Participación: {v.resultados.votos} de {v.resultados.viviendas} viviendas ({v.resultados.participacion_pct ?? 0}%)
                    </p>
                  </div>
                )}
              </Tarjeta>
            );
          })
        ) : (
          <Vacio>No hay votaciones por ahora.</Vacio>
        )}
      </section>

      {(proxima || c.asambleas.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className={H2}>Asambleas</h2>
          {c.asambleas.map((a) => (
            <Tarjeta key={a.id} className="flex flex-col gap-2 p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xl font-bold">{a.titulo}</h3>
                <Chip texto={a.estado === "convocada" ? "Convocada" : a.estado === "celebrada" ? "Celebrada" : "Cancelada"} clase="bg-[#E7E3DA] text-[#2E2D27]" />
              </div>
              <p className="text-base">
                {cuando(a.fecha)}
                {a.lugar ? ` · ${a.lugar}` : ""} · {a.tipo}
              </p>
              {a.orden_del_dia && (
                <details>
                  <summary className="cursor-pointer text-base font-semibold text-[#17583A]">Orden del día</summary>
                  <p className="mt-2 text-base whitespace-pre-line">{a.orden_del_dia}</p>
                </details>
              )}
              {a.acta && (
                <details>
                  <summary className="cursor-pointer text-base font-semibold text-[#17583A]">Acta</summary>
                  <p className="mt-2 text-base whitespace-pre-line">{a.acta}</p>
                </details>
              )}
            </Tarjeta>
          ))}
        </section>
      )}

      {c.acuerdos.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={H2}>Acuerdos</h2>
          <Tarjeta>
            <ul className="divide-y divide-[#E1DCD0]">
              {c.acuerdos.map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-4 py-3 text-base">
                  <span>
                    {a.texto}
                    <span className="block text-sm text-[#5A5547]">
                      {a.responsable ?? "Sin responsable"}
                      {a.fecha_limite ? ` · antes del ${cuando(`${a.fecha_limite}T12:00:00-06:00`).split(" · ")[0]}` : ""}
                    </span>
                  </span>
                  <Chip texto={a.estado === "cumplido" ? "Cumplido" : a.estado === "en_proceso" ? "En proceso" : "Pendiente"} clase={a.estado === "cumplido" ? "bg-[#D5E6CF] text-[#1E4D2B]" : "bg-[#F6D9A0] text-[#6B4A0B]"} />
                </li>
              ))}
            </ul>
          </Tarjeta>
        </section>
      )}

      {c.documentos.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={H2}>Documentos</h2>
          <Tarjeta>
            <ul className="divide-y divide-[#E1DCD0]">
              {c.documentos.map((x) => (
                <li key={x.id}>
                  <a href={`/vecino/${token}/documento/${x.id}`} target="_blank" rel="noopener" className="flex min-h-14 items-center justify-between gap-3 px-4 text-base">
                    <span>
                      <b>{x.titulo}</b>
                      <span className="block text-sm text-[#5A5547]">{etiquetaDe(CATEGORIAS_DOCUMENTO, x.categoria)}</span>
                    </span>
                    <span className="text-[#17583A]">Ver</span>
                  </a>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className={H2}>Tablero vecinal</h2>
        <FormPublicar token={token} />
        {c.tablero.map((t) => (
          <Tarjeta key={t.id} className="flex flex-col gap-2 p-4">
            <p className="text-sm text-[#5A5547]">
              {etiquetaDe(TIPOS_TABLERO, t.tipo)} · {t.autor} · {cuando(t.created_at)}
            </p>
            <h3 className="text-lg font-bold">{t.titulo}</h3>
            <p className="text-base whitespace-pre-line">{t.texto}</p>
            {t.respuestas.map((r, i) => (
              <p key={i} className="rounded-xl bg-[#F1EDE3] px-3 py-2 text-base">
                <b>{r.autor}:</b> {r.texto}
              </p>
            ))}
            <form action={responderPublicacion} className="flex gap-2">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="publicacion_id" value={t.id} />
              <input name="texto" required maxLength={500} placeholder="Responder" className={CAMPO} aria-label="Responder" />
              <Boton className="min-h-13! shrink-0 rounded-xl! bg-[#17583A]!">Enviar</Boton>
            </form>
            {t.mio && (
              <form action={borrarPublicacion}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="publicacion_id" value={t.id} />
                <button className="text-sm text-[#5A5547] underline">Quitar mi publicación</button>
              </form>
            )}
          </Tarjeta>
        ))}
      </section>
    </Pantalla>
  );
}
