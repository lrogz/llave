import { randomUUID } from "node:crypto";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Boton } from "@/components/Boton";
import { BotonCopiar } from "@/components/BotonCopiar";
import { ReporteCondominio, type Resumen as TipoResumen } from "@/components/ReporteCondominio";
import { BUCKET } from "@/lib/datos";
import { linkWhatsApp } from "@/lib/util";
import { CATEGORIAS_DOCUMENTO, CATEGORIAS_GASTO, CONCEPTOS, TIPOS_TABLERO, cuando, dinero, etiquetaDe, mesTexto, vigencia } from "@/lib/condominios-datos";
import {
  agregarResidente,
  ajustarSaldo,
  atenderAlerta,
  cerrarVotacion,
  conciliar,
  crearVotacion,
  editarDocumento,
  guardarAcuerdo,
  guardarAsamblea,
  guardarPunto,
  guardarRelevadores,
  guardarVehiculoAdmin,
  guardarVetado,
  importarBanco,
  ocultarPublicacion,
  subirDocumento,
  cargarCuota,
  crearViviendas,
  crearZona,
  decidirAlta,
  editarCondominio,
  estadoResidente,
  guardarAmenidad,
  guardarGuardia,
  guardarPermisos,
  importarPadron,
  publicarAviso,
  registrarGasto,
  registrarPago,
  renovarLink,
  revisarAcceso,
  revisarMudanza,
  revisarPago,
  revisarReserva,
} from "../actions";

export type Ctx = {
  supabase: SupabaseClient;
  c: {
    id: string;
    organizacion_id: string;
    propiedad_id: string;
    nombre: string;
    direccion: string | null;
    datos_pago: string | null;
    foto_path: string | null;
    caseta_token: string;
    comite_token: string;
    alta_token: string;
    timbre_token: string;
    kiosco_token: string;
    lpr_token: string;
    pluma_url: string | null;
    paquetes_url: string | null;
    lpr_abre_visitas: boolean;
    comite_exporta: boolean;
    recibo_serie: string;
  };
  q: Record<string, string | undefined>;
  base: string;
  hoy: string;
  email: string;
};

const CAJA = "flex flex-col gap-3 rounded-2xl bg-white p-5";
const CAMPO = "min-h-11 w-full rounded-xl border border-borde bg-white px-3 text-sm";
const H2 = "font-display text-xl font-bold";
const Oculto = ({ c }: { c: Ctx["c"] }) => <input type="hidden" name="condominio_id" value={c.id} />;
const Aviso = ({ children }: { children: React.ReactNode }) => <p className="rounded-xl bg-verde-claro px-4 py-3 text-sm text-verde-oscuro">{children}</p>;
const Vacio = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-gris">{children}</p>;
const Etiqueta = ({ texto, children }: { texto: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-sm font-semibold">
    {texto}
    {children}
  </label>
);

async function firmar(supabase: SupabaseClient, rutas: (string | null | undefined)[]) {
  const r = [...new Set(rutas.filter((x): x is string => !!x))];
  if (!r.length) return new Map<string, string>();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(r, 3600);
  return new Map((data ?? []).filter((f) => f.signedUrl && f.path).map((f) => [f.path as string, f.signedUrl as string]));
}

type Viv = { id: string; numero: string; zona_id: string | null };
async function viviendasDe(ctx: Ctx) {
  const { data } = await ctx.supabase.from("viviendas").select("id, numero, zona_id").eq("condominio_id", ctx.c.id).order("numero");
  // Orden natural: Casa 2 antes que Casa 10.
  return ((data ?? []) as Viv[]).sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }));
}
function SelectVivienda({ viviendas, name = "vivienda_id" }: { viviendas: Viv[]; name?: string }) {
  return (
    <select name={name} required className={CAMPO} defaultValue="">
      <option value="" disabled>
        Vivienda
      </option>
      {viviendas.map((v) => (
        <option key={v.id} value={v.id}>
          {v.numero}
        </option>
      ))}
    </select>
  );
}

