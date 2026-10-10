import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { campo } from "@/components/Seguimiento";
import { hoyMX, plantillas } from "@/lib/crm";
import { BUCKET, QUIEN_PAGA, TIPOS_SERVICIO, etiqueta, formatoFecha, linkWhatsApp, origen, pesos } from "@/lib/util";
import { InputComprimido } from "@/components/InputComprimido";
import { deshacerRecibo, pagarRecibo } from "../servicios/actions";
import { inicioDeMes, mesAnterior, mesTexto, siguienteMes } from "@/lib/reporte";
import { sesionConOrg } from "@/lib/sesion";
import { condonar, deshacerPago, guardarDatosPago, registrarPago, rechazarComprobante } from "./actions";

export const metadata: Metadata = { title: "Pagos · Black Key" };

type Cobro = {
  id: string;
  monto: number;
  recargo: number;
  vence: string;
  estado: "pendiente" | "por_confirmar" | "pagado" | "vencido" | "condonado";
  metodo: string | null;
  pagado_at: string | null;
  comprobante_path: string | null;
  token: string;
  nota: string | null;
  contratos: {
    propiedades: { id: string; nombre: string } | null;
    inquilinos: { id: string; nombre: string; telefono: string | null } | null;
  } | null;
};

const ESTADO: Record<Cobro["estado"], { texto: string; clase: string; orden: number }> = {
  vencido: { texto: "Atrasada", clase: "bg-naranja text-white", orden: 0 },
  por_confirmar: { texto: "Revisar comprobante", clase: "bg-[#E8EEFB] text-[#2A4A93]", orden: 1 },
  pendiente: { texto: "Pendiente", clase: "bg-[#FFF4E0] text-[#7A4E00]", orden: 2 },
  pagado: { texto: "Pagada", clase: "bg-verde-claro text-verde-oscuro", orden: 3 },
  condonado: { texto: "Condonada", clase: "bg-fondo text-gris", orden: 4 },
};
type Recibo = {
  id: string;
  monto: number | null;
  vence: string;
  estado: Cobro["estado"];
  pagado_at: string | null;
  comprobante_path: string | null;
  servicios: {
    tipo: string;
    compania: string | null;
    numero_servicio: string | null;
    quien_paga: string;
    propiedades: { id: string; nombre: string } | null;
  } | null;
};
const ORDEN_RECIBO: Record<Cobro["estado"], number> = { vencido: 0, pendiente: 1, por_confirmar: 1, pagado: 2, condonado: 3 };

const METODOS = [
  ["spei", "SPEI / transferencia"],
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["oxxo", "OXXO"],
  ["transferencia_externa", "Otro"],
] as const;

