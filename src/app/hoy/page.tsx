import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Menu } from "@/components/Menu";
import { ListaPendientes, NuevoPendiente, type Pendiente } from "@/components/Seguimiento";
import { diasEntre, fechaConAnio, haceHoras, hoyMX, plantillas } from "@/lib/crm";
import { QUIEN_PAGA, TIPOS_SERVICIO, etiqueta, formatoFecha, formatoFechaHora, linkWhatsApp, origen, pesos } from "@/lib/util";
import { sesionConOrg } from "@/lib/sesion";
import { FilaReporte, type ReporteFila } from "@/components/ReporteMensual";
import { inicioDeMes, mesAnterior, mesTexto } from "@/lib/reporte";

export const metadata: Metadata = { title: "Hoy · Black Key" };

type ContratoV = {
  id: string;
  fin: string;
  renta: number;
  inquilinos: { id: string; nombre: string; telefono: string | null } | null;
  propiedades: { nombre: string } | null;
};
type AprobV = {
  id: string;
  token: string;
  created_at: string;
  duenos: { id: string; nombre: string; telefono: string | null } | null;
  cotizaciones: { monto: number | null; tickets: { id: string; folio: number; titulo: string } | null } | null;
};
type TicketP = { id: string; folio: number; titulo: string; estado: string; updated_at: string; propiedades: { nombre: string } | null };
type CobroA = {
  id: string;
  monto: number;
  recargo: number;
  vence: string;
  token: string;
  contratos: { inquilinos: { id: string; nombre: string; telefono: string | null } | null; propiedades: { nombre: string } | null } | null;
};

