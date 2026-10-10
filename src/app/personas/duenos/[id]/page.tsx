import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { campo, Etiqueta, LineaTiempo, ListaPendientes, NuevaNota, NuevoPendiente, type Evento, type Pendiente } from "@/components/Seguimiento";
import { CANALES, FRECUENCIAS, plantillas } from "@/lib/crm";
import { COLOR_ESTADO, ESTADOS_TICKET, etiqueta, linkWhatsApp, pesos } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";
import { SeccionDocumentos } from "@/components/Documentos";
import { FilaReporte, type ReporteFila } from "@/components/ReporteMensual";
import { inicioDeMes, mesAnterior } from "@/lib/reporte";
import { origen } from "@/lib/util";
import { hoyMX } from "@/lib/crm";
import { asignarPropiedad, guardarDatosDueno } from "../../actions";

export const metadata: Metadata = { title: "Dueño · Black Key" };

type Dueno = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  comision_pct: number | null;
  canal_preferido: string;
  frecuencia_reporte: string;
  created_at: string;
};
type Prop = {
  id: string;
  nombre: string;
  estado: string;
  renta_mensual: number | null;
  tickets: { id: string; folio: number; titulo: string; estado: string; created_at: string; resuelto_at: string | null }[];
};
type Aprob = {
  id: string;
  created_at: string;
  decision: string | null;
  decidida_at: string | null;
  comentario: string | null;
  cotizaciones: { monto: number | null; tickets: { id: string; titulo: string } | null } | null;
};