// ─────────────────────────── Resumen ───────────────────────────
export async function Resumen({ ctx }: { ctx: Ctx }) {
  const { supabase, c, hoy } = ctx;
  const [rep, pagos, altas, tickets, reservas, mudanzas, manuales, alertas] = await Promise.all([
    supabase.rpc("reporte_condominio", { p_condominio: c.id, p_mes: hoy }),
    supabase.from("pagos_condominio").select("id", { count: "exact", head: true }).eq("condominio_id", c.id).eq("estado", "pendiente"),
    supabase.from("solicitudes_alta").select("id", { count: "exact", head: true }).eq("condominio_id", c.id).eq("estado", "pendiente"),
    supabase.from("tickets").select("id, folio, titulo, estado, sensible, responsable, fecha_compromiso, created_at, viviendas(numero)").eq("condominio_id", c.id).not("estado", "in", "(resuelto,cancelado)").order("created_at", { ascending: false }).limit(15),
    supabase.from("reservas").select("id", { count: "exact", head: true }).eq("condominio_id", c.id).eq("estado", "solicitada"),
    supabase.from("mudanzas").select("id", { count: "exact", head: true }).eq("condominio_id", c.id).eq("estado", "solicitada"),
    supabase.from("accesos").select("id", { count: "exact", head: true }).eq("condominio_id", c.id).eq("revision", "pendiente"),
    supabase.from("alertas_condominio").select("id", { count: "exact", head: true }).eq("condominio_id", c.id).is("atendida_at", null),
  ]);
  const r = rep.data as TipoResumen | null;
  const pend: [number, string, string][] = [
    [alertas.count ?? 0, "alertas de seguridad", "seguridad"],
    [pagos.count ?? 0, "pagos por revisar", "cuotas"],
    [altas.count ?? 0, "altas de residentes por revisar", "viviendas"],
    [(reservas.count ?? 0) + (mudanzas.count ?? 0), "reservas o mudanzas por aprobar", "amenidades"],
    [manuales.count ?? 0, "accesos manuales por revisar", "accesos"],
  ];
  return (
    <>
      {r && <ReporteCondominio r={r} compacto />}
      <section className={CAJA}>
        <h2 className={H2}>Por atender</h2>
        <ul className="flex flex-wrap gap-2">
          {pend.map(([n, t, v]) => (
            <li key={t}>
              <Link href={`/condominios/${c.id}?vista=${v}`} className={`flex min-h-11 items-center rounded-full px-4 text-sm font-bold ${n ? "bg-naranja-claro text-naranja-oscuro" : "bg-fondo text-gris"}`}>
                {n} {t}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className={CAJA}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={H2}>Reportes de vecinos abiertos</h2>
          <Link href={`/propiedades/${c.propiedad_id}`} className="text-sm font-bold text-verde underline">
            Áreas comunes y mantenimiento ›
          </Link>
        </div>
        {tickets.data?.length ? (
          <ul className="divide-y divide-borde-suave text-sm">
            {tickets.data.map((t) => (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <b>
                      #{t.folio} {t.titulo}
                    </b>
                    {t.sensible && <span className="ml-2 rounded-full bg-naranja-claro px-2 py-0.5 text-xs text-naranja-oscuro">Privada</span>}
                    <span className="block text-gris">
                      {(t.viviendas as unknown as { numero: string } | null)?.numero ?? "Áreas comunes"} · {cuando(t.created_at)}
                      {t.responsable ? ` · ${t.responsable}` : " · sin responsable"}
                    </span>
                  </span>
                  <span className="text-gris">›</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Vacio>Sin reportes abiertos. Llegan desde el portal de residentes y se trabajan como cualquier ticket: cotizaciones, proveedores y aprobación.</Vacio>
        )}
      </section>
    </>
  );
}

// ─────────────────────────── Viviendas y residentes ───────────────────────────
type Residente = { id: string; vivienda_id: string; nombre: string; telefono: string | null; tipo: string; permisos: Record<string, boolean>; token: string; activo: boolean };

export async function Viviendas({ ctx }: { ctx: Ctx }) {
  const { supabase, c, q, base } = ctx;
  const [viviendas, { data: zonas }, { data: res }, { data: saldos }, { data: altas }] = await Promise.all([
    viviendasDe(ctx),
    supabase.from("zonas_condominio").select("id, nombre, tipo").eq("condominio_id", c.id).order("nombre"),
    supabase.from("residentes").select("id, vivienda_id, nombre, telefono, tipo, permisos, token, activo").eq("condominio_id", c.id).order("created_at"),
    supabase.from("saldos_vivienda").select("vivienda_id, saldo_centavos").eq("condominio_id", c.id),
    supabase.from("solicitudes_alta").select("id, vivienda_id, nombre, telefono, tipo, ine_frente_path, ine_reverso_path, selfie_path, revision_manual, created_at").eq("condominio_id", c.id).eq("estado", "pendiente").order("created_at"),
  ]);
  const residentes = (res ?? []) as Residente[];
  const saldo = new Map((saldos ?? []).map((s) => [s.vivienda_id, Number(s.saldo_centavos)]));
  const zona = new Map((zonas ?? []).map((z) => [z.id, z.nombre]));
  const fotos = await firmar(supabase, (altas ?? []).flatMap((a) => [a.ine_frente_path, a.ine_reverso_path, a.selfie_path]));
  const numero = new Map(viviendas.map((v) => [v.id, v.numero]));
  const buscar = (q.buscar ?? "").toLowerCase();
  const lista = viviendas.filter((v) => !buscar || v.numero.toLowerCase().includes(buscar) || residentes.some((r) => r.vivienda_id === v.id && r.nombre.toLowerCase().includes(buscar)));

  return (
    <>
      {q.importado && <Aviso>Importamos {q.importado} renglones del padrón.</Aviso>}
      {altas?.length ? (
        <section className={CAJA}>
          <h2 className={H2}>Altas por revisar ({altas.length})</h2>
          <p className="text-sm text-gris">Compara la foto de la INE con la selfie y que el nombre corresponda a la vivienda. Al decidir, las imágenes se borran.</p>
          {altas.map((a) => (
            <article key={a.id} className="flex flex-col gap-3 rounded-xl border border-borde-suave p-4">
              <p className="text-sm">
                <b>{a.nombre}</b> · {numero.get(a.vivienda_id)} · {a.tipo} · {a.telefono} · {cuando(a.created_at)}
                {a.revision_manual && <span className="ml-2 rounded-full bg-[#FFF4E0] px-2 py-0.5 text-xs text-[#7A4E00]">Pidió revisión manual (sin selfie)</span>}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  [a.ine_frente_path, "INE frente"],
                  [a.ine_reverso_path, "INE reverso"],
                  [a.selfie_path, "Selfie"],
                ].map(([p, t]) =>
                  p && fotos.get(p) ? (
                    <a key={t} href={fotos.get(p)} target="_blank" rel="noopener" className="flex flex-col gap-1 text-xs text-gris">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fotos.get(p)} alt={t ?? ""} className="aspect-[4/3] w-full rounded-lg bg-fondo object-cover" />
                      {t}
                    </a>
                  ) : (
                    <span key={t} className="flex aspect-[4/3] items-center justify-center rounded-lg bg-fondo text-xs text-gris">
                      Sin {t?.toLowerCase()}
                    </span>
                  ),
                )}
              </div>
              <form action={decidirAlta} className="flex flex-wrap gap-2">
                <Oculto c={c} />
                <input type="hidden" name="solicitud_id" value={a.id} />
                <input name="nota" placeholder="Nota (motivo si rechazas)" className={`${CAMPO} max-w-xs flex-1`} aria-label="Nota" />
                <Boton name="decision" value="aprobar" enviando="Aprobando…">
                  Aprobar
                </Boton>
                <Boton name="decision" value="rechazar" estilo="peligro" enviando="…">
                  Rechazar
                </Boton>
              </form>
            </article>
          ))}
        </section>
      ) : null}

      <section className={CAJA}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={H2}>
            {viviendas.length} viviendas · {residentes.filter((r) => r.activo).length} residentes
          </h2>
          <form className="flex gap-2">
            <input type="hidden" name="vista" value="viviendas" />
            <input name="buscar" defaultValue={q.buscar} placeholder="Buscar vivienda o nombre" className={CAMPO} aria-label="Buscar" />
            <button className="min-h-11 rounded-xl border border-borde px-4 text-sm font-bold">Buscar</button>
          </form>
        </div>
        <ul className="divide-y divide-borde-suave">
          {lista.map((v) => {
            const rs = residentes.filter((r) => r.vivienda_id === v.id);
            const s = saldo.get(v.id) ?? 0;
            const abierta = rs.some((r) => r.id === q.nuevo) || (buscar && lista.length < 6);
            return (
              <li key={v.id}>
                <details open={!!abierta}>
                  <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <b>{v.numero}</b>
                      {v.zona_id && <span className="text-gris"> · {zona.get(v.zona_id)}</span>}
                      <span className="text-gris"> · {rs.length ? rs.map((r) => r.nombre).join(", ") : "sin residentes"}</span>
                    </span>
                    <span className={`font-semibold tabular-nums ${s > 0 ? "text-naranja-oscuro" : "text-verde-oscuro"}`}>{s > 0 ? `Debe ${dinero(s)}` : s < 0 ? `A favor ${dinero(-s)}` : "Al corriente"}</span>
                  </summary>
                  <div className="flex flex-col gap-3 pb-4">
                    {rs.map((r) => {
                      const link = `${base}/vecino/${r.token}`;
                      const permisos = r.permisos ?? {};
                      const por = (k: string) => permisos[k] ?? (r.tipo === "propietario" || k === "pases" || k === "reportes");
                      return (
                        <div key={r.id} id={`r-${r.id}`} className={`flex flex-col gap-2 rounded-xl border p-3 ${r.id === q.nuevo ? "border-menta" : "border-borde-suave"} ${r.activo ? "" : "opacity-60"}`}>
                          <p className="text-sm">
                            <b>{r.nombre}</b> · {r.tipo}
                            {r.telefono ? ` · ${r.telefono}` : ""}
                            {!r.activo && " · inactivo"}
                          </p>
                          {r.activo && (
                            <div className="flex flex-wrap gap-2">
                              <a
                                href={linkWhatsApp(r.telefono, `Hola ${r.nombre.split(" ")[0]}, este es tu acceso a ${c.nombre}: pases QR para tus visitas, estado de cuenta, reportes y chat con caseta. Es personal, no lo compartas: ${link}`)}
                                target="_blank"
                                rel="noopener"
                                className="flex min-h-11 items-center rounded-xl bg-verde px-4 text-sm font-bold text-white"
                              >
                                Mandar su link por WhatsApp
                              </a>
                              <BotonCopiar texto={link} etiqueta="Copiar link" />
                            </div>
                          )}
                          <form action={guardarPermisos} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                            <Oculto c={c} />
                            <input type="hidden" name="residente_id" value={r.id} />
                            <select name="tipo" defaultValue={r.tipo} className="min-h-10 rounded-lg border border-borde px-2" aria-label="Tipo">
                              <option value="propietario">Propietario</option>
                              <option value="inquilino">Inquilino</option>
                            </select>
                            {[
                              ["pases", "Pases"],
                              ["reportes", "Reportes"],
                              ["ver_cuenta", "Ver cuenta"],
                              ["registrar_pagos", "Registrar pagos"],
                            ].map(([k, t]) => (
                              <label key={k} className="flex items-center gap-1.5">
                                <input type="checkbox" name={k} defaultChecked={por(k)} className="size-4 accent-verde" />
                                {t}
                              </label>
                            ))}
                            <Boton estilo="claro" className="min-h-10!">
                              Guardar
                            </Boton>
                          </form>
                          <form action={estadoResidente} className="flex flex-wrap gap-2">
                            <Oculto c={c} />
                            <input type="hidden" name="residente_id" value={r.id} />
                            <Boton name="accion" value="renovar" estilo="claro" className="min-h-10! text-xs!" enviando="…">
                              Cambiar link (si se compartió)
                            </Boton>
                            <Boton name="accion" value={r.activo ? "desactivar" : "activar"} estilo={r.activo ? "peligro" : "claro"} className="min-h-10! text-xs!" enviando="…">
                              {r.activo ? "Dar de baja" : "Reactivar"}
                            </Boton>
                          </form>
                        </div>
                      );
                    })}
                    <form action={agregarResidente} className="grid gap-2 rounded-xl bg-fondo p-3 sm:grid-cols-5">
                      <Oculto c={c} />
                      <input type="hidden" name="vivienda_id" value={v.id} />
                      <input name="nombre" required placeholder="Nombre" className={`${CAMPO} sm:col-span-2`} aria-label="Nombre" />
                      <input name="telefono" placeholder="Celular" className={CAMPO} aria-label="Celular" />
                      <select name="tipo" className={CAMPO} aria-label="Tipo">
                        <option value="propietario">Propietario</option>
                        <option value="inquilino">Inquilino</option>
                      </select>
                      <Boton estilo="claro">Agregar residente</Boton>
                    </form>
                  </div>
                </details>
              </li>
            );
          })}
          {!lista.length && <li className="py-4 text-sm text-gris">Sin viviendas. Créalas abajo o importa tu padrón.</li>}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={crearViviendas} className={CAJA}>
          <Oculto c={c} />
          <h2 className={H2}>Agregar viviendas</h2>
          <div className="grid grid-cols-3 gap-2">
            <Etiqueta texto="Prefijo">
              <input name="prefijo" defaultValue="Casa" className={CAMPO} />
            </Etiqueta>
            <Etiqueta texto="Del">
              <input name="desde" type="number" defaultValue={1} min={0} className={CAMPO} />
            </Etiqueta>
            <Etiqueta texto="Al">
              <input name="hasta" type="number" defaultValue={10} min={0} className={CAMPO} />
            </Etiqueta>
          </div>
          <Etiqueta texto="…o una lista (una por renglón)">
            <textarea name="lista" rows={3} placeholder={"A-101\nA-102"} className={`${CAMPO} py-2`} />
          </Etiqueta>
          <select name="zona_id" className={CAMPO} aria-label="Zona" defaultValue="">
            <option value="">Sin zona</option>
            {(zonas ?? []).map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
          <Boton>Agregar</Boton>
        </form>
        <div className="flex flex-col gap-4">
          <form action={crearZona} className={CAJA}>
            <Oculto c={c} />
            <h2 className={H2}>Zonas (calles o torres)</h2>
            <p className="text-sm text-gris">{(zonas ?? []).map((z) => z.nombre).join(" · ") || "Sin zonas aún."}</p>
            <div className="flex gap-2">
              <input name="nombre" required placeholder="Calle Fresno / Torre B" className={CAMPO} aria-label="Nombre de la zona" />
              <select name="tipo" className={`${CAMPO} max-w-32`} aria-label="Tipo de zona">
                <option value="calle">Calle</option>
                <option value="torre">Torre</option>
                <option value="seccion">Sección</option>
              </select>
              <Boton estilo="claro">Agregar</Boton>
            </div>
          </form>
          <form action={importarPadron} className={CAJA}>
            <Oculto c={c} />
            <h2 className={H2}>Importar padrón y saldos iniciales</h2>
            <p className="text-sm text-gris">
              Copia desde Excel y pega. Columnas: <b>vivienda, zona, nombre, celular, tipo, saldo inicial, indiviso %</b> (saldo positivo = debe, negativo = a favor; indiviso opcional, para votaciones ponderadas). Revisa los saldos con la administración anterior antes de cargarlos.
            </p>
            <textarea name="padron" rows={5} required placeholder={"Casa 1\tCalle Encino\tAna Ruiz\t4421234567\tpropietario\t2400"} className={`${CAMPO} py-2 font-mono text-xs`} />
            <Boton enviando="Importando…">Importar</Boton>
          </form>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────── Cuotas, pagos, ajustes y gastos ───────────────────────────
export async function Cuotas({ ctx }: { ctx: Ctx }) {
  const { supabase, c, q, hoy } = ctx;
  const mes = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : hoy.slice(0, 7);
  const [viviendas, { data: zonas }, { data: pendientes }, { data: recientes }, { data: gastos }, { data: proveedores }, { data: cargosMes }] = await Promise.all([
    viviendasDe(ctx),
    supabase.from("zonas_condominio").select("id, nombre").eq("condominio_id", c.id).order("nombre"),
    supabase.from("pagos_condominio").select("id, vivienda_id, monto_centavos, referencia, pagado_el, comprobante_path, registrado_por, created_at").eq("condominio_id", c.id).eq("estado", "pendiente").order("created_at"),
    supabase.from("pagos_condominio").select("id, vivienda_id, monto_centavos, pagado_el, estado, folio_recibo, revisado_por").eq("condominio_id", c.id).neq("estado", "pendiente").order("revisado_at", { ascending: false }).limit(15),
    supabase.from("gastos_condominio").select("id, fecha, categoria, descripcion, monto_centavos, comprobante_path, proveedores(nombre)").eq("condominio_id", c.id).gte("fecha", `${mes}-01`).lte("fecha", `${mes}-31`).order("fecha"),
    supabase.from("proveedores").select("id, nombre").eq("organizacion_id", c.organizacion_id).order("nombre"),
    supabase.from("cargos_condominio").select("concepto, descripcion, monto_centavos").eq("condominio_id", c.id).eq("periodo", `${mes}-01`),
  ]);
  const numero = new Map(viviendas.map((v) => [v.id, v.numero]));
  const fotos = await firmar(supabase, [...(pendientes ?? []).map((p) => p.comprobante_path), ...(gastos ?? []).map((g) => g.comprobante_path)]);
  const resumenCargos = new Map<string, { n: number; total: number }>();
  for (const x of cargosMes ?? []) {
    const k = `${etiquetaDe(CONCEPTOS, x.concepto)}${x.descripcion ? ` · ${x.descripcion}` : ""}`;
    const a = resumenCargos.get(k) ?? { n: 0, total: 0 };
    resumenCargos.set(k, { n: a.n + 1, total: a.total + Number(x.monto_centavos) });
  }

  return (
    <>
      {q.cargados && <Aviso>Se cargaron {q.cargados} cargos. Si repites la carga del mismo concepto y mes, no se duplica.</Aviso>}
      {q.pago && <Aviso>Pago registrado y confirmado con recibo.</Aviso>}
      <section className={CAJA}>
        <h2 className={H2}>Pagos por revisar ({pendientes?.length ?? 0})</h2>
        {pendientes?.length ? (
          <ul className="divide-y divide-borde-suave">
            {pendientes.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 text-sm">
                <p>
                  <b>{numero.get(p.vivienda_id)}</b> · <b>{dinero(p.monto_centavos)}</b> · {p.pagado_el}
                  {p.referencia ? ` · ${p.referencia}` : ""} · {p.registrado_por}
                  {p.comprobante_path && fotos.get(p.comprobante_path) && (
                    <a href={fotos.get(p.comprobante_path)} target="_blank" rel="noopener" className="ml-2 font-bold text-verde underline">
                      Ver comprobante
                    </a>
                  )}
                </p>
                <form action={revisarPago} className="flex flex-wrap gap-2">
                  <Oculto c={c} />
                  <input type="hidden" name="pago_id" value={p.id} />
                  <Boton name="decision" value="confirmar" enviando="Confirmando…">
                    Confirmar y emitir recibo
                  </Boton>
                  <input name="nota" placeholder="Motivo si lo rechazas" className={`${CAMPO} max-w-xs flex-1`} aria-label="Motivo" />
                  <Boton name="decision" value="rechazar" estilo="peligro" enviando="…">
                    Rechazar
                  </Boton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <Vacio>No hay transferencias por revisar.</Vacio>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={cargarCuota} className={CAJA}>
          <Oculto c={c} />
          <h2 className={H2}>Cargar cuota a todas las viviendas</h2>
          <div className="grid grid-cols-2 gap-2">
            <Etiqueta texto="Concepto">
              <select name="concepto" className={CAMPO}>
                {CONCEPTOS.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </Etiqueta>
            <Etiqueta texto="Monto por vivienda">
              <input name="monto" required inputMode="decimal" placeholder="1,200.00" className={CAMPO} />
            </Etiqueta>
            <Etiqueta texto="Mes">
              <input name="periodo" type="month" required defaultValue={mes} className={CAMPO} />
            </Etiqueta>
            <Etiqueta texto="Vence">
              <input name="vence" type="date" className={CAMPO} />
            </Etiqueta>
          </div>
          <Etiqueta texto="Descripción (opcional; p. ej. obra de la cuota extraordinaria)">
            <input name="descripcion" maxLength={120} className={CAMPO} />
          </Etiqueta>
          <select name="zona_id" className={CAMPO} aria-label="A quién" defaultValue="">
            <option value="">Todas las viviendas</option>
            {(zonas ?? []).map((z) => (
              <option key={z.id} value={z.id}>
                Solo {z.nombre}
              </option>
            ))}
          </select>
          <Boton enviando="Cargando…">Cargar cuota</Boton>
          {resumenCargos.size > 0 && (
            <ul className="text-xs text-gris">
              {[...resumenCargos].map(([k, v]) => (
                <li key={k}>
                  {mesTexto(mes)}: {k} · {v.n} viviendas · {dinero(v.total)}
                </li>
              ))}
            </ul>
          )}
        </form>

        <form action={registrarPago} className={CAJA}>
          <Oculto c={c} />
          <input type="hidden" name="clave" value={randomUUID()} />
          <h2 className={H2}>Registrar pago recibido</h2>
          <p className="text-sm text-gris">Para transferencias o depósitos que te llegaron por fuera. Se confirma y emite recibo.</p>
          <SelectVivienda viviendas={viviendas} />
          <div className="grid grid-cols-2 gap-2">
            <input name="monto" required inputMode="decimal" placeholder="Monto" className={CAMPO} aria-label="Monto" />
            <input name="pagado_el" type="date" required defaultValue={hoy} max={hoy} className={CAMPO} aria-label="Fecha" />
          </div>
          <input name="referencia" placeholder="Referencia / clave de rastreo" className={CAMPO} aria-label="Referencia" />
          <Boton enviando="Registrando…">Registrar y emitir recibo</Boton>
        </form>

        <form action={ajustarSaldo} className={CAJA}>
          <Oculto c={c} />
          <h2 className={H2}>Ajuste de saldo</h2>
          <p className="text-sm text-gris">Nunca se edita un saldo: cada ajuste queda con motivo, fecha y quién lo hizo.</p>
          <SelectVivienda viviendas={viviendas} />
          <div className="grid grid-cols-3 gap-2">
            <select name="sentido" className={CAMPO} aria-label="Sentido">
              <option value="debe">Aumenta adeudo</option>
              <option value="favor">A su favor</option>
            </select>
            <select name="tipo" className={CAMPO} aria-label="Tipo">
              <option value="ajuste">Ajuste</option>
              <option value="saldo_inicial">Saldo inicial</option>
            </select>
            <input name="monto" required inputMode="decimal" placeholder="Monto" className={CAMPO} aria-label="Monto" />
          </div>
          <input name="motivo" required minLength={3} maxLength={300} placeholder="Motivo" className={CAMPO} aria-label="Motivo" />
          <Boton estilo="claro">Guardar ajuste</Boton>
        </form>

        <form action={registrarGasto} className={CAJA}>
          <Oculto c={c} />
          <h2 className={H2}>Registrar gasto</h2>
          <div className="grid grid-cols-2 gap-2">
            <select name="categoria" className={CAMPO} aria-label="Categoría">
              {CATEGORIAS_GASTO.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <input name="monto" required inputMode="decimal" placeholder="Monto" className={CAMPO} aria-label="Monto" />
          </div>
          <input name="descripcion" required maxLength={300} placeholder="Concepto" className={CAMPO} aria-label="Concepto" />
          <div className="grid grid-cols-2 gap-2">
            <input name="fecha" type="date" required defaultValue={hoy} className={CAMPO} aria-label="Fecha" />
            <select name="proveedor_id" className={CAMPO} aria-label="Proveedor" defaultValue="">
              <option value="">Proveedor (opcional)</option>
              {(proveedores ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <input name="comprobante" type="file" accept="image/*,application/pdf" className="text-sm" aria-label="Comprobante" />
          <Boton estilo="claro">Guardar gasto</Boton>
        </form>
      </div>

      <section className={CAJA}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={H2}>Gastos de {mesTexto(mes).toLowerCase()}</h2>
          <a href={`/condominios/${c.id}/movimientos?mes=${mes}`} className="flex min-h-11 items-center rounded-xl border border-borde px-4 text-sm font-bold">
            Exportar movimientos (CSV)
          </a>
        </div>
        {gastos?.length ? (
          <ul className="divide-y divide-borde-suave text-sm">
            {gastos.map((g) => (
              <li key={g.id} className="flex justify-between gap-3 py-2">
                <span>
                  {g.fecha.slice(8, 10)}/{g.fecha.slice(5, 7)} · <b>{g.categoria}</b> · {g.descripcion}
                  {(g.proveedores as unknown as { nombre: string } | null)?.nombre ? ` · ${(g.proveedores as unknown as { nombre: string }).nombre}` : ""}
                  {g.comprobante_path && fotos.get(g.comprobante_path) && (
                    <a href={fotos.get(g.comprobante_path)} target="_blank" rel="noopener" className="ml-2 text-verde underline">
                      comprobante
                    </a>
                  )}
                </span>
                <span className="tabular-nums">{dinero(g.monto_centavos)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Vacio>Sin gastos este mes.</Vacio>
        )}
      </section>
      <Conciliacion ctx={ctx} viviendas={viviendas} />
      <section className={CAJA}>
        <h2 className={H2}>Últimas revisiones</h2>
        <ul className="divide-y divide-borde-suave text-sm">
          {(recientes ?? []).map((p) => (
            <li key={p.id} className="flex justify-between gap-3 py-2">
              <span>
                {numero.get(p.vivienda_id)} · {dinero(p.monto_centavos)} · {p.pagado_el}
              </span>
              <span className={p.estado === "confirmado" ? "text-verde-oscuro" : "text-naranja-oscuro"}>{p.estado === "confirmado" ? `Recibo ${c.recibo_serie}-${p.folio_recibo}` : "Rechazado"}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// ─────────────────────────── Accesos ───────────────────────────
export async function Accesos({ ctx }: { ctx: Ctx }) {
  const { supabase, c, q, hoy } = ctx;
  const dia = q.dia && /^\d{4}-\d{2}-\d{2}$/.test(q.dia) ? q.dia : hoy;
  const [{ data: pendientes }, { data: accesos }] = await Promise.all([
    supabase.from("accesos").select("id, tipo, visitante, placa, metodo, autorizo, ocurrio_at, viviendas(numero), guardias(nombre)").eq("condominio_id", c.id).eq("revision", "pendiente").order("ocurrio_at"),
    supabase
      .from("accesos")
      .select("id, tipo, visitante, placa, metodo, autorizo, ocurrio_at, revision, nota_revision, foto_path, viviendas(numero), guardias(nombre)")
      .eq("condominio_id", c.id)
      .gte("ocurrio_at", `${dia}T00:00:00-06:00`)
      .lt("ocurrio_at", `${dia}T23:59:59.999-06:00`)
      .order("ocurrio_at", { ascending: false }),
  ]);
  const viv = (a: { viviendas: unknown }) => (a.viviendas as { numero: string } | null)?.numero ?? "";
  const guardia = (a: { guardias: unknown }) => (a.guardias as { nombre: string } | null)?.nombre ?? "";
  const fotos = await firmar(supabase, (accesos ?? []).map((a) => a.foto_path));
  const METODO: Record<string, string> = { qr: "QR", manual: "Manual", sin_conexion: "Sin conexión", placa: "Placa", timbre: "Timbre", pin: "PIN" };
  return (
    <>
      <section className={CAJA}>
        <h2 className={H2}>Registros manuales por revisar ({pendientes?.length ?? 0})</h2>
        <p className="text-sm text-gris">Entradas sin QR (autorizadas por teléfono o interfón) o capturadas sin conexión. Confirma con la vivienda si hace falta.</p>
        {pendientes?.length ? (
          <ul className="divide-y divide-borde-suave">
            {pendientes.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>
                  {cuando(a.ocurrio_at)} · <b>{a.tipo}</b> · {a.visitante} → {viv(a)} · autorizó {a.autorizo} · {guardia(a)}
                  {a.metodo === "sin_conexion" && <span className="ml-2 rounded-full bg-naranja-claro px-2 py-0.5 text-xs text-naranja-oscuro">Sin conexión</span>}
                </span>
                <form action={revisarAcceso} className="flex gap-2">
                  <Oculto c={c} />
                  <input type="hidden" name="acceso_id" value={a.id} />
                  <input name="nota" placeholder="Nota" className={`${CAMPO} w-40`} aria-label="Nota" />
                  <Boton estilo="claro" className="min-h-10!">
                    Revisado
                  </Boton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <Vacio>Nada pendiente.</Vacio>
        )}
      </section>
      <section className={CAJA}>
        <form className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={H2}>Bitácora del día</h2>
          <input type="hidden" name="vista" value="accesos" />
          <span className="flex gap-2">
            <input type="date" name="dia" defaultValue={dia} className={CAMPO} aria-label="Día" />
            <button className="min-h-11 rounded-xl border border-borde px-4 text-sm font-bold">Ver</button>
          </span>
        </form>
        {accesos?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gris">
                <tr>
                  <th className="py-2 pr-3">Hora</th>
                  <th className="pr-3">Movimiento</th>
                  <th className="pr-3">Persona</th>
                  <th className="pr-3">Vivienda</th>
                  <th className="pr-3">Autorizó</th>
                  <th className="pr-3">Método</th>
                  <th className="pr-3">Guardia</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde-suave">
                {accesos.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">{cuando(a.ocurrio_at).split(" · ")[1]}</td>
                    <td className="pr-3">{a.tipo === "entrada" ? "Entrada" : "Salida"}</td>
                    <td className="pr-3">
                      {a.visitante}
                      {a.placa ? <span className="text-gris"> · {a.placa}</span> : null}
                    </td>
                    <td className="pr-3">{viv(a)}</td>
                    <td className="pr-3">{a.autorizo}</td>
                    <td className="pr-3">{METODO[a.metodo] ?? a.metodo}</td>
                    <td className="pr-3">{guardia(a)}</td>
                    <td>
                      {a.foto_path && fotos.get(a.foto_path) && (
                        <a href={fotos.get(a.foto_path)} target="_blank" rel="noopener" className="font-bold text-verde underline">
                          Foto
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vacio>Sin movimientos este día.</Vacio>
        )}
      </section>
    </>
  );
}

// ─────────────────────────── Amenidades y mudanzas ───────────────────────────
type Amen = { id: string; nombre: string; tipo: string; modo: string; capacidad: number; hora_abre: string; hora_cierra: string; duraciones: number[]; renta_centavos: number; deposito_centavos: number; descripcion: string | null; reglas: string | null; activo: boolean; inventario?: string | null; minutos_oferta?: number };

function FormAmenidad({ c, a }: { c: Ctx["c"]; a?: Amen }) {
  return (
    <form action={guardarAmenidad} className="grid gap-2 sm:grid-cols-4">
      <Oculto c={c} />
      {a && <input type="hidden" name="amenidad_id" value={a.id} />}
      <Etiqueta texto="Nombre">
        <input name="nombre" required defaultValue={a?.nombre} className={CAMPO} />
      </Etiqueta>
      <Etiqueta texto="Tipo">
        <select name="tipo" defaultValue={a?.tipo ?? "salon"} className={CAMPO}>
          {["gimnasio", "salon", "terraza", "asador", "cancha", "alberca", "otro"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Etiqueta>
      <Etiqueta texto="Cómo se reserva">
        <select name="modo" defaultValue={a?.modo ?? "solicitud"} className={CAMPO}>
          <option value="turnos">Por turnos (se confirma sola)</option>
          <option value="solicitud">Con aprobación</option>
        </select>
      </Etiqueta>
      <Etiqueta texto="Capacidad / aforo">
        <input name="capacidad" type="number" min={1} defaultValue={a?.capacidad ?? 1} className={CAMPO} />
      </Etiqueta>
      <Etiqueta texto="Abre">
        <input name="hora_abre" type="time" defaultValue={a?.hora_abre?.slice(0, 5) ?? "08:00"} className={CAMPO} />
      </Etiqueta>
      <Etiqueta texto="Cierra">
        <input name="hora_cierra" type="time" defaultValue={a?.hora_cierra?.slice(0, 5) ?? "22:00"} className={CAMPO} />
      </Etiqueta>
      <Etiqueta texto="Duraciones (min)">
        <input name="duraciones" defaultValue={a?.duraciones?.join(", ") ?? "60"} className={CAMPO} />
      </Etiqueta>
      <Etiqueta texto="Activa">
        <select name="activo" defaultValue={a?.activo === false ? "off" : "on"} className={CAMPO}>
          <option value="on">Sí</option>
          <option value="off">No</option>
        </select>
      </Etiqueta>
      <Etiqueta texto="Renta">
        <input name="renta" inputMode="decimal" defaultValue={a ? (Number(a.renta_centavos) / 100).toFixed(2) : ""} placeholder="0" className={CAMPO} />
      </Etiqueta>
      <Etiqueta texto="Depósito">
        <input name="deposito" inputMode="decimal" defaultValue={a ? (Number(a.deposito_centavos) / 100).toFixed(2) : ""} placeholder="0" className={CAMPO} />
      </Etiqueta>
      <Etiqueta texto="Foto">
        <input name="foto" type="file" accept="image/*" className="text-sm" />
      </Etiqueta>
      <Etiqueta texto="Minutos para confirmar lugar liberado">
        <input name="minutos_oferta" type="number" min={10} max={2880} defaultValue={a?.minutos_oferta ?? 120} className={CAMPO} />
      </Etiqueta>
      <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
        Descripción
        <textarea name="descripcion" rows={2} defaultValue={a?.descripcion ?? ""} className={`${CAMPO} py-2`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
        Reglas
        <textarea name="reglas" rows={2} defaultValue={a?.reglas ?? ""} className={`${CAMPO} py-2`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-4">
        Inventario que se revisa al entregar (sillas, mesas, bocina…)
        <textarea name="inventario" rows={2} defaultValue={a?.inventario ?? ""} className={`${CAMPO} py-2`} />
      </label>
      <Boton className="sm:col-span-4">{a ? "Guardar cambios" : "Agregar amenidad"}</Boton>
    </form>
  );
}

export async function Amenidades({ ctx }: { ctx: Ctx }) {
  const { supabase, c } = ctx;
  const ahora = new Date().toISOString();
  const [{ data: amenidades }, { data: reservas }, { data: depositos }, { data: mudanzas }] = await Promise.all([
    supabase.from("amenidades").select("*").eq("condominio_id", c.id).order("nombre"),
    supabase.from("reservas").select("id, inicio, fin, personas, estado, renta_centavos, deposito_centavos, amenidades(nombre), viviendas(numero), residentes(nombre)").eq("condominio_id", c.id).in("estado", ["solicitada", "confirmada"]).gte("fin", ahora).order("inicio").limit(60),
    supabase.from("reservas").select("id, inicio, fin, deposito_centavos, amenidades(nombre), viviendas(numero)").eq("condominio_id", c.id).eq("deposito_estado", "cargado").lt("fin", ahora).order("fin"),
    supabase.from("mudanzas").select("id, tipo, inicio, fin, empresa, placa, recursos, estado, viviendas(numero), residentes(nombre)").eq("condominio_id", c.id).in("estado", ["solicitada", "aprobada"]).gte("fin", ahora).order("inicio"),
  ]);
  const n = (x: unknown, k: string) => (x as Record<string, string> | null)?.[k] ?? "";
  const solicitadas = (reservas ?? []).filter((r) => r.estado === "solicitada");
  const confirmadas = (reservas ?? []).filter((r) => r.estado === "confirmada");
  return (
    <>
      <section className={CAJA}>
        <h2 className={H2}>Por aprobar</h2>
        {solicitadas.length + (mudanzas ?? []).filter((m) => m.estado === "solicitada").length === 0 && <Vacio>Nada por aprobar.</Vacio>}
        {solicitadas.map((r) => (
          <form key={r.id} action={revisarReserva} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde-suave p-3 text-sm">
            <Oculto c={c} />
            <input type="hidden" name="reserva_id" value={r.id} />
            <span>
              <b>{n(r.amenidades, "nombre")}</b> · {vigencia(r.inicio, r.fin)} · {n(r.viviendas, "numero")} ({n(r.residentes, "nombre")}) · {r.personas} personas
              {Number(r.renta_centavos) + Number(r.deposito_centavos) > 0 && (
                <span className="block text-gris">
                  Al aprobar se cargan renta {dinero(r.renta_centavos)} y depósito {dinero(r.deposito_centavos)} a su estado de cuenta.
                </span>
              )}
            </span>
            <span className="flex flex-wrap gap-2">
              <input name="nota" placeholder="Nota" className={`${CAMPO} w-36`} aria-label="Nota" />
              <Boton name="decision" value="aprobar" className="min-h-10!">
                Aprobar
              </Boton>
              <Boton name="decision" value="rechazar" estilo="peligro" className="min-h-10!">
                Rechazar
              </Boton>
            </span>
          </form>
        ))}
        {(mudanzas ?? [])
          .filter((m) => m.estado === "solicitada")
          .map((m) => (
            <form key={m.id} action={revisarMudanza} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde-suave p-3 text-sm">
              <Oculto c={c} />
              <input type="hidden" name="mudanza_id" value={m.id} />
              <span>
                <b>Mudanza ({m.tipo})</b> · {vigencia(m.inicio, m.fin)} · {n(m.viviendas, "numero")} ({n(m.residentes, "nombre")}) · {m.empresa}
                {m.placa ? ` · ${m.placa}` : ""}
                {m.recursos?.length ? ` · ${m.recursos.map((x: string) => (x === "elevador" ? "elevador" : "zona de carga")).join(" y ")}` : ""}
                <span className="block text-gris">Al aprobar se crea su pase QR y caseta la ve en su agenda.</span>
              </span>
              <span className="flex flex-wrap gap-2">
                <input name="nota" placeholder="Nota" className={`${CAMPO} w-36`} aria-label="Nota" />
                <Boton name="decision" value="aprobar" className="min-h-10!">
                  Aprobar
                </Boton>
                <Boton name="decision" value="rechazar" estilo="peligro" className="min-h-10!">
                  Rechazar
                </Boton>
              </span>
            </form>
          ))}
      </section>
      {depositos?.length ? (
        <section className={CAJA}>
          <h2 className={H2}>Depósitos por cerrar</h2>
          {depositos.map((r) => (
            <form key={r.id} action={revisarReserva} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <Oculto c={c} />
              <input type="hidden" name="reserva_id" value={r.id} />
              <span>
                {n(r.amenidades, "nombre")} · {n(r.viviendas, "numero")} · {vigencia(r.inicio, r.fin)} · depósito {dinero(r.deposito_centavos)}
              </span>
              <span className="flex flex-wrap gap-2">
                <input name="nota" placeholder="Motivo si se retiene" className={`${CAMPO} w-44`} aria-label="Motivo" />
                <Boton name="decision" value="devolver" className="min-h-10!">
                  Devolver
                </Boton>
                <Boton name="decision" value="retener" estilo="peligro" className="min-h-10!">
                  Retener
                </Boton>
              </span>
            </form>
          ))}
        </section>
      ) : null}
      <section className={CAJA}>
        <h2 className={H2}>Próximas reservas y mudanzas</h2>
        <ul className="divide-y divide-borde-suave text-sm">
          {confirmadas.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {vigencia(r.inicio, r.fin)} · <b>{n(r.amenidades, "nombre")}</b> · {n(r.viviendas, "numero")} · {r.personas} pers.
              </span>
              <form action={revisarReserva}>
                <Oculto c={c} />
                <input type="hidden" name="reserva_id" value={r.id} />
                <Boton name="decision" value="cancelar" estilo="peligro" className="min-h-9! text-xs!">
                  Cancelar
                </Boton>
              </form>
            </li>
          ))}
          {(mudanzas ?? [])
            .filter((m) => m.estado === "aprobada")
            .map((m) => (
              <li key={m.id} className="py-2">
                {vigencia(m.inicio, m.fin)} · <b>Mudanza ({m.tipo})</b> · {n(m.viviendas, "numero")} · {m.empresa}
              </li>
            ))}
          {!confirmadas.length && !(mudanzas ?? []).some((m) => m.estado === "aprobada") && <li className="py-2 text-gris">Nada próximo.</li>}
        </ul>
      </section>
      <section className={CAJA}>
        <h2 className={H2}>Amenidades</h2>
        {((amenidades ?? []) as Amen[]).map((a) => (
          <details key={a.id} className="rounded-xl border border-borde-suave p-3">
            <summary className="cursor-pointer text-sm">
              <b>{a.nombre}</b> · {a.modo === "turnos" ? `por turnos, ${a.capacidad} por turno` : `con aprobación, aforo ${a.capacidad}`} · {a.hora_abre.slice(0, 5)}–{a.hora_cierra.slice(0, 5)}
              {Number(a.renta_centavos) ? ` · renta ${dinero(a.renta_centavos)}` : ""}
              {Number(a.deposito_centavos) ? ` · depósito ${dinero(a.deposito_centavos)}` : ""}
              {!a.activo && " · inactiva"}
            </summary>
            <div className="pt-3">
              <FormAmenidad c={c} a={a} />
            </div>
          </details>
        ))}
        <details className="rounded-xl bg-fondo p-3">
          <summary className="cursor-pointer text-sm font-bold">+ Agregar amenidad</summary>
          <div className="pt-3">
            <FormAmenidad c={c} />
          </div>
        </details>
      </section>
    </>
  );
}

// ─────────────────────────── Avisos ───────────────────────────
export async function Avisos({ ctx }: { ctx: Ctx }) {
  const { supabase, c, q } = ctx;
  const [{ data: zonas }, { data: avisos }] = await Promise.all([
    supabase.from("zonas_condominio").select("id, nombre").eq("condominio_id", c.id).order("nombre"),
    supabase.from("avisos_condominio").select("id, titulo, cuerpo, created_at, creado_por, zonas_condominio(nombre)").eq("condominio_id", c.id).order("created_at", { ascending: false }).limit(30),
  ]);
  return (
    <>
      {q.publicado && <Aviso>Publicado. Ya aparece en el portal de los residentes de esa zona. Para avisar también por WhatsApp, copia el texto al grupo.</Aviso>}
      <form action={publicarAviso} className={CAJA}>
        <Oculto c={c} />
        <h2 className={H2}>Nuevo aviso</h2>
        <select name="zona_id" className={CAMPO} aria-label="Para quién" defaultValue="">
          <option value="">Todo el condominio</option>
          {(zonas ?? []).map((z) => (
            <option key={z.id} value={z.id}>
              Solo {z.nombre}
            </option>
          ))}
        </select>
        <input name="titulo" required maxLength={120} placeholder="Corte de agua el jueves" className={CAMPO} aria-label="Título" />
        <textarea name="cuerpo" required rows={4} maxLength={2000} placeholder="Horario, zonas afectadas y qué hacer." className={`${CAMPO} py-2`} aria-label="Mensaje" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="urgente" className="size-4 accent-verde" />
          <b>Urgente:</b> manda notificación al celular de los residentes que activaron avisos
        </label>
        <Boton>Publicar aviso</Boton>
      </form>
      <section className={CAJA}>
        <h2 className={H2}>Publicados</h2>
        {avisos?.length ? (
          avisos.map((a) => (
            <article key={a.id} className="flex flex-col gap-1 border-b border-borde-suave pb-3 text-sm last:border-0">
              <p className="text-xs text-gris">
                {cuando(a.created_at)} · {(a.zonas_condominio as unknown as { nombre: string } | null)?.nombre ?? "Todo el condominio"} · {a.creado_por}
              </p>
              <b>{a.titulo}</b>
              <p className="whitespace-pre-line">{a.cuerpo}</p>
              <BotonCopiar texto={`*${a.titulo}*\n${a.cuerpo}\n— Administración ${c.nombre}`} etiqueta="Copiar para WhatsApp" className="w-fit" />
            </article>
          ))
        ) : (
          <Vacio>Sin avisos.</Vacio>
        )}
      </section>
    </>
  );
}

// ─────────────────────────── Caseta, links y datos ───────────────────────────
export async function Caseta({ ctx }: { ctx: Ctx }) {
  const { supabase, c, base } = ctx;
  const [{ data: guardias }, { data: turnos }] = await Promise.all([
    supabase.from("guardias").select("id, nombre, activo").eq("condominio_id", c.id).order("nombre"),
    supabase.from("turnos").select("id, inicio, fin, notas, guardias(nombre)").eq("condominio_id", c.id).order("inicio", { ascending: false }).limit(10),
  ]);
  const links: [string, string, string, string][] = [
    ["caseta", "Link de caseta", `${base}/caseta/${c.caseta_token}`, "Ábrelo en el celular o tablet de caseta y agrégalo a la pantalla de inicio. Cada guardia entra con su PIN."],
    ["comite", "Link del comité", `${base}/comite/${c.comite_token}`, "Solo lectura: cobranza, gastos, adeudos y reportes del mes."],
    ["alta", "Link de alta de residentes", `${base}/alta/${c.alta_token}`, "Compártelo en el grupo de vecinos: cada quien manda su INE y selfie y tú apruebas."],
    ["timbre", "Timbre por QR", `${base}/timbre/${c.timbre_token}`, "Imprime el QR y pégalo en la entrada: la visita avisa a la vivienda desde su celular."],
    ["kiosco", "Tablet del cuarto de paquetes", `${base}/kiosco/${c.kiosco_token}`, "Ábrelo en la tablet junto al cuarto de paquetes: el repartidor teclea el código del residente."],
  ];
  return (
    <>
      <section className={CAJA}>
        <h2 className={H2}>Links</h2>
        {links.map(([cual, titulo, url, nota]) => (
          <div key={cual} className="flex flex-col gap-2 border-b border-borde-suave pb-3 last:border-0">
            <p className="text-sm">
              <b>{titulo}</b> · <span className="text-gris">{nota}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <BotonCopiar texto={url} etiqueta="Copiar link" />
              <a href={url} target="_blank" rel="noopener" className="flex min-h-11 items-center rounded-xl border border-borde px-4 text-sm font-bold">
                Abrir
              </a>
              <form action={renovarLink}>
                <Oculto c={c} />
                <input type="hidden" name="cual" value={cual} />
                <Boton estilo="peligro" enviando="…">
                  Cambiar link
                </Boton>
              </form>
            </div>
          </div>
        ))}
        <a href={`/condominios/${c.id}/imprimir?que=timbre`} target="_blank" className="w-fit text-sm font-bold text-verde underline">
          Imprimir QR del timbre
        </a>
        <p className="text-xs text-gris">Cambiar un link invalida el anterior (útil si se perdió el celular de caseta o cambió el comité). Al cambiar el de caseta se cierra el turno abierto.</p>
      </section>

      <section className={CAJA}>
        <h2 className={H2}>Guardias</h2>
        <ul className="divide-y divide-borde-suave">
          {(guardias ?? []).map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className={g.activo ? "" : "text-gris line-through"}>{g.nombre}</span>
              <form action={guardarGuardia} className="flex flex-wrap gap-2">
                <Oculto c={c} />
                <input type="hidden" name="guardia_id" value={g.id} />
                <input name="pin" inputMode="numeric" pattern="[0-9]{4,8}" placeholder="Nuevo PIN" className={`${CAMPO} w-28`} aria-label={`Nuevo PIN de ${g.nombre}`} />
                <Boton estilo="claro" className="min-h-10!">
                  Cambiar PIN
                </Boton>
                <Boton name="accion" value={g.activo ? "baja" : "alta"} estilo={g.activo ? "peligro" : "claro"} className="min-h-10!">
                  {g.activo ? "Dar de baja" : "Reactivar"}
                </Boton>
              </form>
            </li>
          ))}
        </ul>
        <form action={guardarGuardia} className="flex flex-wrap gap-2">
          <Oculto c={c} />
          <input name="nombre" required placeholder="Nombre del guardia" className={`${CAMPO} max-w-xs flex-1`} aria-label="Nombre" />
          <input name="pin" required inputMode="numeric" pattern="[0-9]{4,8}" placeholder="PIN (4 a 8 números)" className={`${CAMPO} w-44`} aria-label="PIN" />
          <Boton>Agregar guardia</Boton>
        </form>
      </section>

      <section className={CAJA}>
        <h2 className={H2}>Turnos recientes</h2>
        <ul className="divide-y divide-borde-suave text-sm">
          {(turnos ?? []).map((t) => (
            <li key={t.id} className="py-2">
              <b>{(t.guardias as unknown as { nombre: string } | null)?.nombre}</b> · {cuando(t.inicio)} – {t.fin ? cuando(t.fin) : <span className="font-bold text-verde">en turno</span>}
              {t.notas && <span className="block text-gris">{t.notas}</span>}
            </li>
          ))}
          {!turnos?.length && <li className="py-2 text-gris">Aún no hay turnos.</li>}
        </ul>
      </section>

      <form action={editarCondominio} className={CAJA}>
        <Oculto c={c} />
        <h2 className={H2}>Datos del condominio</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Etiqueta texto="Nombre">
            <input name="nombre" defaultValue={c.nombre} className={CAMPO} />
          </Etiqueta>
          <Etiqueta texto="Dirección">
            <input name="direccion" defaultValue={c.direccion ?? ""} className={CAMPO} />
          </Etiqueta>
          <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
            Datos para transferencias (los ven los residentes)
            <textarea name="datos_pago" rows={2} defaultValue={c.datos_pago ?? ""} placeholder="Banco, CLABE y titular de la cuenta del condominio" className={`${CAMPO} py-2`} />
          </label>
          <Etiqueta texto="Serie de recibos">
            <input name="recibo_serie" defaultValue={c.recibo_serie} maxLength={8} className={CAMPO} />
          </Etiqueta>
          <Etiqueta texto="Foto de portada del portal">
            <input name="foto" type="file" accept="image/*" className="text-sm" />
          </Etiqueta>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="comite_exporta" defaultChecked={c.comite_exporta} className="size-4 accent-verde" />
            El comité puede descargar los movimientos
          </label>
        </div>
        <Boton>Guardar</Boton>
      </form>
    </>
  );
}

// ─────────────────────────── Reporte del mes ───────────────────────────
export async function Reportes({ ctx }: { ctx: Ctx }) {
  const { supabase, c, q, hoy } = ctx;
  const actual = hoy.slice(0, 7);
  const mes = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : actual;
  const mover = (n: number) => {
    const d = new Date(`${mes}-15T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 7);
  };
  const { data } = await supabase.rpc("reporte_condominio", { p_condominio: c.id, p_mes: `${mes}-01` });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold">{mesTexto(mes)}</h2>
        <div className="flex flex-wrap gap-2">
          <Link href={`?vista=reportes&mes=${mover(-1)}`} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold">
            ‹ Anterior
          </Link>
          {mes < actual && (
            <Link href={`?vista=reportes&mes=${mover(1)}`} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold">
              Siguiente ›
            </Link>
          )}
          <a href={`/condominios/${c.id}/movimientos?mes=${mes}`} className="flex min-h-11 items-center rounded-xl bg-verde px-4 text-sm font-bold text-white">
            Exportar movimientos (CSV)
          </a>
        </div>
      </div>
      {data ? <ReporteCondominio r={data as TipoResumen} /> : <Vacio>No pudimos cargar el reporte.</Vacio>}
    </>
  );
}

// ─────────────────────────── Conciliación bancaria ───────────────────────────
async function Conciliacion({ ctx, viviendas }: { ctx: Ctx; viviendas: Viv[] }) {
  const { supabase, c, q } = ctx;
  const [{ data: movs }, { data: sug }] = await Promise.all([
    supabase.from("movimientos_banco").select("id, fecha, descripcion, referencia, monto_centavos").eq("condominio_id", c.id).eq("estado", "pendiente").order("fecha").limit(100),
    supabase.rpc("sugerencias_conciliacion", { p_condominio: c.id }),
  ]);
  const s = new Map(((sug ?? []) as { movimiento_id: string; pago_id: string | null; vivienda_id: string | null; vivienda: string | null; razon: string | null }[]).map((x) => [x.movimiento_id, x]));
  return (
    <section id="conciliacion" className={CAJA}>
      <h2 className={H2}>Conciliación bancaria</h2>
      {q.banco && <Aviso>Se agregaron {q.banco} movimientos nuevos (los repetidos se ignoran).</Aviso>}
      <form action={importarBanco} className="flex flex-col gap-2 rounded-xl bg-fondo p-3">
        <Oculto c={c} />
        <p className="text-sm text-gris">
          Descarga de tu banca en línea el estado de cuenta de la cuenta del condominio en <b>CSV</b> y súbelo (o pégalo). Leemos los abonos y te sugerimos a qué vivienda corresponde cada uno.
        </p>
        <input name="archivo" type="file" accept=".csv,text/csv,text/plain" className="text-sm" aria-label="Estado de cuenta CSV" />
        <textarea name="texto" rows={2} placeholder={"Fecha,Descripción,Referencia,Abono\n05/11/2026,SPEI CASA 24,123456,1450.00"} className={`${CAMPO} py-2 font-mono text-xs`} aria-label="Pegar estado de cuenta" />
        <Boton estilo="claro" enviando="Leyendo…">
          Leer estado de cuenta
        </Boton>
      </form>
      {movs?.length ? (
        <ul className="divide-y divide-borde-suave">
          {movs.map((m) => {
            const x = s.get(m.id);
            return (
              <li key={m.id} className="flex flex-col gap-2 py-3 text-sm">
                <p>
                  <b className="tabular-nums">{dinero(m.monto_centavos)}</b> · {m.fecha} · {[m.descripcion, m.referencia].filter(Boolean).join(" · ")}
                </p>
                <form action={conciliar} className="flex flex-wrap items-center gap-2">
                  <Oculto c={c} />
                  <input type="hidden" name="movimiento_id" value={m.id} />
                  {x?.pago_id ? (
                    <>
                      <input type="hidden" name="pago_id" value={x.pago_id} />
                      <span className="rounded-full bg-verde-claro px-3 py-1 text-xs font-bold text-verde-oscuro">
                        {x.razon} · {x.vivienda}
                      </span>
                      <Boton name="accion" value="conciliar" className="min-h-10!">
                        Confirmar pago
                      </Boton>
                    </>
                  ) : (
                    <>
                      <select name="vivienda_id" defaultValue={x?.vivienda_id ?? ""} required className={`${CAMPO} w-44`} aria-label="Vivienda">
                        <option value="" disabled>
                          ¿De qué vivienda?
                        </option>
                        {viviendas.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.numero}
                          </option>
                        ))}
                      </select>
                      {x?.vivienda_id && <span className="text-xs text-verde-oscuro">{x.razon}</span>}
                      <Boton name="accion" value="conciliar" className="min-h-10!">
                        Registrar y emitir recibo
                      </Boton>
                    </>
                  )}
                  <button name="accion" value="ignorar" formNoValidate className="text-xs text-gris underline">
                    No es cuota (ignorar)
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <Vacio>Sin movimientos por conciliar.</Vacio>
      )}
    </section>
  );
}

// ─────────────────────────── Seguridad ───────────────────────────
export async function Seguridad({ ctx }: { ctx: Ctx }) {
  const { supabase, c, base } = ctx;
  const [viviendas, { data: alertas }, { data: vetados }, { data: vehiculos }, { data: puntos }, { data: marcas }, { data: lpr }, { data: aperturas }] = await Promise.all([
    viviendasDe(ctx),
    supabase.from("alertas_condominio").select("id, tipo, detalle, created_at, atendida_at, atendida_por").eq("condominio_id", c.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("vetados").select("id, nombre, placa, motivo, activo, created_at").eq("condominio_id", c.id).order("created_at", { ascending: false }),
    supabase.from("vehiculos").select("id, placa, descripcion, viviendas(numero)").eq("condominio_id", c.id).order("placa"),
    supabase.from("puntos_rondin").select("id, nombre, codigo, orden, activo").eq("condominio_id", c.id).order("orden"),
    supabase.from("marcas_rondin").select("id, created_at, nota, puntos_rondin(nombre), guardias(nombre)").eq("condominio_id", c.id).order("created_at", { ascending: false }).limit(15),
    supabase.from("eventos_lpr").select("id, placa, camara, resultado, created_at").eq("condominio_id", c.id).order("created_at", { ascending: false }).limit(15),
    supabase.from("aperturas").select("id, puerta, motivo, actor, resultado, created_at").eq("condominio_id", c.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const n = (x: unknown, k: string) => (x as Record<string, string> | null)?.[k] ?? "";
  const abiertas = (alertas ?? []).filter((a) => !a.atendida_at);
  return (
    <>
      <section className={CAJA}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={H2}>Alertas ({abiertas.length} sin atender)</h2>
          {abiertas.length > 1 && (
            <form action={atenderAlerta}>
              <Oculto c={c} />
              <Boton estilo="claro" className="min-h-10!">
                Marcar todas como atendidas
              </Boton>
            </form>
          )}
        </div>
        {alertas?.length ? (
          <ul className="divide-y divide-borde-suave text-sm">
            {alertas.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className={a.atendida_at ? "text-gris" : ""}>
                  <b>{a.tipo === "vetado" ? "Vetado" : a.tipo === "placa_desconocida" ? "Placa sin registro" : "PIN fallidos"}</b> · {cuando(a.created_at)} · {a.detalle}
                  {a.atendida_at && ` · atendió ${a.atendida_por}`}
                </span>
                {!a.atendida_at && (
                  <form action={atenderAlerta}>
                    <Oculto c={c} />
                    <input type="hidden" name="alerta_id" value={a.id} />
                    <Boton estilo="claro" className="min-h-9! text-xs!">
                      Atendida
                    </Boton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Vacio>Sin alertas.</Vacio>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={CAJA}>
          <h2 className={H2}>Lista de vetados</h2>
          <p className="text-sm text-gris">Si alguien de la lista llega con pase, por timbre, a mano o en un auto con esa placa, la caseta lo ve en rojo y te llega una alerta.</p>
          <ul className="divide-y divide-borde-suave text-sm">
            {(vetados ?? []).map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className={v.activo ? "" : "text-gris line-through"}>
                  <b>{[v.nombre, v.placa].filter(Boolean).join(" · ")}</b> — {v.motivo}
                </span>
                <form action={guardarVetado}>
                  <Oculto c={c} />
                  <input type="hidden" name="vetado_id" value={v.id} />
                  <Boton name="accion" value={v.activo ? "desactivar" : "activar"} estilo="claro" className="min-h-9! text-xs!">
                    {v.activo ? "Quitar" : "Reactivar"}
                  </Boton>
                </form>
              </li>
            ))}
          </ul>
          <form action={guardarVetado} className="grid gap-2 sm:grid-cols-2">
            <Oculto c={c} />
            <input name="nombre" placeholder="Nombre" className={CAMPO} aria-label="Nombre" />
            <input name="placa" placeholder="Placa" className={CAMPO} aria-label="Placa" />
            <input name="motivo" required minLength={3} placeholder="Motivo" className={`${CAMPO} sm:col-span-2`} aria-label="Motivo" />
            <Boton className="sm:col-span-2">Agregar a la lista</Boton>
          </form>
        </section>

        <section className={CAJA}>
          <h2 className={H2}>Autos registrados ({vehiculos?.length ?? 0})</h2>
          <p className="text-sm text-gris">Los residentes registran los suyos desde su portal. Con cámara de placas entran sin detenerse.</p>
          <ul className="max-h-64 divide-y divide-borde-suave overflow-y-auto text-sm">
            {(vehiculos ?? []).map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  <b className="font-mono">{v.placa}</b> · {n(v.viviendas, "numero")}
                  {v.descripcion ? ` · ${v.descripcion}` : ""}
                </span>
                <form action={guardarVehiculoAdmin}>
                  <Oculto c={c} />
                  <input type="hidden" name="vehiculo_id" value={v.id} />
                  <button className="text-xs text-naranja-oscuro underline">Quitar</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={guardarVehiculoAdmin} className="grid gap-2 sm:grid-cols-3">
            <Oculto c={c} />
            <SelectVivienda viviendas={viviendas} />
            <input name="placa" required placeholder="Placa" className={CAMPO} aria-label="Placa" />
            <input name="descripcion" placeholder="Auto" className={CAMPO} aria-label="Auto" />
            <Boton estilo="claro" className="sm:col-span-3">
              Registrar auto
            </Boton>
          </form>
        </section>

        <section className={CAJA}>
          <h2 className={H2}>Rondines</h2>
          <p className="text-sm text-gris">Imprime los QR y pégalos en cada punto. El guardia los escanea con la app de caseta.</p>
          <ul className="divide-y divide-borde-suave text-sm">
            {(puntos ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className={p.activo ? "" : "text-gris line-through"}>
                  {p.orden}. {p.nombre}
                </span>
                <form action={guardarPunto}>
                  <Oculto c={c} />
                  <input type="hidden" name="punto_id" value={p.id} />
                  <Boton name="accion" value={p.activo ? "desactivar" : "activar"} estilo="claro" className="min-h-9! text-xs!">
                    {p.activo ? "Quitar" : "Reactivar"}
                  </Boton>
                </form>
              </li>
            ))}
          </ul>
          <form action={guardarPunto} className="flex gap-2">
            <Oculto c={c} />
            <input name="orden" type="number" min={0} placeholder="#" className={`${CAMPO} w-16`} aria-label="Orden" />
            <input name="nombre" required placeholder="Portón de servicio" className={CAMPO} aria-label="Nombre del punto" />
            <Boton estilo="claro">Agregar</Boton>
          </form>
          <a href={`/condominios/${c.id}/imprimir?que=rondin`} target="_blank" className="w-fit text-sm font-bold text-verde underline">
            Imprimir QR de los puntos
          </a>
          <h3 className="mt-2 text-sm font-bold">Últimas marcas</h3>
          <ul className="text-xs text-gris">
            {(marcas ?? []).map((m) => (
              <li key={m.id}>
                {cuando(m.created_at)} · {n(m.puntos_rondin, "nombre")} · {n(m.guardias, "nombre")}
                {m.nota ? ` · ${m.nota}` : ""}
              </li>
            ))}
          </ul>
        </section>

        <form action={guardarRelevadores} className={CAJA}>
          <Oculto c={c} />
          <h2 className={H2}>Pluma, cámara de placas y cuarto de paquetes</h2>
          <p className="text-sm text-gris">
            Sin configurar, todo funciona en <b>modo simulación</b> (se registra la apertura pero no se abre nada). Para abrir de verdad, el instalador conecta un relevador con API en la nube (Shelly, controlador de acceso) a la pluma y a la puerta del cuarto de paquetes.
          </p>
          <Etiqueta texto="Liga HTTPS del relevador de la pluma">
            <input name="pluma_url" defaultValue={c.pluma_url ?? ""} placeholder="https://…" className={CAMPO} />
          </Etiqueta>
          <Etiqueta texto="Liga HTTPS del relevador del cuarto de paquetes">
            <input name="paquetes_url" defaultValue={c.paquetes_url ?? ""} placeholder="https://…" className={CAMPO} />
          </Etiqueta>
          <Etiqueta texto="Autorización del relevador (se guarda oculta; escribe - para borrarla)">
            <input name="pluma_auth" type="password" autoComplete="off" placeholder="Bearer …" className={CAMPO} />
          </Etiqueta>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="lpr_abre_visitas" defaultChecked={c.lpr_abre_visitas} className="size-4 accent-verde" />
            Las placas de visitas con pase vigente abren solas
          </label>
          <Boton>Guardar</Boton>
          <div className="rounded-xl bg-fondo p-3 text-xs">
            <p className="font-bold">Cámara de placas (LPR)</p>
            <p className="mt-1">
              Configura la cámara (o su software) para mandar cada lectura a: <code className="break-all">POST {base}/api/condominios/lpr</code> con el encabezado <code>x-bk-token</code> y el cuerpo{" "}
              <code>{`{"placa":"UAB123C","camara":"Entrada"}`}</code>. Responde si se abre la pluma.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <BotonCopiar texto={c.lpr_token} etiqueta="Copiar x-bk-token" />
            </div>
          </div>
        </form>
      </div>
      <form action={renovarLink} className="flex justify-end">
        <Oculto c={c} />
        <input type="hidden" name="cual" value="lpr" />
        <Boton estilo="peligro" enviando="…">
          Cambiar token de la cámara
        </Boton>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={CAJA}>
          <h2 className={H2}>Lecturas de placas</h2>
          <ul className="text-sm">
            {(lpr ?? []).map((e) => (
              <li key={e.id}>
                {cuando(e.created_at)} · <b className="font-mono">{e.placa}</b> · {e.resultado}
                {e.camara ? ` · ${e.camara}` : ""}
              </li>
            ))}
            {!lpr?.length && <li className="text-gris">Aún no hay lecturas.</li>}
          </ul>
        </section>
        <section className={CAJA}>
          <h2 className={H2}>Aperturas</h2>
          <ul className="text-sm">
            {(aperturas ?? []).map((e) => (
              <li key={e.id}>
                {cuando(e.created_at)} · {e.puerta} · {e.motivo} · {e.actor} · <b>{e.resultado}</b>
              </li>
            ))}
            {!aperturas?.length && <li className="text-gris">Sin aperturas registradas.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}

// ─────────────────────────── Comunidad ───────────────────────────
export async function Comunidad({ ctx }: { ctx: Ctx }) {
  const { supabase, c } = ctx;
  const [{ data: asambleas }, { data: acuerdos }, { data: votaciones }, { data: documentos }, { data: tablero }] = await Promise.all([
    supabase.from("asambleas").select("*").eq("condominio_id", c.id).order("fecha", { ascending: false }),
    supabase.from("acuerdos").select("id, texto, responsable, fecha_limite, estado").eq("condominio_id", c.id).order("created_at", { ascending: false }),
    supabase.from("votaciones").select("id, pregunta, opciones, abre, cierra, solo_propietarios").eq("condominio_id", c.id).order("created_at", { ascending: false }),
    supabase.from("documentos_condominio").select("id, titulo, categoria, storage_path, visible_residentes, created_at").eq("condominio_id", c.id).order("categoria"),
    supabase.from("tablero").select("id, tipo, titulo, texto, created_at, residentes(nombre)").eq("condominio_id", c.id).eq("oculto", false).order("created_at", { ascending: false }).limit(20),
  ]);
  const resultados = new Map(
    await Promise.all(
      (votaciones ?? []).map(async (v) => [v.id, (await supabase.rpc("resultados_votacion", { p_votacion: v.id })).data as { votos: number; viviendas: number; opciones: { opcion: string; votos: number; indiviso: number }[] } | null] as const),
    ),
  );
  const docs = await firmar(supabase, (documentos ?? []).map((d) => d.storage_path));
  const ahora = new Date().toISOString();
  return (
    <>
      <section className={CAJA}>
        <h2 className={H2}>Votaciones</h2>
        {(votaciones ?? []).map((v) => {
          const r = resultados.get(v.id);
          const abierta = v.abre <= ahora && v.cierra > ahora;
          return (
            <div key={v.id} className="rounded-xl border border-borde-suave p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{v.pregunta}</b>
                <span className="text-gris">
                  {abierta ? `abierta hasta ${cuando(v.cierra)}` : `cerró ${cuando(v.cierra)}`} · {r?.votos ?? 0} de {r?.viviendas ?? 0} viviendas
                </span>
              </div>
              <ul className="mt-2 grid gap-1">
                {(r?.opciones ?? []).map((o) => (
                  <li key={o.opcion} className="flex justify-between">
                    <span>{o.opcion}</span>
                    <span className="tabular-nums">
                      {o.votos} votos{Number(o.indiviso) ? ` · ${Number(o.indiviso).toFixed(2)}% indiviso` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {abierta && (
                <form action={cerrarVotacion} className="mt-2">
                  <Oculto c={c} />
                  <input type="hidden" name="votacion_id" value={v.id} />
                  <Boton estilo="peligro" className="min-h-9! text-xs!">
                    Cerrar ahora
                  </Boton>
                </form>
              )}
            </div>
          );
        })}
        <form action={crearVotacion} className="grid gap-2 rounded-xl bg-fondo p-3 sm:grid-cols-2">
          <Oculto c={c} />
          <input name="pregunta" required minLength={5} placeholder="¿Aprobamos…?" className={`${CAMPO} sm:col-span-2`} aria-label="Pregunta" />
          <textarea name="descripcion" rows={2} placeholder="Contexto (cotización, monto, plazo)" className={`${CAMPO} py-2 sm:col-span-2`} aria-label="Contexto" />
          <textarea name="opciones" rows={3} required defaultValue={"Sí\nNo\nMe abstengo"} className={`${CAMPO} py-2`} aria-label="Opciones (una por renglón)" />
          <div className="flex flex-col gap-2">
            <Etiqueta texto="Cierra">
              <input name="cierra" type="datetime-local" required className={CAMPO} />
            </Etiqueta>
            <select name="asamblea_id" className={CAMPO} aria-label="Asamblea" defaultValue="">
              <option value="">Sin asamblea</option>
              {(asambleas ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.titulo}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="solo_propietarios" defaultChecked className="size-4 accent-verde" /> Solo votan propietarios
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="en_vivo" className="size-4 accent-verde" /> Resultados visibles antes de cerrar
          </label>
          <Boton className="sm:col-span-2">Abrir votación (avisa a los residentes)</Boton>
          <p className="text-xs text-gris sm:col-span-2">Un voto por vivienda. Si cargas el indiviso de cada vivienda (padrón, columna 7), el resultado también se muestra ponderado. Revisa con tu reglamento qué decisiones requieren asamblea presencial.</p>
        </form>
      </section>

      <section className={CAJA}>
        <h2 className={H2}>Asambleas y acuerdos</h2>
        {(asambleas ?? []).map((a) => (
          <details key={a.id} className="rounded-xl border border-borde-suave p-3">
            <summary className="cursor-pointer text-sm">
              <b>{a.titulo}</b> · {cuando(a.fecha)} · {a.estado}
            </summary>
            <form action={guardarAsamblea} className="mt-3 grid gap-2 sm:grid-cols-2">
              <Oculto c={c} />
              <input type="hidden" name="asamblea_id" value={a.id} />
              <input name="titulo" defaultValue={a.titulo} className={CAMPO} aria-label="Título" />
              <select name="estado" defaultValue={a.estado} className={CAMPO} aria-label="Estado">
                <option value="convocada">Convocada</option>
                <option value="celebrada">Celebrada</option>
                <option value="cancelada">Cancelada</option>
              </select>
              <input name="lugar" defaultValue={a.lugar ?? ""} placeholder="Lugar o liga" className={`${CAMPO} sm:col-span-2`} aria-label="Lugar" />
              <textarea name="orden_del_dia" rows={3} defaultValue={a.orden_del_dia ?? ""} placeholder="Orden del día" className={`${CAMPO} py-2`} aria-label="Orden del día" />
              <textarea name="acta" rows={3} defaultValue={a.acta ?? ""} placeholder="Acta / minuta" className={`${CAMPO} py-2`} aria-label="Acta" />
              <input type="hidden" name="tipo" value={a.tipo} />
              <Boton estilo="claro" className="sm:col-span-2">
                Guardar
              </Boton>
            </form>
          </details>
        ))}
        <form action={guardarAsamblea} className="grid gap-2 rounded-xl bg-fondo p-3 sm:grid-cols-3">
          <Oculto c={c} />
          <input name="titulo" required placeholder="Asamblea ordinaria" className={CAMPO} aria-label="Título" />
          <input name="fecha" type="datetime-local" required className={CAMPO} aria-label="Fecha" />
          <select name="tipo" className={CAMPO} aria-label="Tipo">
            <option value="ordinaria">Ordinaria</option>
            <option value="extraordinaria">Extraordinaria</option>
          </select>
          <input name="lugar" placeholder="Lugar o liga de videollamada" className={`${CAMPO} sm:col-span-3`} aria-label="Lugar" />
          <textarea name="orden_del_dia" rows={3} placeholder="Orden del día" className={`${CAMPO} py-2 sm:col-span-3`} aria-label="Orden del día" />
          <Boton className="sm:col-span-3">Convocar asamblea</Boton>
        </form>
        <h3 className="mt-2 font-bold">Acuerdos</h3>
        <ul className="divide-y divide-borde-suave text-sm">
          {(acuerdos ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {a.texto}
                <span className="block text-xs text-gris">
                  {a.responsable ?? "Sin responsable"}
                  {a.fecha_limite ? ` · ${a.fecha_limite}` : ""}
                </span>
              </span>
              <form action={guardarAcuerdo} className="flex gap-2">
                <Oculto c={c} />
                <input type="hidden" name="acuerdo_id" value={a.id} />
                <select name="estado" defaultValue={a.estado} className="min-h-9 rounded-lg border border-borde px-2 text-xs" aria-label="Estado">
                  <option value="pendiente">Pendiente</option>
                  <option value="en_proceso">En proceso</option>
                  <option value="cumplido">Cumplido</option>
                </select>
                <Boton estilo="claro" className="min-h-9! text-xs!">
                  Guardar
                </Boton>
              </form>
            </li>
          ))}
        </ul>
        <form action={guardarAcuerdo} className="grid gap-2 sm:grid-cols-4">
          <Oculto c={c} />
          <input name="texto" required placeholder="Acuerdo" className={`${CAMPO} sm:col-span-2`} aria-label="Acuerdo" />
          <input name="responsable" placeholder="Responsable" className={CAMPO} aria-label="Responsable" />
          <input name="fecha_limite" type="date" className={CAMPO} aria-label="Fecha límite" />
          <select name="asamblea_id" className={`${CAMPO} sm:col-span-3`} aria-label="Asamblea" defaultValue="">
            <option value="">Sin asamblea</option>
            {(asambleas ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.titulo}
              </option>
            ))}
          </select>
          <Boton estilo="claro">Agregar acuerdo</Boton>
        </form>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={CAJA}>
          <h2 className={H2}>Documentos</h2>
          <ul className="divide-y divide-borde-suave text-sm">
            {(documentos ?? []).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <a href={docs.get(d.storage_path)} target="_blank" rel="noopener" className="font-semibold underline">
                  {d.titulo}
                </a>
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-gris">
                    {etiquetaDe(CATEGORIAS_DOCUMENTO, d.categoria)} · {d.visible_residentes ? "visible" : "solo administración"}
                  </span>
                  <form action={editarDocumento} className="flex gap-1">
                    <Oculto c={c} />
                    <input type="hidden" name="documento_id" value={d.id} />
                    <button name="accion" value={d.visible_residentes ? "ocultar" : "mostrar"} className="underline">
                      {d.visible_residentes ? "Ocultar" : "Mostrar"}
                    </button>
                    <button name="accion" value="borrar" className="text-naranja-oscuro underline">
                      Borrar
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
          <form action={subirDocumento} className="grid gap-2 sm:grid-cols-2">
            <Oculto c={c} />
            <input name="titulo" placeholder="Reglamento interno" className={CAMPO} aria-label="Título" />
            <select name="categoria" className={CAMPO} aria-label="Categoría">
              {CATEGORIAS_DOCUMENTO.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
            <input name="archivo" type="file" required accept="application/pdf,image/*" className="text-sm" aria-label="Archivo" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="visible" defaultChecked className="size-4 accent-verde" /> Visible para residentes
            </label>
            <Boton estilo="claro" className="sm:col-span-2">
              Subir documento
            </Boton>
          </form>
        </section>
        <section className={CAJA}>
          <h2 className={H2}>Tablero vecinal</h2>
          <ul className="divide-y divide-borde-suave text-sm">
            {(tablero ?? []).map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-2 py-2">
                <span>
                  <span className="text-xs text-gris">
                    {etiquetaDe(TIPOS_TABLERO, t.tipo)} · {(t.residentes as unknown as { nombre: string } | null)?.nombre ?? "Vecino"} · {cuando(t.created_at)}
                  </span>
                  <b className="block">{t.titulo}</b>
                  {t.texto}
                </span>
                <form action={ocultarPublicacion}>
                  <Oculto c={c} />
                  <input type="hidden" name="publicacion_id" value={t.id} />
                  <button className="text-xs text-naranja-oscuro underline">Ocultar</button>
                </form>
              </li>
            ))}
            {!tablero?.length && <li className="py-2 text-gris">Sin publicaciones.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