export default function Hoy() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const { supabase, org } = await sesionConOrg();
  const hoy = hoyMX();
  const hace48h = haceHoras(48);
  const hace3d = haceHoras(72);

  const mesPasado = mesAnterior(inicioDeMes(hoy));
  await supabase.rpc("actualizar_cobros", { org: org.id }); // genera rentas del mes y marca atrasos
  const [pend, contratos, aprob, parados, cobros, duenosQ, porRevisar, recibosQ, docsQ] = await Promise.all([
    supabase
      .from("pendientes")
      .select("id, titulo, de_quien, vence, hecho_at, duenos(id, nombre), inquilinos(id, nombre), propiedades(id, nombre)")
      .is("hecho_at", null)
      .order("vence", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from("contratos")
      .select("id, fin, renta, inquilinos(id, nombre, telefono), propiedades(nombre)")
      .eq("activo", true)
      .lte("fin", hoyMX(90))
      .order("fin"),
    supabase
      .from("aprobaciones")
      .select("id, token, created_at, duenos(id, nombre, telefono), cotizaciones(monto, tickets(id, folio, titulo))")
      .is("decision", null)
      .lt("created_at", hace48h)
      .order("created_at"),
    supabase
      .from("tickets")
      .select("id, folio, titulo, estado, updated_at, propiedades(nombre)")
      .not("estado", "in", "(resuelto,cancelado)")
      .lt("updated_at", hace3d)
      .order("updated_at"),
    supabase
      .from("cobros_renta")
      .select("id, monto, recargo, vence, token, contratos(inquilinos(id, nombre, telefono), propiedades(nombre))")
      .or(`estado.eq.vencido,and(estado.eq.pendiente,vence.lt.${hoy})`)
      .order("vence"),
    supabase
      .from("duenos")
      .select("id, nombre, telefono, frecuencia_reporte, propiedades(id), reportes_dueno(periodo, token, visto_at, created_at)")
      .neq("frecuencia_reporte", "solo_cambios")
      .eq("reportes_dueno.periodo", mesPasado)
      .order("nombre"),
    supabase.from("cobros_renta").select("id", { count: "exact", head: true }).eq("estado", "por_confirmar"),
    supabase
      .from("recibos_servicio")
      .select("id, vence, estado, servicios(tipo, quien_paga, propiedades(id, nombre))")
      .in("estado", ["pendiente", "vencido"])
      .lte("vence", hoyMX(3))
      .order("vence"),
    supabase
      .from("documentos")
      .select("id, nombre, vence, propiedades(id, nombre), duenos(id, nombre), inquilinos(id, nombre)")
      .not("vence", "is", null)
      .lte("vence", hoyMX(30))
      .order("vence"),
  ]);
  const recibos = (recibosQ.data ?? []) as unknown as {
    id: string;
    vence: string;
    estado: string;
    servicios: { tipo: string; quien_paga: string; propiedades: { id: string; nombre: string } | null } | null;
  }[];
  const docsVencen = (docsQ.data ?? []) as unknown as {
    id: string;
    nombre: string;
    vence: string;
    propiedades: { id: string; nombre: string } | null;
    duenos: { id: string; nombre: string } | null;
    inquilinos: { id: string; nombre: string } | null;
  }[];

  const pendientes = (pend.data ?? []) as unknown as Pendiente[];
  const urgentes = pendientes.filter((p) => p.vence && p.vence <= hoy);
  const semana = pendientes.filter((p) => p.vence && p.vence > hoy && p.vence <= hoyMX(7));
  const despues = pendientes.filter((p) => !p.vence || p.vence > hoyMX(7));
  const porVencer = (contratos.data ?? []) as unknown as ContratoV[];
  const sinRespuesta = (aprob.data ?? []) as unknown as AprobV[];
  const ticketsParados = (parados.data ?? []) as unknown as TicketP[];
  const atrasados = (cobros.data ?? []) as unknown as CobroA[];
  const base = await origen();
  // Reportes del mes pasado: falta prepararlos o el dueño todavía no los abre (hasta 7 días después de mandarlos).
  const reportes = ((duenosQ.data ?? []) as unknown as {
    id: string;
    nombre: string;
    telefono: string | null;
    propiedades: { id: string }[];
    reportes_dueno: ReporteFila[];
  }[])
    .filter((d) => d.propiedades.length > 0)
    .map((d) => ({ d, r: d.reportes_dueno[0] }))
    .filter(({ r }) => !r || (!r.visto_at && diasEntre(r.created_at.slice(0, 10), hoy) <= 7));

  const tarjetas = [
    { n: urgentes.length, texto: "pendientes para hoy o vencidos", href: "#pendientes" },
    { n: porVencer.length, texto: "contratos vencen en 90 días", href: "#contratos" },
    { n: sinRespuesta.length, texto: "aprobaciones sin respuesta", href: "#aprobaciones" },
    { n: ticketsParados.length, texto: "tickets parados +3 días", href: "#tickets" },
    { n: atrasados.length, texto: "rentas atrasadas", href: "#rentas" },
    { n: porRevisar.count ?? 0, texto: "comprobantes de pago por revisar", href: "/pagos" },
    { n: recibos.length, texto: "servicios vencidos o por vencer", href: "#servicios" },
    { n: docsVencen.length, texto: "documentos que vencen en 30 días", href: "#documentos" },
    { n: reportes.filter(({ r }) => !r).length, texto: "reportes a dueños por preparar", href: "#reportes" },
  ];
  const nada = tarjetas.every((t) => t.n === 0);
  const volver = "/hoy";

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Hoy" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <header>
          <p className="text-sm font-semibold text-gris first-letter:uppercase">{formatoFecha(hoy)}</p>
          <h1 className="font-display text-4xl font-bold tracking-tight">Hoy</h1>
          <p className="mt-1 text-gris">{nada ? "Todo al día. Nada urgente que atender." : "Lo que necesita tu atención, en orden."}</p>
        </header>

        <ul aria-label="Resumen" className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
          {tarjetas.map((t) => (
            <li key={t.href}>
              <a href={t.href} className={`flex h-full flex-col gap-1 rounded-2xl p-4 ${t.n > 0 ? "bg-white" : "bg-white/60 text-gris"}`}>
                <span className={`font-display text-3xl font-bold ${t.n > 0 ? "text-tinta" : ""}`}>{t.n}</span>
                <span className="text-sm">{t.texto}</span>
              </a>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-start gap-5">
          <section id="pendientes" aria-label="Temas por resolver" className="flex min-w-0 flex-[1.3_1_380px] flex-col gap-3 rounded-2xl bg-white p-5">
            <h2 className="font-bold">Temas por resolver</h2>
            {urgentes.length > 0 && <Sub texto="Hoy y vencidos" />}
            {urgentes.length > 0 && <ListaPendientes pendientes={urgentes} volver={volver} mostrarPersona />}
            {semana.length > 0 && <Sub texto="Esta semana" />}
            {semana.length > 0 && <ListaPendientes pendientes={semana} volver={volver} mostrarPersona />}
            {despues.length > 0 && <Sub texto="Más adelante" />}
            {despues.length > 0 && <ListaPendientes pendientes={despues} volver={volver} mostrarPersona />}
            {pendientes.length === 0 && <p className="text-sm text-gris">Nada pendiente. 🎉</p>}
            <NuevoPendiente ctx={{}} volver={volver} />
          </section>

          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
            <Bloque id="reportes" titulo={`Reportes de ${mesTexto(mesPasado)} a dueños`} vacio="Todos los dueños ya tienen y abrieron su reporte.">
              {reportes.map(({ d, r }) => (
                <FilaReporte key={d.id} dueno={d} periodo={mesPasado} reporte={r} base={base} volver={volver} conNombre />
              ))}
            </Bloque>

            <Bloque id="contratos" titulo="Contratos por vencer" vacio="Ningún contrato vence en los próximos 90 días.">
              {porVencer.map((c) => {
                const d = diasEntre(hoy, c.fin);
                return (
                  <Fila
                    key={c.id}
                    href={c.inquilinos ? `/personas/inquilinos/${c.inquilinos.id}` : undefined}
                    titulo={`${c.inquilinos?.nombre ?? "Inquilino"} · ${c.propiedades?.nombre ?? ""}`}
                    detalle={d < 0 ? `Venció hace ${-d} días` : d <= 30 ? `Vence en ${d} días` : `Vence el ${fechaConAnio(c.fin)}`}
                    urgente={d <= 30}
                    accion={
                      c.inquilinos?.telefono
                        ? { texto: "Preguntar si renueva", href: linkWhatsApp(c.inquilinos.telefono, plantillas.renovacion(c.inquilinos.nombre, c.propiedades?.nombre ?? "tu casa", formatoFecha(c.fin))) }
                        : undefined
                    }
                  />
                );
              })}
            </Bloque>

            <Bloque id="aprobaciones" titulo="Aprobaciones sin respuesta (+48 h)" vacio="Los dueños están al día.">
              {sinRespuesta.map((a) => {
                const t = a.cotizaciones?.tickets;
                return (
                  <Fila
                    key={a.id}
                    href={t ? `/tickets/${t.id}` : undefined}
                    titulo={`${a.duenos?.nombre ?? "Dueño"} · #${t?.folio ?? ""} ${t?.titulo ?? ""}`}
                    detalle={`Enviada ${formatoFechaHora(a.created_at)}${a.cotizaciones?.monto != null ? ` · ${pesos.format(a.cotizaciones.monto)}` : ""}`}
                    urgente
                    accion={{
                      texto: "Recordarle",
                      href: linkWhatsApp(a.duenos?.telefono, plantillas.aprobacionPendiente(a.duenos?.nombre ?? "", t?.titulo ?? "la cotización", `${base}/a/${a.token}`)),
                    }}
                  />
                );
              })}
            </Bloque>

            <Bloque id="tickets" titulo="Tickets parados (+3 días sin movimiento)" vacio="Todos los tickets se están moviendo.">
              {ticketsParados.map((t) => (
                <Fila
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  titulo={`#${t.folio} ${t.titulo}`}
                  detalle={`${t.propiedades?.nombre ?? ""} · sin cambios desde ${formatoFecha(t.updated_at)}`}
                  urgente={diasEntre(t.updated_at.slice(0, 10), hoy) > 7}
                />
              ))}
            </Bloque>

            <Bloque id="servicios" titulo="Servicios (luz, agua, predial…)" vacio="Ningún servicio vencido ni por vencer.">
              {recibos.map((r) => (
                <Fila
                  key={r.id}
                  href="/pagos#servicios"
                  titulo={`${etiqueta(TIPOS_SERVICIO, r.servicios?.tipo)} · ${r.servicios?.propiedades?.nombre ?? ""}`}
                  detalle={`${r.estado === "vencido" ? "Venció" : "Vence"} ${formatoFecha(r.vence)} · paga ${etiqueta(QUIEN_PAGA, r.servicios?.quien_paga).toLowerCase()}`}
                  urgente={r.estado === "vencido"}
                />
              ))}
            </Bloque>

            <Bloque id="documentos" titulo="Documentos por vencer" vacio="Ningún documento vence en los próximos 30 días.">
              {docsVencen.map((d) => {
                const de = d.propiedades
                  ? { href: `/propiedades/${d.propiedades.id}`, nombre: d.propiedades.nombre }
                  : d.inquilinos
                    ? { href: `/personas/inquilinos/${d.inquilinos.id}`, nombre: d.inquilinos.nombre }
                    : d.duenos
                      ? { href: `/personas/duenos/${d.duenos.id}`, nombre: d.duenos.nombre }
                      : null;
                return (
                  <Fila
                    key={d.id}
                    href={de?.href}
                    titulo={`${d.nombre}${de ? ` · ${de.nombre}` : ""}`}
                    detalle={d.vence < hoy ? `Venció el ${fechaConAnio(d.vence)}` : `Vence el ${fechaConAnio(d.vence)}`}
                    urgente={d.vence <= hoyMX(7)}
                  />
                );
              })}
            </Bloque>

            <Bloque id="rentas" titulo="Rentas atrasadas" vacio="Todas las rentas al corriente.">
              {atrasados.map((c) => {
                const i = c.contratos?.inquilinos;
                return (
                  <Fila
                    key={c.id}
                    href={i ? `/personas/inquilinos/${i.id}` : undefined}
                    titulo={`${i?.nombre ?? "Inquilino"} · ${pesos.format(Number(c.monto) + Number(c.recargo ?? 0))}`}
                    detalle={`${c.contratos?.propiedades?.nombre ?? ""} · venció ${formatoFecha(c.vence)}`}
                    urgente
                    accion={
                      i?.telefono
                        ? { texto: "Recordar pago", href: linkWhatsApp(i.telefono, plantillas.cobranza(i.nombre, c.contratos?.propiedades?.nombre ?? "tu casa", pesos.format(Number(c.monto) + Number(c.recargo ?? 0)), `${base}/p/${c.token}`)) }
                        : undefined
                    }
                  />
                );
              })}
            </Bloque>
          </div>
        </div>
      </main>
    </div>
  );
}

function Sub({ texto }: { texto: string }) {
  return <h3 className="pt-1 text-xs font-bold uppercase tracking-wide text-gris">{texto}</h3>;
}

function Bloque({ id, titulo, vacio, children }: { id: string; titulo: string; vacio: string; children: React.ReactNode[] }) {
  return (
    <section id={id} aria-label={titulo} className="flex flex-col gap-2 rounded-2xl bg-white p-5">
      <h2 className="font-bold">{titulo}</h2>
      {children.length ? <ul className="flex flex-col divide-y divide-borde-suave">{children}</ul> : <p className="text-sm text-gris">{vacio}</p>}
    </section>
  );
}

function Fila({
  titulo,
  detalle,
  href,
  urgente,
  accion,
}: {
  titulo: string;
  detalle: string;
  href?: string;
  urgente?: boolean;
  accion?: { texto: string; href: string };
}) {
  const texto = (
    <>
      <span className="block truncate text-sm font-semibold">{titulo}</span>
      <span className={`text-xs ${urgente ? "font-semibold text-naranja-oscuro" : "text-gris"}`}>{detalle}</span>
    </>
  );
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      {href ? (
        <Link href={href} className="min-w-0 hover:underline">
          {texto}
        </Link>
      ) : (
        <span className="min-w-0">{texto}</span>
      )}
      {accion && (
        <a href={accion.href} target="_blank" rel="noreferrer" className="flex min-h-10 flex-none items-center rounded-xl border border-borde px-3 text-xs font-bold hover:border-verde">
          {accion.texto}
        </a>
      )}
    </li>
  );
}