export default function FichaDueno({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await sesionConOrg();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await supabase
    .from("duenos")
    .select("id, nombre, telefono, email, comision_pct, canal_preferido, frecuencia_reporte, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const d = data as Dueno;

  const [props, libres, notas, pendientes, aprobaciones, reportes] = await Promise.all([
    supabase
      .from("propiedades")
      .select("id, nombre, estado, renta_mensual, tickets(id, folio, titulo, estado, created_at, resuelto_at)")
      .eq("dueno_id", id)
      .order("nombre"),
    supabase.from("propiedades").select("id, nombre").is("dueno_id", null).order("nombre"),
    supabase.from("notas").select("id, texto, autor_email, created_at").eq("dueno_id", id).order("created_at", { ascending: false }).limit(50),
    supabase
      .from("pendientes")
      .select("id, titulo, de_quien, vence, hecho_at")
      .eq("dueno_id", id)
      .order("hecho_at", { ascending: false, nullsFirst: true })
      .order("vence", { ascending: true, nullsFirst: false }),
    supabase
      .from("aprobaciones")
      .select("id, created_at, decision, decidida_at, comentario, cotizaciones(monto, tickets(id, titulo))")
      .eq("dueno_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("reportes_dueno").select("periodo, token, visto_at, created_at").eq("dueno_id", id).order("periodo", { ascending: false }).limit(12),
  ]);
  const base = await origen();
  const mesActual = inicioDeMes(hoyMX());
  const meses = [mesAnterior(mesActual), mesActual];
  const porMes = new Map(((reportes.data ?? []) as ReporteFila[]).map((r) => [r.periodo, r]));

  const propiedades = (props.data ?? []) as Prop[];
  const volver = `/personas/duenos/${id}`;
  const abiertos = propiedades.flatMap((p) => p.tickets.filter((t) => t.estado !== "resuelto" && t.estado !== "cancelado").map((t) => ({ ...t, propiedad: p.nombre })));
  const rentaTotal = propiedades.reduce((s, p) => s + (p.estado === "rentada" ? (p.renta_mensual ?? 0) : 0), 0);

  const eventos: Evento[] = [
    ...(notas.data ?? []).map((n) => ({ fecha: n.created_at, tipo: "nota" as const, titulo: n.texto, detalle: n.autor_email })),
    ...propiedades.flatMap((p) =>
      p.tickets.flatMap((t) => {
        const ev: Evento[] = [{ fecha: t.created_at, tipo: "ticket", titulo: `#${t.folio} ${t.titulo}`, detalle: p.nombre, href: `/tickets/${t.id}` }];
        if (t.resuelto_at) ev.push({ fecha: t.resuelto_at, tipo: "resuelto", titulo: `#${t.folio} ${t.titulo}`, detalle: p.nombre, href: `/tickets/${t.id}` });
        return ev;
      }),
    ),
    ...((aprobaciones.data ?? []) as unknown as Aprob[]).flatMap((a) => {
      const t = a.cotizaciones?.tickets;
      const monto = a.cotizaciones?.monto != null ? pesos.format(a.cotizaciones.monto) : "";
      const ev: Evento[] = [{ fecha: a.created_at, tipo: "aprobacion", titulo: `Se le pidió aprobar: ${t?.titulo ?? "cotización"}`, detalle: monto, href: t ? `/tickets/${t.id}` : undefined }];
      if (a.decidida_at)
        ev.push({
          fecha: a.decidida_at,
          tipo: "decision",
          titulo: `${a.decision === "aprobada" ? "Aprobó" : "Rechazó"}: ${t?.titulo ?? "cotización"}`,
          detalle: a.comentario,
          href: t ? `/tickets/${t.id}` : undefined,
        });
      return ev;
    }),
  ];

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Personas" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-7 sm:px-10">
        <Link href="/personas?ver=duenos" className="text-sm font-semibold text-verde">
          ‹ Dueños
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris">Dueño</p>
            <h1 className="font-display text-4xl font-bold tracking-tight">{d.nombre}</h1>
            <p className="text-sm text-gris">
              {propiedades.length} {propiedades.length === 1 ? "propiedad" : "propiedades"}
              {rentaTotal > 0 && ` · ${pesos.format(rentaTotal)} al mes en rentas`}
              {abiertos.length > 0 && ` · ${abiertos.length} ${abiertos.length === 1 ? "ticket abierto" : "tickets abiertos"}`}
            </p>
          </div>
          {d.telefono && (
            <a
              href={linkWhatsApp(d.telefono, plantillas.saludoDueno(d.nombre))}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center rounded-xl bg-verde px-4 text-sm font-bold text-white"
            >
              Escribir por WhatsApp
            </a>
          )}
        </header>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-5">
            <section aria-label="Temas por resolver" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Temas por resolver</h2>
              <ListaPendientes pendientes={(pendientes.data ?? []) as Pendiente[]} volver={volver} />
              <NuevoPendiente ctx={{ dueno_id: id }} volver={volver} />
            </section>

            <section aria-label="Historial" className="flex flex-col gap-4 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Historial</h2>
              <NuevaNota ctx={{ dueno_id: id }} volver={volver} />
              <LineaTiempo eventos={eventos} />
            </section>
          </div>

          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <section aria-label="Propiedades del dueño" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Propiedades</h2>
              {propiedades.length === 0 && <p className="text-sm text-gris">Sin propiedades asignadas.</p>}
              <ul className="flex flex-col gap-1">
                {propiedades.map((p) => (
                  <li key={p.id}>
                    <Link href={`/propiedades/${p.id}`} className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-2 text-sm hover:bg-fondo">
                      <span className="truncate font-semibold">{p.nombre}</span>
                      <span className="flex-none text-gris">{p.renta_mensual != null ? pesos.format(p.renta_mensual) : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {abiertos.length > 0 && (
                <ul className="flex flex-col gap-1 border-t border-borde-suave pt-3">
                  {abiertos.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tickets/${t.id}`} className="flex min-h-10 items-center justify-between gap-2 rounded-xl px-2 text-sm hover:bg-fondo">
                        <span className="truncate">
                          #{t.folio} {t.titulo}
                          <span className="text-gris"> · {t.propiedad}</span>
                        </span>
                        <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-bold ${COLOR_ESTADO[t.estado] ?? ""}`}>
                          {etiqueta(ESTADOS_TICKET, t.estado)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {(libres.data ?? []).length > 0 && (
                <form action={asignarPropiedad} className="flex gap-2 border-t border-borde-suave pt-3">
                  <input type="hidden" name="dueno_id" value={id} />
                  <select name="propiedad_id" required aria-label="Propiedad sin dueño" className={`${campo} flex-1`} defaultValue="">
                    <option value="" disabled>
                      Asignar propiedad…
                    </option>
                    {(libres.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <Boton estilo="claro" enviando="…">
                    Asignar
                  </Boton>
                </form>
              )}
            </section>

            <section id="reporte" aria-label="Reporte mensual" className="flex flex-col gap-1 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Reporte mensual</h2>
              <p className="text-sm text-gris">Rentas, trabajos con fotos de antes y después, gastos y saldo. Un link para mandar por WhatsApp.</p>
              <ul className="flex flex-col divide-y divide-borde-suave">
                {meses.map((m) => (
                  <FilaReporte key={m} dueno={d} periodo={m} reporte={porMes.get(m)} base={base} volver={volver} />
                ))}
              </ul>
            </section>

            <SeccionDocumentos db={supabase} ctx={{ dueno_id: id }} volver={volver} tipoSugerido="identificacion" />

            <section aria-label="Datos del dueño" className="rounded-2xl bg-white p-5">
              <h2 className="font-bold">Datos y preferencias</h2>
              <form action={guardarDatosDueno} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="id" value={id} />
                <Etiqueta texto="Nombre">
                  <input name="nombre" required defaultValue={d.nombre} className={campo} />
                </Etiqueta>
                <Etiqueta texto="WhatsApp">
                  <input name="telefono" type="tel" defaultValue={d.telefono ?? ""} className={campo} />
                </Etiqueta>
                <Etiqueta texto="Correo">
                  <input name="email" type="email" defaultValue={d.email ?? ""} className={campo} />
                </Etiqueta>
                <Etiqueta texto="Comisión de administración (%)">
                  <input name="comision_pct" inputMode="decimal" defaultValue={d.comision_pct ?? ""} placeholder="10" className={campo} />
                </Etiqueta>
                <Etiqueta texto="Prefiere que le avisen por">
                  <select name="canal_preferido" defaultValue={d.canal_preferido} className={campo}>
                    {CANALES.map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Etiqueta>
                <Etiqueta texto="Reporte de sus propiedades">
                  <select name="frecuencia_reporte" defaultValue={d.frecuencia_reporte} className={campo}>
                    {FRECUENCIAS.map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Etiqueta>
                <Boton className="mt-1 self-start" estilo="claro">
                  Guardar cambios
                </Boton>
              </form>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
