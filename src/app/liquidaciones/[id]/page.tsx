import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { InputComprimido } from "@/components/InputComprimido";
import { Cargando, Menu } from "@/components/Menu";
import { campo } from "@/components/Seguimiento";
import { formatoClabe } from "@/lib/clabe";
import { hoyMX, plantillas } from "@/lib/crm";
import { BUCKET, formatoFecha, linkWhatsApp, origen, pesos } from "@/lib/util";
import { armarReporte, inicioDeMes, mesAnterior, mesTexto, periodoALiquidar, siguienteMes } from "@/lib/reporte";
import { sesionConOrg } from "@/lib/sesion";
import { agregarMovimiento, borrarMovimiento, deshacerLiquidacion, marcarLiquidada } from "../actions";
import { Copiar, FormBanco } from "./Copiar";

export const metadata: Metadata = { title: "Liquidación · Black Key" };

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> };

export default function Liquidacion(props: Params) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido {...props} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: Params) {
  const { supabase, org, user } = await sesionConOrg();
  const { id } = await params;
  const { mes } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const hoy = hoyMX();
  const periodo = mes && /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : periodoALiquidar(hoy);

  const { data: d } = await supabase.from("duenos").select("id, nombre, telefono, banco, clabe, comision_pct, propiedades(id, nombre)").eq("id", id).maybeSingle();
  if (!d) notFound();
  const dueno = d as { id: string; nombre: string; telefono: string | null; banco: string | null; clabe: string | null; comision_pct: number | null; propiedades: { id: string; nombre: string }[] };
  await supabase.rpc("actualizar_cobros", { org: org.id });
  const rep = (await armarReporte(supabase, dueno.id, periodo))!;
  const [{ data: yo }, { data: reporte }] = await Promise.all([
    supabase.from("miembros").select("rol").eq("organizacion_id", org.id).eq("user_id", user.id).maybeSingle(),
    supabase.from("reportes_dueno").select("token").eq("dueno_id", dueno.id).eq("periodo", periodo).maybeSingle(),
  ]);
  const admin = yo?.rol === "propietario" || yo?.rol === "admin";
  const t = rep.totales;
  const liq = rep.liquidacion;
  const mesTxt = mesTexto(periodo);
  const link = reporte ? `${await origen()}/e/${reporte.token}` : null;
  const comprobante = liq?.comprobante_path ? (await supabase.storage.from(BUCKET).createSignedUrl(liq.comprobante_path, 3600)).data?.signedUrl : null;
  const falta = t.rentaEsperada - t.rentaCobrada;
  const cobradas = rep.cobros.filter((c) => c.estado === "pagado");
  const mantenimiento = rep.resueltos.filter((x) => x.quien_paga === "dueno" && x.monto);
  const q = (p: string) => `/liquidaciones/${dueno.id}?mes=${p.slice(0, 7)}`;
  const datosTransferencia = [dueno.nombre, dueno.banco, dueno.clabe ? `CLABE ${dueno.clabe}` : null, `Monto ${pesos.format(Math.max(t.saldo, 0))}`, `Concepto: Liquidación ${mesTxt}`].filter(Boolean).join("\n");

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Liquidaciones" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <Link href={`/liquidaciones?mes=${periodo.slice(0, 7)}`} className="text-sm font-semibold text-verde">
          ‹ Liquidaciones
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris first-letter:uppercase">Liquidación de {mesTxt}</p>
            <h1 className="font-display text-4xl font-bold tracking-tight">{dueno.nombre}</h1>
          </div>
          <nav aria-label="Mes" className="flex gap-2">
            <Link href={q(mesAnterior(periodo))} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold">
              ‹ Anterior
            </Link>
            {periodo < inicioDeMes(hoy) && (
              <Link href={q(siguienteMes(periodo))} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold">
                Siguiente ›
              </Link>
            )}
          </nav>
        </header>

        <section aria-label="Cuentas del mes" className="flex flex-col gap-1 rounded-2xl bg-white p-5 text-sm">
          <Linea texto="Renta cobrada" valor={t.rentaCobrada} />
          <Linea texto={`Comisión de administración${dueno.comision_pct ? ` (${Number(dueno.comision_pct)}%)` : ""}`} valor={-t.comision} />
          <Linea texto="Mantenimiento pagado por el dueño" valor={-t.gastos} />
          {t.cargos > 0 && <Linea texto="Otros cargos" valor={-t.cargos} />}
          {t.abonos > 0 && <Linea texto="Abonos" valor={t.abonos} />}
          <div className="mt-2 flex items-center justify-between border-t border-borde pt-3">
            <span className="font-display text-lg font-bold">{t.saldo < 0 ? "El dueño debe cubrir" : "A transferir"}</span>
            <span className="font-display text-2xl font-bold">{pesos.format(Math.abs(liq?.total ?? t.saldo))}</span>
          </div>
          {!dueno.comision_pct && (
            <p className="mt-1 text-xs text-gris">
              Este dueño no tiene comisión registrada.{" "}
              <Link href={`/personas/duenos/${dueno.id}`} className="font-semibold text-verde underline">
                Ponla en su ficha
              </Link>
              .
            </p>
          )}
          {falta > 0 && !liq && <p className="mt-2 rounded-xl bg-[#FFF4E0] p-3 text-[#7A4E00]">Faltan {pesos.format(falta)} de renta por cobrar este mes. Si la liquidas ahora, no se incluyen.</p>}
          {liq && Math.abs(liq.total - t.saldo) > 0.009 && (
            <p className="mt-2 rounded-xl bg-[#FFF4E0] p-3 text-[#7A4E00]">Desde que se liquidó cambiaron las cuentas (hoy darían {pesos.format(t.saldo)}). Deshaz y vuelve a liquidar si hace falta.</p>
          )}
        </section>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-5">
            <section aria-label="Rentas cobradas" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Rentas cobradas</h2>
              {cobradas.length === 0 ? (
                <p className="text-sm text-gris">Sin rentas cobradas este mes.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-borde-suave text-sm">
                  {cobradas.map((c, i) => (
                    <li key={i} className="flex justify-between gap-3 py-2">
                      <span>
                        <span className="block font-semibold">{c.propiedad}</span>
                        <span className="text-xs text-gris">
                          {c.inquilino ?? ""} · pagó {formatoFecha(c.pagado_at)}
                        </span>
                      </span>
                      <span className="font-mono">{pesos.format(c.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Mantenimiento" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Mantenimiento pagado por el dueño</h2>
              {mantenimiento.length === 0 ? (
                <p className="text-sm text-gris">Sin trabajos con cargo al dueño este mes.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-borde-suave text-sm">
                  {mantenimiento.map((x) => (
                    <li key={x.id} className="flex justify-between gap-3 py-2">
                      <Link href={`/tickets/${x.id}`} className="hover:underline">
                        <span className="block font-semibold">
                          #{x.folio} {x.titulo}
                        </span>
                        <span className="text-xs text-gris">
                          {x.propiedad}
                          {x.proveedor ? ` · ${x.proveedor}` : ""}
                        </span>
                      </Link>
                      <span className="font-mono">−{pesos.format(Number(x.monto))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Cargos y abonos" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Cargos y abonos</h2>
              <p className="text-sm text-gris">Lo que no pasó por un ticket: predial que pagaste por él, una compra, un depósito que le regresas…</p>
              {rep.movimientos.length > 0 && (
                <ul className="flex flex-col divide-y divide-borde-suave text-sm">
                  {rep.movimientos.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        <span className="block font-semibold">{m.concepto}</span>
                        <span className="text-xs text-gris">
                          {m.tipo === "cargo" ? "Cargo" : "Abono"}
                          {m.propiedad ? ` · ${m.propiedad}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono">
                          {m.tipo === "cargo" ? "−" : "+"}
                          {pesos.format(m.monto)}
                        </span>
                        {!liq && (
                          <form action={borrarMovimiento}>
                            <input type="hidden" name="id" value={m.id} />
                            <Boton estilo="claro" enviando="…" className="min-h-9 px-2 text-xs">
                              Quitar
                            </Boton>
                          </form>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!liq && (
                <form action={agregarMovimiento} className="grid gap-2 sm:grid-cols-[auto_1fr_8rem]">
                  <input type="hidden" name="dueno_id" value={dueno.id} />
                  <input type="hidden" name="periodo" value={periodo} />
                  <select name="tipo" aria-label="Tipo de movimiento" className={campo}>
                    <option value="cargo">Cargo (se descuenta)</option>
                    <option value="abono">Abono (se suma)</option>
                  </select>
                  <input name="concepto" required maxLength={160} placeholder="Predial 2026 Casa 8" aria-label="Concepto" className={campo} />
                  <input name="monto" required inputMode="decimal" placeholder="$0" aria-label="Monto" className={campo} />
                  {dueno.propiedades.length > 1 && (
                    <select name="propiedad_id" aria-label="Propiedad" className={`${campo} sm:col-span-2`}>
                      <option value="">Todas sus propiedades</option>
                      {dueno.propiedades.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                  <Boton estilo="claro" className="self-start">
                    Agregar
                  </Boton>
                </form>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <section aria-label="Transferencia" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Transferencia</h2>
              {liq ? (
                <>
                  <p className="rounded-xl bg-verde-claro p-3 text-sm text-verde-oscuro">
                    ✓ Transferida el {formatoFecha(liq.pagada_el)}
                    {liq.referencia ? ` · ref. ${liq.referencia}` : ""}
                  </p>
                  {comprobante && (
                    <a href={comprobante} target="_blank" rel="noreferrer" className="text-sm font-semibold text-verde underline">
                      Ver comprobante
                    </a>
                  )}
                  {link && (
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={linkWhatsApp(dueno.telefono, plantillas.liquidacion(dueno.nombre, mesTxt, pesos.format(liq.total), link))}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-11 items-center rounded-xl bg-verde px-4 text-sm font-bold text-white"
                      >
                        Avisar al dueño por WhatsApp
                      </a>
                      <a href={`${link}?vista=admin`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-xl border border-borde px-4 text-sm font-bold">
                        Ver lo que ve el dueño
                      </a>
                    </div>
                  )}
                  {admin && (
                    <form action={deshacerLiquidacion}>
                      <input type="hidden" name="dueno_id" value={dueno.id} />
                      <input type="hidden" name="periodo" value={periodo} />
                      <Boton estilo="peligro" enviando="Deshaciendo…">
                        Deshacer liquidación
                      </Boton>
                    </form>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1 rounded-xl bg-fondo p-3 text-sm">
                    <span className="font-semibold">{dueno.nombre}</span>
                    <span>{dueno.banco ?? <span className="text-gris">Sin banco</span>}</span>
                    <span className="font-mono">{dueno.clabe ? formatoClabe(dueno.clabe) : <span className="font-sans text-gris">Sin CLABE</span>}</span>
                    <Copiar texto={datosTransferencia} />
                  </div>
                  <form action={marcarLiquidada} className="flex flex-col gap-2">
                    <input type="hidden" name="dueno_id" value={dueno.id} />
                    <input type="hidden" name="periodo" value={periodo} />
                    <label className="flex flex-col gap-1 text-sm font-semibold">
                      Fecha de la transferencia
                      <input type="date" name="pagada_el" required defaultValue={hoy} className={campo} />
                    </label>
                    <input name="referencia" maxLength={80} placeholder="Referencia o folio (opcional)" aria-label="Referencia" className={campo} />
                    <label className="flex flex-col gap-1 text-sm font-semibold">
                      Comprobante (opcional)
                      <InputComprimido name="comprobante" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" className="text-sm font-normal" />
                    </label>
                    <Boton enviando="Guardando…">{t.saldo > 0 ? `Marcar ${pesos.format(t.saldo)} como transferido` : "Cerrar la liquidación del mes"}</Boton>
                  </form>
                </>
              )}
            </section>

            <section aria-label="Datos bancarios" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
              <details>
                <summary className="cursor-pointer font-bold">Datos bancarios del dueño</summary>
                <FormBanco duenoId={dueno.id} banco={dueno.banco ?? ""} clabe={dueno.clabe ?? ""} />
              </details>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function Linea({ texto, valor }: { texto: string; valor: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className={valor < 0 ? "text-gris" : ""}>{texto}</span>
      <span className="font-mono">{valor < 0 ? `−${pesos.format(-valor)}` : pesos.format(valor)}</span>
    </div>
  );
}
