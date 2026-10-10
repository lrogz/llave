import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { campo, Etiqueta, LineaTiempo, ListaPendientes, NuevaNota, NuevoPendiente, type Evento, type Pendiente } from "@/components/Seguimiento";
import { diasEntre, fechaConAnio, hoyMX, mediodia, plantillas } from "@/lib/crm";
import { COLOR_ESTADO, ESTADOS_TICKET, etiqueta, formatoFecha, linkWhatsApp, pesos } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";
import { SeccionDocumentos } from "@/components/Documentos";
import { origen } from "@/lib/util";
import { guardarDatosInquilino } from "../../actions";

export const metadata: Metadata = { title: "Inquilino · Black Key" };

type Inquilino = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  aval_nombre: string | null;
  aval_telefono: string | null;
};
type Contrato = {
  id: string;
  inicio: string;
  fin: string;
  renta: number;
  dia_pago: number;
  activo: boolean;
  created_at: string;
  propiedades: { id: string; nombre: string; duenos: { id: string; nombre: string } | null } | null;
  cobros_renta: { id: string; periodo: string; monto: number; recargo: number; vence: string; estado: string; pagado_at: string | null; token: string }[];
};

export default function FichaInquilino({ params }: { params: Promise<{ id: string }> }) {
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

  const { data } = await supabase.from("inquilinos").select("id, nombre, telefono, email, aval_nombre, aval_telefono").eq("id", id).maybeSingle();
  if (!data) notFound();
  const inq = data as Inquilino;

  const [cs, notas, pendientes] = await Promise.all([
    supabase
      .from("contratos")
      .select("id, inicio, fin, renta, dia_pago, activo, created_at, propiedades(id, nombre, duenos(id, nombre)), cobros_renta(id, periodo, monto, recargo, vence, estado, pagado_at, token)")
      .eq("inquilino_id", id)
      .order("inicio", { ascending: false }),
    supabase.from("notas").select("id, texto, autor_email, created_at").eq("inquilino_id", id).order("created_at", { ascending: false }).limit(50),
    supabase
      .from("pendientes")
      .select("id, titulo, de_quien, vence, hecho_at")
      .eq("inquilino_id", id)
      .order("hecho_at", { ascending: false, nullsFirst: true })
      .order("vence", { ascending: true, nullsFirst: false }),
  ]);

  const contratos = (cs.data ?? []) as unknown as Contrato[];
  const activo = contratos.find((c) => c.activo);
  const propIds = contratos.map((c) => c.propiedades?.id).filter((x): x is string => !!x);
  const filtro = propIds.length ? `inquilino_id.eq.${id},propiedad_id.in.(${propIds.join(",")})` : `inquilino_id.eq.${id}`;
  const { data: ts } = await supabase
    .from("tickets")
    .select("id, folio, titulo, estado, created_at, resuelto_at, propiedades(nombre)")
    .or(filtro)
    .order("created_at", { ascending: false })
    .limit(40);
  const tickets = (ts ?? []) as unknown as { id: string; folio: number; titulo: string; estado: string; created_at: string; resuelto_at: string | null; propiedades: { nombre: string } | null }[];

  const hoy = hoyMX();
  const volver = `/personas/inquilinos/${id}`;
  const dias = activo ? diasEntre(hoy, activo.fin) : null;
  const atrasados = (activo?.cobros_renta ?? []).filter((c) => c.estado === "vencido" || (c.estado === "pendiente" && c.vence < hoy));
  const deuda = atrasados.reduce((s, c) => s + Number(c.monto) + Number(c.recargo ?? 0), 0);
  const base = await origen();
  const abiertos = tickets.filter((t) => t.estado !== "resuelto" && t.estado !== "cancelado");

  const eventos: Evento[] = [
    ...(notas.data ?? []).map((n) => ({ fecha: n.created_at, tipo: "nota" as const, titulo: n.texto, detalle: n.autor_email })),
    ...tickets.flatMap((t) => {
      const ev: Evento[] = [{ fecha: t.created_at, tipo: "ticket", titulo: `#${t.folio} ${t.titulo}`, detalle: t.propiedades?.nombre, href: `/tickets/${t.id}` }];
      if (t.resuelto_at) ev.push({ fecha: t.resuelto_at, tipo: "resuelto", titulo: `#${t.folio} ${t.titulo}`, detalle: t.propiedades?.nombre, href: `/tickets/${t.id}` });
      return ev;
    }),
    ...contratos.map((c) => ({
      fecha: mediodia(c.inicio),
      tipo: "contrato" as const,
      titulo: `Inicia contrato · ${c.propiedades?.nombre ?? ""}`,
      detalle: `${pesos.format(c.renta)} al mes, hasta el ${fechaConAnio(c.fin)}`,
      soloFecha: true,
    })),
    ...contratos.flatMap((c) =>
      c.cobros_renta
        .filter((x) => x.pagado_at)
        .map((x) => ({ fecha: x.pagado_at!, tipo: "pago" as const, titulo: `Pagó renta de ${formatoFecha(x.periodo)}`, detalle: pesos.format(x.monto) })),
    ),
  ];

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Personas" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-7 sm:px-10">
        <Link href="/personas?ver=inquilinos" className="text-sm font-semibold text-verde">
          ‹ Inquilinos
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris">Inquilino</p>
            <h1 className="font-display text-4xl font-bold tracking-tight">{inq.nombre}</h1>
            <p className="text-sm text-gris">
              {activo ? `${activo.propiedades?.nombre ?? ""} · ${pesos.format(activo.renta)} al mes` : "Sin contrato activo"}
              {abiertos.length > 0 && ` · ${abiertos.length} ${abiertos.length === 1 ? "ticket abierto" : "tickets abiertos"}`}
            </p>
          </div>
          {inq.telefono && (
            <a
              href={linkWhatsApp(inq.telefono, plantillas.saludoInquilino(inq.nombre))}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center rounded-xl bg-verde px-4 text-sm font-bold text-white"
            >
              Escribir por WhatsApp
            </a>
          )}
        </header>

        {(atrasados.length > 0 || (dias != null && dias <= 60)) && (
          <div className="flex flex-wrap gap-3">
            {atrasados.length > 0 && activo && (
              <Aviso
                titulo={`Renta atrasada: ${pesos.format(deuda)}`}
                texto={`${atrasados.length} ${atrasados.length === 1 ? "mes" : "meses"} sin pagar`}
                link={linkWhatsApp(inq.telefono, plantillas.cobranza(inq.nombre, activo.propiedades?.nombre ?? "tu casa", pesos.format(deuda), `${base}/p/${atrasados[0].token}`))}
                boton="Recordar pago"
              />
            )}
            {dias != null && dias <= 60 && activo && (
              <Aviso
                titulo={dias < 0 ? `El contrato venció hace ${-dias} días` : `El contrato vence en ${dias} días`}
                texto={`Termina el ${fechaConAnio(activo.fin)}`}
                link={linkWhatsApp(inq.telefono, plantillas.renovacion(inq.nombre, activo.propiedades?.nombre ?? "tu casa", formatoFecha(activo.fin)))}
                boton="Preguntar si renueva"
              />
            )}
          </div>
        )}

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-5">
            <section aria-label="Temas por resolver" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Temas por resolver</h2>
              <ListaPendientes pendientes={(pendientes.data ?? []) as Pendiente[]} volver={volver} />
              <NuevoPendiente ctx={{ inquilino_id: id, propiedad_id: activo?.propiedades?.id }} volver={volver} />
            </section>

            <section aria-label="Historial" className="flex flex-col gap-4 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Historial</h2>
              <NuevaNota ctx={{ inquilino_id: id }} volver={volver} />
              <LineaTiempo eventos={eventos} />
            </section>
          </div>

          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <section aria-label="Contrato" className="flex flex-col gap-2 rounded-2xl bg-white p-5 text-sm">
              <h2 className="font-bold">Contrato</h2>
              {activo ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <dt className="text-gris">Propiedad</dt>
                  <dd>
                    {activo.propiedades && (
                      <Link href={`/propiedades/${activo.propiedades.id}`} className="font-semibold text-verde hover:underline">
                        {activo.propiedades.nombre}
                      </Link>
                    )}
                  </dd>
                  <dt className="text-gris">Dueño</dt>
                  <dd>
                    {activo.propiedades?.duenos ? (
                      <Link href={`/personas/duenos/${activo.propiedades.duenos.id}`} className="font-semibold text-verde hover:underline">
                        {activo.propiedades.duenos.nombre}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                  <dt className="text-gris">Vigencia</dt>
                  <dd>
                    {fechaConAnio(activo.inicio)} → {fechaConAnio(activo.fin)}
                  </dd>
                  <dt className="text-gris">Renta</dt>
                  <dd className="font-mono">{pesos.format(activo.renta)}</dd>
                  <dt className="text-gris">Paga</dt>
                  <dd>el día {activo.dia_pago} de cada mes</dd>
                </dl>
              ) : (
                <p className="text-gris">Sin contrato activo.</p>
              )}
            </section>

            {abiertos.length > 0 && (
              <section aria-label="Tickets abiertos" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
                <h2 className="font-bold">Tickets abiertos</h2>
                <ul className="flex flex-col gap-1">
                  {abiertos.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tickets/${t.id}`} className="flex min-h-10 items-center justify-between gap-2 rounded-xl px-2 text-sm hover:bg-fondo">
                        <span className="truncate">
                          #{t.folio} {t.titulo}
                        </span>
                        <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-bold ${COLOR_ESTADO[t.estado] ?? ""}`}>
                          {etiqueta(ESTADOS_TICKET, t.estado)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <SeccionDocumentos db={supabase} ctx={{ inquilino_id: id }} volver={volver} tipoSugerido="contrato" />

            <section aria-label="Datos del inquilino" className="rounded-2xl bg-white p-5">
              <h2 className="font-bold">Datos y aval</h2>
              <form action={guardarDatosInquilino} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="id" value={id} />
                <Etiqueta texto="Nombre">
                  <input name="nombre" required defaultValue={inq.nombre} className={campo} />
                </Etiqueta>
                <Etiqueta texto="WhatsApp">
                  <input name="telefono" type="tel" defaultValue={inq.telefono ?? ""} className={campo} />
                </Etiqueta>
                <Etiqueta texto="Correo">
                  <input name="email" type="email" defaultValue={inq.email ?? ""} className={campo} />
                </Etiqueta>
                <Etiqueta texto="Aval">
                  <input name="aval_nombre" defaultValue={inq.aval_nombre ?? ""} placeholder="Nombre del aval" className={campo} />
                </Etiqueta>
                <Etiqueta texto="Teléfono del aval">
                  <input name="aval_telefono" type="tel" defaultValue={inq.aval_telefono ?? ""} className={campo} />
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

function Aviso({ titulo, texto, link, boton }: { titulo: string; texto: string; link: string; boton: string }) {
  return (
    <div className="flex flex-[1_1_300px] items-center justify-between gap-3 rounded-2xl bg-naranja-claro p-4">
      <div>
        <p className="font-bold text-naranja-oscuro">{titulo}</p>
        <p className="text-sm text-naranja-oscuro/80">{texto}</p>
      </div>
      <a href={link} target="_blank" rel="noreferrer" className="flex min-h-11 flex-none items-center rounded-xl bg-white px-4 text-sm font-bold text-naranja-oscuro">
        {boton}
      </a>
    </div>
  );
}
