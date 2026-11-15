import Link from "next/link";
import QRCode from "qrcode";
import { Boton } from "@/components/Boton";
import { IndicadoresPiloto } from "@/components/IndicadoresPiloto";
import { ResumenObras } from "@/components/ResumenObras";
import type { Indicadores } from "@/lib/csv";
import { cuando, dinero, rangoIndicadores } from "@/lib/condominios-datos";
import {
  agruparReportes,
  avanceEtapa,
  avanceIncidente,
  cuotaObra,
  desagruparReporte,
  guardarCajones,
  guardarEquipo,
  guardarObra,
  guardarRegla,
  registrarGasto,
} from "../actions";
import type { Ctx } from "./secciones";

const CAJA = "flex flex-col gap-3 rounded-2xl bg-white p-5";
const CAMPO = "min-h-11 w-full rounded-xl border border-borde bg-white px-3 text-sm";
const H2 = "font-display text-xl font-bold";
const Oculto = ({ c }: { c: Ctx["c"] }) => <input type="hidden" name="condominio_id" value={c.id} />;
const Vacio = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-gris">{children}</p>;
const Aviso = ({ children }: { children: React.ReactNode }) => <p className="rounded-xl bg-verde-claro px-4 py-3 text-sm text-verde-oscuro">{children}</p>;
const Etiqueta = ({ texto, children, className = "" }: { texto: string; children: React.ReactNode; className?: string }) => (
  <label className={`flex flex-col gap-1 text-sm font-semibold ${className}`}>
    {texto}
    {children}
  </label>
);

// ─────────────────────────── Reglas de acceso y cajones ───────────────────────────
const MOTIVOS: [string, string, string][] = [
  ["visita", "Visitas", "Amigos y familia"],
  ["fiesta", "Fiestas", "Un pase por invitado"],
  ["mudanza", "Mudanzas", "Aprobadas por la administración"],
  ["servicio", "Servicios", "Plomero, técnico, jardinero…"],
];
type Regla = { motivo: string; max_horas: number | null; hora_desde: string | null; hora_hasta: string | null; acceso: string | null; instrucciones: string | null; max_invitados: number | null; max_cajones: number };