export default function Pagos({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { supabase, org } = await sesionConOrg();
  const { mes } = await searchParams;
  const hoy = hoyMX();
  const periodo = mes && /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : inicioDeMes(hoy);

  // Genera los cobros del mes y marca atrasos (no duplica si ya existen).
  await supabase.rpc("actualizar_cobros", { org: org.id });

  const [{ data }, { data: o }, { count: contratosActivos }, { data: rs }] = await Promise.all([
    supabase
      .from("cobros_renta")
      .select("id, monto, recargo, vence, estado, metodo, pagado_at, comprobante_path, token, nota, contratos(propiedades(id, nombre), inquilinos(id, nombre, telefono))")
      .eq("periodo", periodo)
      .order("vence"),
    supabase.from("organizaciones").select("datos_pago").eq("id", org.id).maybeSingle(),
    supabase.from("contratos").select("id", { count: "exact", head: true }).eq("activo", true),
    supabase
      .from("recibos_servicio")
      .select("id, monto, vence, estado, pagado_at, comprobante_path, servicios(tipo, compania, numero_servicio, quien_paga, propiedades(id, nombre))")
      .eq("periodo", periodo)
      .order("vence"),
  ]);
  const recibos = ((rs ?? []) as unknown as Recibo[]).sort((a, b) => ORDEN_RECIBO[a.estado] - ORDEN_RECIBO[b.estado] || a.vence.localeCompare(b.vence));
  const cobros = ((data ?? []) as unknown as Cobro[]).sort((a, b) => ESTADO[a.estado].orden - ESTADO[b.estado].orden || a.vence.localeCompare(b.vence));

  const rutas = [...cobros, ...recibos].filter((c) => c.comprobante_path).map((c) => c.comprobante_path!);
  const { data: firmadas } = rutas.length ? await supabase.storage.from(BUCKET).createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  const base = await origen();

  const total = (c: Cobro) => Number(c.monto) + Number(c.recargo ?? 0);
  const suma = (estados: Cobro["estado"][]) => cobros.filter((c) => estados.includes(c.estado)).reduce((s, c) => s + total(c), 0);
  const esperado = suma(["pendiente", "por_confirmar", "pagado", "vencido"]);
  const cobrado = suma(["pagado"]);

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Pagos" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris">Rentas</p>
            <h1 className="font-display text-4xl font-bold tracking-tight first-letter:uppercase">{mesTexto(periodo)}</h1>
          </div>
          <nav aria-label="Mes" className="flex gap-2">
            <Link href={`/pagos?mes=${mesAnterior(periodo).slice(0, 7)}`} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold">
              ‹ Anterior
            </Link>
            {periodo !== inicioDeMes(hoy) && (
              <Link href="/pagos" className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold">
                Este mes
              </Link>
            )}
            {periodo < inicioDeMes(hoy) && (
              <Link href={`/pagos?mes=${siguienteMes(periodo).slice(0, 7)}`} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold">
                Siguiente ›
              </Link>
            )}
          </nav>
        </header>

        <ul aria-label="Resumen de rentas" className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
          <Cifra titulo="Por cobrar en el mes" valor={pesos.format(esperado)} />
          <Cifra titulo="Cobrado" valor={pesos.format(cobrado)} nota={esperado ? `${Math.round((cobrado / esperado) * 100)}%` : undefined} verde />
          <Cifra titulo="Comprobantes por revisar" valor={String(cobros.filter((c) => c.estado === "por_confirmar").length)} />
          <Cifra titulo="Atrasado" valor={pesos.format(suma(["vencido"]))} alerta={suma(["vencido"]) > 0} />
          <Cifra
            titulo="Servicios vencidos"
            valor={String(recibos.filter((r) => r.estado === "vencido").length)}
            nota={`${recibos.filter((r) => r.estado === "pagado").length} de ${recibos.length} pagados`}
            alerta={recibos.some((r) => r.estado === "vencido")}
          />
        </ul>

        <div className="flex flex-wrap items-start gap-5">
          <section aria-label="Cobros del mes" className="min-w-0 flex-[2_1_480px] overflow-hidden rounded-2xl bg-white">
            {cobros.length === 0 ? (
              <p className="p-5 text-sm text-gris">
                {contratosActivos
                  ? "No hay cobros en este mes."
                  : "Aún no hay contratos. Agrega inquilinos con su contrato en Personas y aquí aparecerá cada renta del mes."}{" "}
                {!contratosActivos && (
                  <Link href="/personas?ver=inquilinos" className="font-semibold text-verde underline">
                    Agregar inquilino
                  </Link>
                )}
              </p>
            ) : (
              <ul className="divide-y divide-borde-suave">
                {cobros.map((c) => {
                  const inq = c.contratos?.inquilinos;
                  const prop = c.contratos?.propiedades;
                  const linkPago = `${base}/p/${c.token}`;
                  const abierto = c.estado === "pendiente" || c.estado === "vencido";
                  return (
                    <li key={c.id} className="flex flex-col gap-3 px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold">{prop?.nombre}</p>
                          <p className="text-sm text-gris">
                            {inq ? (
                              <Link href={`/personas/inquilinos/${inq.id}`} className="hover:underline">
                                {inq.nombre}
                              </Link>
                            ) : (
                              "—"
                            )}
                            {" · "}
                            {c.pagado_at ? `pagó ${formatoFecha(c.pagado_at)}` : `vence ${formatoFecha(c.vence)}`}
                            {c.metodo && c.estado === "pagado" ? ` · ${METODOS.find(([v]) => v === c.metodo)?.[1] ?? ""}` : ""}
                          </p>
                          {c.nota && <p className="text-xs text-gris">Nota: {c.nota}</p>}
                        </div>
                        <div className="flex flex-none items-center gap-2">
                          <span className="text-right font-mono">
                            {pesos.format(total(c))}
                            {Number(c.recargo) > 0 && <span className="block text-xs text-naranja-oscuro">incl. recargo {pesos.format(c.recargo)}</span>}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ESTADO[c.estado].clase}`}>{ESTADO[c.estado].texto}</span>
                        </div>
                      </div>

                      {c.estado === "por_confirmar" && (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#E8EEFB] p-3">
                          {c.comprobante_path && url.get(c.comprobante_path) && (
                            <a href={url.get(c.comprobante_path)!} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded-xl bg-white px-3 text-xs font-bold">
                              Ver comprobante
                            </a>
                          )}
                          <form action={registrarPago}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="metodo" value="spei" />
                            <Boton enviando="…" className="min-h-10 text-xs">
                              Confirmar pago
                            </Boton>
                          </form>
                          <form action={rechazarComprobante}>
                            <input type="hidden" name="id" value={c.id} />
                            <Boton estilo="peligro" enviando="…" className="min-h-10 text-xs">
                              No es válido
                            </Boton>
                          </form>
                        </div>
                      )}

                      {abierto && (
                        <div className="flex flex-wrap items-center gap-2">
                          {inq?.telefono && (
                            <a
                              href={linkWhatsApp(
                                inq.telefono,
                                c.estado === "vencido"
                                  ? plantillas.cobranza(inq.nombre, prop?.nombre ?? "tu casa", pesos.format(total(c)), linkPago)
                                  : plantillas.avisoRenta(inq.nombre, prop?.nombre ?? "tu casa", pesos.format(total(c)), formatoFecha(c.vence), linkPago),
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="flex min-h-10 items-center rounded-xl border border-borde px-3 text-xs font-bold hover:border-verde"
                            >
                              {c.estado === "vencido" ? "Recordar pago" : "Mandar aviso"}
                            </a>
                          )}
                          <details className="group">
                            <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-xl bg-verde px-3 text-xs font-bold text-white">Registrar pago</summary>
                            <form action={registrarPago} className="mt-2 flex flex-wrap items-end gap-2">
                              <input type="hidden" name="id" value={c.id} />
                              <select name="metodo" aria-label="Método" className={campo} defaultValue="spei">
                                {METODOS.map(([v, t]) => (
                                  <option key={v} value={v}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                              <input type="date" name="fecha" aria-label="Fecha de pago" defaultValue={hoy} className={campo} />
                              <Boton enviando="Guardando…" className="min-h-11 text-xs">
                                Guardar
                              </Boton>
                            </form>
                          </details>
                          <details>
                            <summary className="flex min-h-10 cursor-pointer list-none items-center px-2 text-xs font-semibold text-gris underline">Condonar</summary>
                            <form action={condonar} className="mt-2 flex flex-wrap gap-2">
                              <input type="hidden" name="id" value={c.id} />
                              <input name="nota" placeholder="Motivo (opcional)" aria-label="Motivo" className={campo} />
                              <Boton estilo="claro" enviando="…" className="min-h-11 text-xs">
                                Condonar renta
                              </Boton>
                            </form>
                          </details>
                        </div>
                      )}

                      {(c.estado === "pagado" || c.estado === "condonado") && (
                        <form action={deshacerPago}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="text-xs font-semibold text-gris underline">
                            Deshacer
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Datos para depositar" className="flex flex-[1_1_280px] flex-col gap-3 rounded-2xl bg-white p-5">
            <h2 className="font-bold">Datos para depositar</h2>
            <p className="text-sm text-gris">Los ve el inquilino en su link de pago, junto con el botón para subir su comprobante.</p>
            <form action={guardarDatosPago} className="flex flex-col gap-2">
              <textarea
                name="datos_pago"
                rows={4}
                maxLength={500}
                defaultValue={o?.datos_pago ?? ""}
                placeholder={"Banco: BBVA\nCLABE: 012 180 0000 0000 0000\nA nombre de: Administraciones Jurica"}
                aria-label="Datos para depositar"
                className={`${campo} py-2.5 font-mono`}
              />
              <Boton estilo="claro" className="self-start">
                Guardar
              </Boton>
            </form>
          </section>
        </div>

        <section id="servicios" aria-label="Servicios del mes" className="overflow-hidden rounded-2xl bg-white">
          <h2 className="px-5 pt-5 font-bold">Servicios del mes</h2>
          {recibos.length === 0 ? (
            <p className="p-5 text-sm text-gris">Sin recibos este mes. Da de alta luz, agua, predial o cuota en la ficha de cada propiedad.</p>
          ) : (
            <ul className="mt-2 divide-y divide-borde-suave">
              {recibos.map((r) => {
                const s = r.servicios;
                return (
                  <li key={r.id} className="flex flex-col gap-2 px-5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 text-sm">
                        <p className="font-bold">
                          {etiqueta(TIPOS_SERVICIO, s?.tipo)} · {s?.propiedades?.nombre}
                        </p>
                        <p className="text-gris">
                          Paga: {etiqueta(QUIEN_PAGA, s?.quien_paga)}
                          {s?.compania ? ` · ${s.compania}` : ""}
                          {s?.numero_servicio ? ` · No. ${s.numero_servicio}` : ""}
                          {" · "}
                          {r.pagado_at ? `pagado ${formatoFecha(r.pagado_at)}` : `vence ${formatoFecha(r.vence)}`}
                        </p>
                      </div>
                      <span className="flex flex-none items-center gap-2">
                        {r.monto != null && <span className="font-mono">{pesos.format(r.monto)}</span>}
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ESTADO[r.estado].clase}`}>{r.estado === "pagado" ? "Pagado" : ESTADO[r.estado].texto}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.comprobante_path && url.get(r.comprobante_path) && (
                        <a href={url.get(r.comprobante_path)!} target="_blank" rel="noreferrer" className="text-xs font-semibold text-verde underline">
                          Ver comprobante
                        </a>
                      )}
                      {r.estado === "pagado" ? (
                        <form action={deshacerRecibo}>
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="text-xs font-semibold text-gris underline">
                            Deshacer
                          </button>
                        </form>
                      ) : (
                        <details>
                          <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-xl bg-verde px-3 text-xs font-bold text-white">Marcar pagado</summary>
                          <form action={pagarRecibo} className="mt-2 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="id" value={r.id} />
                            <input name="monto" inputMode="decimal" placeholder="Monto" aria-label="Monto del recibo" className={campo} />
                            <InputComprimido name="comprobante" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" className="text-xs" />
                            <Boton enviando="Guardando…" className="min-h-11 text-xs">
                              Guardar
                            </Boton>
                          </form>
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function Cifra({ titulo, valor, nota, verde, alerta }: { titulo: string; valor: string; nota?: string; verde?: boolean; alerta?: boolean }) {
  return (
    <li className={`flex flex-col gap-1 rounded-2xl p-4 ${alerta ? "bg-naranja-claro" : "bg-white"}`}>
      <span className="text-sm text-gris">{titulo}</span>
      <span className={`font-mono text-2xl font-bold ${verde ? "text-verde-oscuro" : alerta ? "text-naranja-oscuro" : ""}`}>{valor}</span>
      {nota && <span className="text-xs text-gris">{nota}</span>}
    </li>
  );
}