export async function Operacion({ ctx }: { ctx: Ctx }) {
  const { supabase, c } = ctx;
  const [{ data: reglas }, { data: cajones }, { data: apartados }] = await Promise.all([
    supabase.from("reglas_acceso").select("motivo, max_horas, hora_desde, hora_hasta, acceso, instrucciones, max_invitados, max_cajones").eq("condominio_id", c.id),
    supabase.from("cajones").select("id, nombre").eq("condominio_id", c.id).eq("activo", true).order("nombre"),
    supabase.from("pases").select("visitante, desde, hasta, cajones(nombre), viviendas(numero)").eq("condominio_id", c.id).eq("estado", "activo").not("cajon_id", "is", null).gt("hasta", new Date().toISOString()).order("desde").limit(40),
  ]);
  const porMotivo = new Map(((reglas ?? []) as Regla[]).map((r) => [r.motivo, r]));
  const lista = (cajones ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
  return (
    <>
      <p className="text-sm text-gris">
        Cada tipo de pase lleva por omisión el acceso y las indicaciones que escribas aquí, y respeta su horario y duración máximos. Lo que el residente escriba en su pase se suma.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {MOTIVOS.map(([m, t, sub]) => {
          const r = porMotivo.get(m);
          return (
            <form key={m} action={guardarRegla} className={CAJA}>
              <Oculto c={c} />
              <input type="hidden" name="motivo" value={m} />
              <div>
                <h2 className={H2}>{t}</h2>
                <p className="text-sm text-gris">{sub}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Etiqueta texto="Acceso" className="col-span-2">
                  <input name="acceso" defaultValue={r?.acceso ?? ""} placeholder="Entrada principal / Acceso de servicio" className={CAMPO} />
                </Etiqueta>
                <Etiqueta texto="Entrada desde">
                  <input type="time" name="hora_desde" defaultValue={r?.hora_desde?.slice(0, 5) ?? ""} className={CAMPO} />
                </Etiqueta>
                <Etiqueta texto="hasta">
                  <input type="time" name="hora_hasta" defaultValue={r?.hora_hasta?.slice(0, 5) ?? ""} className={CAMPO} />
                </Etiqueta>
                <Etiqueta texto="Duración máxima (horas)">
                  <input type="number" name="max_horas" min={1} defaultValue={r?.max_horas ?? ""} className={CAMPO} />
                </Etiqueta>
                <Etiqueta texto="Cajones por pase">
                  <input type="number" name="max_cajones" min={0} max={50} defaultValue={r?.max_cajones ?? 0} className={CAMPO} />
                </Etiqueta>
                {m === "fiesta" && (
                  <Etiqueta texto="Máximo de invitados" className="col-span-2">
                    <input type="number" name="max_invitados" min={1} defaultValue={r?.max_invitados ?? ""} className={CAMPO} />
                  </Etiqueta>
                )}
                <Etiqueta texto="Indicaciones que ve la visita" className="col-span-2">
                  <textarea name="instrucciones" rows={2} maxLength={500} defaultValue={r?.instrucciones ?? ""} className={`${CAMPO} py-2`} />
                </Etiqueta>
              </div>
              <Boton>Guardar regla</Boton>
            </form>
          );
        })}
      </div>
      <section className={CAJA}>
        <h2 className={H2}>Cajones de visitas ({lista.length})</h2>
        <p className="text-sm text-gris">Se asignan solos al crear un pase con cajón o una fiesta; nunca dos al mismo horario. Al registrar la salida se liberan.</p>
        {lista.length ? (
          <ul className="flex flex-wrap gap-2">
            {lista.map((k) => (
              <li key={k.id}>
                <form action={guardarCajones} className="flex items-center gap-1 rounded-full border border-borde px-3 py-1 text-sm">
                  <Oculto c={c} />
                  <input type="hidden" name="quitar" value={k.id} />
                  {k.nombre}
                  <button type="submit" aria-label={`Quitar cajón ${k.nombre}`} className="ml-1 text-gris hover:text-naranja-oscuro">
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <Vacio>Sin cajones.</Vacio>
        )}
        <form action={guardarCajones} className="flex flex-wrap gap-2">
          <Oculto c={c} />
          <input name="nombres" required placeholder="V-11, V-12, V-13" className={`${CAMPO} flex-1`} aria-label="Cajones nuevos" />
          <Boton>Agregar</Boton>
        </form>
        {(apartados ?? []).length > 0 && (
          <>
            <h3 className="text-sm font-bold">Apartados</h3>
            <ul className="divide-y divide-borde-suave text-sm">
              {(apartados ?? []).map((p, i) => (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <span>
                    <b>{(p.cajones as unknown as { nombre: string } | null)?.nombre}</b> · {p.visitante} · {(p.viviendas as unknown as { numero: string } | null)?.numero}
                  </span>
                  <span className="text-gris">{cuando(p.desde)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

// ─────────────────────────── Incidencias agrupadas ───────────────────────────
type Sug = { ticket_id: string; folio: number; titulo: string; categoria: string | null; zona: string | null; vivienda: string | null; created_at: string; grupo: string; incidente_id: string | null };

export async function Incidencias({ ctx }: { ctx: Ctx }) {
  const { supabase, c } = ctx;
  const [{ data: sug }, { data: incidentes }] = await Promise.all([
    supabase.rpc("sugerencias_incidentes", { p_condominio: c.id }),
    supabase
      .from("incidentes")
      .select("id, titulo, categoria, estado, responsable, fecha_compromiso, resolucion, primer_aviso_at, created_at, zonas_condominio(nombre), tickets(id, folio, titulo, viviendas(numero))")
      .eq("condominio_id", c.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const grupos = new Map<string, Sug[]>();
  for (const s of (sug ?? []) as Sug[]) grupos.set(s.grupo, [...(grupos.get(s.grupo) ?? []), s]);
  return (
    <>
      <section className={CAJA}>
        <h2 className={H2}>Posibles problemas generales</h2>
        <p className="text-sm text-gris">Reportes abiertos de la misma categoría y zona en las últimas 48 horas. Agrúpalos para dar un solo seguimiento; cada residente conserva su folio y nadie ve quién más reportó.</p>
        {grupos.size ? (
          [...grupos].map(([g, lista]) => {
            const abierto = lista.find((x) => x.incidente_id)?.incidente_id;
            return (
              <form key={g} action={agruparReportes} className="flex flex-col gap-2 rounded-xl border border-borde-suave p-4">
                <Oculto c={c} />
                {abierto && <input type="hidden" name="incidente_id" value={abierto} />}
                <p className="font-bold capitalize">{g}</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {lista.map((x) => (
                    <li key={x.ticket_id}>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name="ticket_id" value={x.ticket_id} defaultChecked className="size-4 accent-verde" />
                        #{x.folio} · {x.titulo} · {x.vivienda ?? "—"} · {cuando(x.created_at)}
                      </label>
                    </li>
                  ))}
                </ul>
                {!abierto && <input name="titulo" placeholder={`Título general (ej. Falta de agua en ${lista[0].zona ?? "la privada"})`} className={CAMPO} aria-label="Título del incidente" />}
                <Boton className="w-fit">{abierto ? "Sumar al incidente abierto" : "Agrupar en un incidente"}</Boton>
              </form>
            );
          })
        ) : (
          <Vacio>No hay reportes repetidos por ahora.</Vacio>
        )}
      </section>
      {(incidentes ?? []).map((i) => {
        const tickets = (i.tickets ?? []) as unknown as { id: string; folio: number; titulo: string; viviendas: { numero: string } | null }[];
        return (
          <section key={i.id} className={CAJA}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className={H2}>{i.titulo}</h2>
                <p className="text-sm text-gris">
                  {(i.zonas_condominio as unknown as { nombre: string } | null)?.nombre ?? "Sin zona"} · {tickets.length} reportes · abierto {cuando(i.created_at)}
                  {i.primer_aviso_at ? ` · primer aviso ${cuando(i.primer_aviso_at)}` : " · sin aviso todavía"}
                </p>
              </div>
              <span className="rounded-full bg-fondo px-3 py-1 text-sm font-bold">{i.estado.replace("_", " ")}</span>
            </div>
            <ul className="flex flex-wrap gap-2 text-sm">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-full border border-borde px-3 py-1">
                  <Link href={`/tickets/${t.id}`} className="underline">
                    #{t.folio}
                  </Link>
                  {t.viviendas?.numero}
                  {i.estado !== "resuelto" && (
                    <form action={desagruparReporte}>
                      <Oculto c={c} />
                      <input type="hidden" name="ticket_id" value={t.id} />
                      <button type="submit" className="text-xs text-gris underline">
                        separar
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {i.estado === "resuelto" ? (
              <p className="rounded-xl bg-verde-claro px-4 py-2 text-sm">{i.resolucion}</p>
            ) : (
              <form action={avanceIncidente} className="grid gap-2 sm:grid-cols-3">
                <Oculto c={c} />
                <input type="hidden" name="incidente_id" value={i.id} />
                <Etiqueta texto="Avance para todos los afectados" className="sm:col-span-3">
                  <textarea name="nota" required minLength={3} rows={2} placeholder="El proveedor revisa la bomba a las 13:00; el agua regresa hoy en la tarde." className={`${CAMPO} py-2`} />
                </Etiqueta>
                <Etiqueta texto="Estado">
                  <select name="estado" defaultValue={i.estado === "abierto" ? "en_proceso" : i.estado} className={CAMPO}>
                    <option value="en_proceso">En proceso</option>
                    <option value="resuelto">Resuelto</option>
                    <option value="abierto">Abierto</option>
                  </select>
                </Etiqueta>
                <Etiqueta texto="Responsable">
                  <input name="responsable" defaultValue={i.responsable ?? ""} className={CAMPO} />
                </Etiqueta>
                <Etiqueta texto="Próxima revisión">
                  <input type="date" name="fecha_compromiso" defaultValue={i.fecha_compromiso ?? ""} className={CAMPO} />
                </Etiqueta>
                <Boton className="sm:col-span-3">Publicar avance y avisar</Boton>
              </form>
            )}
          </section>
        );
      })}
    </>
  );
}

// ─────────────────────────── Bitácora ───────────────────────────
const ENTIDAD: Record<string, string> = {
  pases: "Pase", accesos: "Acceso", paquetes: "Paquete", pagos_condominio: "Pago", cargos_condominio: "Cargo", ajustes_saldo: "Ajuste", residentes: "Residente",
  reservas: "Reserva", mudanzas: "Mudanza", turnos: "Turno", incidentes: "Incidente", eventos: "Fiesta", autorizaciones_recogida: "Recogida", gastos_condominio: "Gasto",
  reglas_acceso: "Regla", cajones: "Cajón", obras: "Obra", etapas_obra: "Etapa", equipos_condominio: "Equipo", aclaraciones: "Aclaración", condominios: "Condominio",
};

export async function Bitacora({ ctx }: { ctx: Ctx }) {
  const { supabase, c, q } = ctx;
  let consulta = supabase.from("bitacora_condominio").select("id, actor, accion, entidad, detalle, created_at").eq("condominio_id", c.id).order("created_at", { ascending: false }).limit(150);
  if (q.entidad && ENTIDAD[q.entidad]) consulta = consulta.eq("entidad", q.entidad);
  if (q.actor) consulta = consulta.ilike("actor", `%${q.actor.replace(/[%_]/g, "")}%`);
  const { data } = await consulta;
  return (
    <section className={CAJA}>
      <h2 className={H2}>Bitácora</h2>
      <p className="text-sm text-gris">Quién hizo qué y cuándo. No se puede editar ni borrar desde la app.</p>
      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="vista" value="bitacora" />
        <select name="entidad" defaultValue={q.entidad ?? ""} className={`${CAMPO} w-auto`} aria-label="Qué">
          <option value="">Todo</option>
          {Object.entries(ENTIDAD).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
        <input name="actor" defaultValue={q.actor ?? ""} placeholder="Quién (caseta, correo, residente…)" className={`${CAMPO} w-auto flex-1`} aria-label="Quién" />
        <Boton estilo="claro">Filtrar</Boton>
      </form>
      {data?.length ? (
        <ul className="divide-y divide-borde-suave text-sm">
          {data.map((b) => {
            const d = (b.detalle ?? {}) as Record<string, unknown>;
            const resumen = ["estado", "visitante", "titulo", "nombre", "monto_centavos"].filter((k) => d[k] != null).map((k) => (k === "monto_centavos" ? dinero(Number(d[k])) : String(d[k]))).join(" · ");
            return (
              <li key={b.id} className="flex flex-wrap justify-between gap-x-3 py-2">
                <span>
                  <b>{ENTIDAD[b.entidad] ?? b.entidad}</b> · {b.accion === "insert" ? "creó" : b.accion === "update" ? "cambió" : b.accion === "delete" ? "borró" : b.accion} · {b.actor}
                  {resumen && <span className="text-gris"> · {resumen.slice(0, 120)}</span>}
                </span>
                <span className="text-gris">{cuando(b.created_at)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <Vacio>Sin movimientos.</Vacio>
      )}
    </section>
  );
}

// ─────────────────────────── Indicadores del piloto ───────────────────────────
export async function IndicadoresVista({ ctx }: { ctx: Ctx }) {
  const { supabase, c, q } = ctx;
  const r = rangoIndicadores(q.desde, q.hasta);
  const { data } = await supabase.rpc("indicadores_piloto", { p_condominio: c.id, p_desde: r.desde, p_hasta: r.hasta });
  const d = data as { actual: Indicadores; anterior: Indicadores } | null;
  return (
    <>
      <form className="flex flex-wrap items-end gap-2 rounded-2xl bg-white p-4">
        <input type="hidden" name="vista" value="indicadores" />
        <Etiqueta texto="Desde">
          <input type="date" name="desde" defaultValue={r.dia_desde} className={CAMPO} />
        </Etiqueta>
        <Etiqueta texto="Hasta">
          <input type="date" name="hasta" defaultValue={r.dia_hasta} className={CAMPO} />
        </Etiqueta>
        <Boton estilo="claro">Ver</Boton>
        <a href={`/condominios/${c.id}/indicadores?desde=${r.dia_desde}&hasta=${r.dia_hasta}`} className="flex min-h-11 items-center rounded-xl border border-borde px-4 text-sm font-bold">
          Descargar CSV
        </a>
      </form>
      <p className="text-sm text-gris">Comparado con el periodo anterior de la misma duración. Verde = mejoró.</p>
      {d ? <IndicadoresPiloto actual={d.actual} anterior={d.anterior} /> : <Vacio>Sin datos.</Vacio>}
    </>
  );
}

// ─────────────────────────── Equipos y obras ───────────────────────────
export async function EquiposObras({ ctx }: { ctx: Ctx }) {
  const { supabase, c, q, base, hoy } = ctx;
  const [{ data: equipos }, { data: obras }, { data: proveedores }, { data: asambleas }, { data: etapas }] = await Promise.all([
    supabase.from("equipos_condominio").select("id, nombre, tipo, ubicacion, marca, garantia_hasta, codigo").eq("condominio_id", c.id).eq("activo", true).order("nombre"),
    supabase.rpc("obras_condominio", { p_condominio: c.id }),
    supabase.from("proveedores").select("id, nombre").eq("organizacion_id", c.organizacion_id).order("nombre"),
    supabase.from("asambleas").select("id, titulo, fecha").eq("condominio_id", c.id).order("fecha", { ascending: false }).limit(20),
    supabase.from("etapas_obra").select("id, obra_id, nombre, avance_pct, gasto_id").eq("condominio_id", c.id).order("orden"),
  ]);
  const qrs = await Promise.all((equipos ?? []).map((e) => QRCode.toString(`${base}/equipo/${e.codigo}`, { type: "svg", margin: 0 })));
  const lista = (obras ?? []) as Parameters<typeof ResumenObras>[0]["obras"];
  return (
    <>
      {q.cargados && <Aviso>Cuota cargada a {q.cargados} viviendas. Ya aparece en su estado de cuenta.</Aviso>}
      <section className={CAJA}>
        <h2 className={H2}>Equipos</h2>
        <p className="text-sm text-gris">Pega el QR en el elevador, la bomba o el portón. Quien lo escanee (del equipo de la administradora) ve reparaciones, gastos, evidencias y garantía.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {(equipos ?? []).map((e, i) => {
            const vencida = e.garantia_hasta && e.garantia_hasta < hoy;
            return (
              <li key={e.id} className="flex gap-3 rounded-xl border border-borde-suave p-3">
                <div className="size-20 shrink-0 [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={`QR de ${e.nombre}`} dangerouslySetInnerHTML={{ __html: qrs[i] }} />
                <div className="min-w-0 text-sm">
                  <Link href={`/equipo/${e.codigo}`} className="font-bold underline">
                    {e.nombre}
                  </Link>
                  <p className="text-gris">{[e.ubicacion, e.marca].filter(Boolean).join(" · ")}</p>
                  {e.garantia_hasta && <p className={vencida ? "text-naranja-oscuro" : "text-verde-oscuro"}>Garantía {vencida ? "vencida" : "hasta"} {e.garantia_hasta}</p>}
                </div>
              </li>
            );
          })}
        </ul>
        <details>
          <summary className="cursor-pointer text-sm font-bold">Agregar equipo</summary>
          <form action={guardarEquipo} className="mt-3 grid gap-2 sm:grid-cols-3">
            <Oculto c={c} />
            <Etiqueta texto="Nombre">
              <input name="nombre" required className={CAMPO} placeholder="Bomba de agua" />
            </Etiqueta>
            <Etiqueta texto="Tipo">
              <select name="tipo" className={CAMPO}>
                {["bomba", "elevador", "porton", "cisterna", "planta_luz", "camaras", "otro"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Etiqueta>
            <Etiqueta texto="Ubicación">
              <input name="ubicacion" className={CAMPO} />
            </Etiqueta>
            <Etiqueta texto="Marca">
              <input name="marca" className={CAMPO} />
            </Etiqueta>
            <Etiqueta texto="Modelo / serie">
              <input name="modelo" className={CAMPO} />
            </Etiqueta>
            <Etiqueta texto="Proveedor">
              <select name="proveedor_id" className={CAMPO} defaultValue="">
                <option value="">—</option>
                {(proveedores ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Etiqueta>
            <Etiqueta texto="Instalado">
              <input type="date" name="instalado" className={CAMPO} />
            </Etiqueta>
            <Etiqueta texto="Garantía hasta">
              <input type="date" name="garantia_hasta" className={CAMPO} />
            </Etiqueta>
            <Boton className="self-end">Agregar</Boton>
          </form>
        </details>
        {(equipos ?? []).length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-bold">Registrar gasto de un equipo</summary>
            <form action={registrarGasto} className="mt-3 grid gap-2 sm:grid-cols-4">
              <Oculto c={c} />
              <input type="hidden" name="categoria" value="Mantenimiento" />
              <select name="equipo_id" required className={CAMPO} aria-label="Equipo" defaultValue="">
                <option value="" disabled>
                  Equipo
                </option>
                {(equipos ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
              <input name="descripcion" required placeholder="Cambio de sello" className={CAMPO} aria-label="Concepto" />
              <input name="monto" required inputMode="decimal" placeholder="Monto" className={CAMPO} aria-label="Monto" />
              <input type="date" name="fecha" required defaultValue={hoy} className={CAMPO} aria-label="Fecha" />
              <input type="file" name="comprobante" className="text-sm sm:col-span-3" aria-label="Comprobante" />
              <Boton>Guardar gasto</Boton>
            </form>
          </details>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={H2}>Obras con cuota</h2>
        <ResumenObras obras={lista} />
        {lista.map((o) => (
          <details key={o.id} className={CAJA}>
            <summary className="cursor-pointer text-sm font-bold">Administrar: {o.nombre}</summary>
            <form action={cuotaObra} className="grid gap-2 sm:grid-cols-4">
              <Oculto c={c} />
              <input type="hidden" name="obra_id" value={o.id} />
              <Etiqueta texto="Total a recaudar">
                <input name="total" required inputMode="decimal" defaultValue={(Number(o.aprobado_centavos) / 100).toFixed(2)} className={CAMPO} />
              </Etiqueta>
              <Etiqueta texto="Mes">
                <input type="month" name="mes" required defaultValue={hoy.slice(0, 7)} className={CAMPO} />
              </Etiqueta>
              <Etiqueta texto="Vence">
                <input type="date" name="vence" className={CAMPO} />
              </Etiqueta>
              <label className="flex items-center gap-2 self-end text-sm">
                <input type="checkbox" name="indiviso" className="size-4 accent-verde" /> Por indiviso
              </label>
              <Boton className="sm:col-span-4">Cargar cuota de la obra</Boton>
            </form>
            <ul className="divide-y divide-borde-suave">
              {(etapas ?? [])
                .filter((e) => e.obra_id === o.id)
                .map((e) => (
                  <li key={e.id}>
                    <form action={avanceEtapa} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <Oculto c={c} />
                      <input type="hidden" name="etapa_id" value={e.id} />
                      <span className="flex-1">{e.nombre}</span>
                      <input type="number" name="avance" min={0} max={100} defaultValue={e.avance_pct} className={`${CAMPO} w-24`} aria-label={`Avance de ${e.nombre}`} />
                      %
                      {!e.gasto_id && (
                        <label className="flex items-center gap-1">
                          <input type="checkbox" name="pagar" value="1" className="size-4 accent-verde" /> registrar pago
                        </label>
                      )}
                      <Boton estilo="claro">Guardar</Boton>
                    </form>
                  </li>
                ))}
            </ul>
          </details>
        ))}
        <details className={CAJA}>
          <summary className="cursor-pointer text-sm font-bold">Nueva obra aprobada</summary>
          <form action={guardarObra} className="grid gap-2 sm:grid-cols-2">
            <Oculto c={c} />
            <Etiqueta texto="Obra">
              <input name="nombre" required minLength={3} className={CAMPO} placeholder="Impermeabilización" />
            </Etiqueta>
            <Etiqueta texto="Presupuesto aprobado">
              <input name="presupuesto" required inputMode="decimal" className={CAMPO} />
            </Etiqueta>
            <Etiqueta texto="Proveedor">
              <select name="proveedor_id" className={CAMPO} defaultValue="">
                <option value="">—</option>
                {(proveedores ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Etiqueta>
            <Etiqueta texto="Aprobada en asamblea">
              <select name="asamblea_id" className={CAMPO} defaultValue="">
                <option value="">—</option>
                {(asambleas ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.titulo}
                  </option>
                ))}
              </select>
            </Etiqueta>
            <Etiqueta texto="Descripción" className="sm:col-span-2">
              <textarea name="descripcion" rows={2} className={`${CAMPO} py-2`} />
            </Etiqueta>
            <Etiqueta texto="Etapas (una por renglón, con % o monto)" className="sm:col-span-2">
              <textarea name="etapas" rows={3} placeholder={"Anticipo 50%\nTerminación 50%"} className={`${CAMPO} py-2`} />
            </Etiqueta>
            <Boton className="sm:col-span-2">Crear obra</Boton>
          </form>
        </details>
      </section>
    </>
  );
}
