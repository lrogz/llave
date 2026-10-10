import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarReporte, mesTexto, type Foto, type Trabajo } from "@/lib/reporte";
import { BUCKET, COLOR_ESTADO, ESTADOS_TICKET, etiqueta, formatoFecha, pesos } from "@/lib/datos";
import { origen } from "@/lib/util";

export const metadata: Metadata = { title: "Reporte de tus propiedades · Black Key", robots: { index: false } };

export default function ReporteDueno({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ vista?: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-6 print:max-w-none">
      <Logo />
      <Suspense fallback={<p className="text-sm text-gris">Cargando…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const COBRO: Record<string, { texto: string; clase: string }> = {
  pagado: { texto: "Pagada", clase: "bg-verde-claro text-verde-oscuro" },
  por_confirmar: { texto: "Por confirmar", clase: "bg-[#FFF4E0] text-[#7A4E00]" },
  pendiente: { texto: "Pendiente", clase: "bg-[#FFF4E0] text-[#7A4E00]" },
  vencido: { texto: "Atrasada", clase: "bg-naranja-claro text-naranja-oscuro" },
  condonado: { texto: "Condonada", clase: "bg-fondo text-gris" },
};

async function Contenido({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ vista?: string }> }) {
  await connection();
  const { token } = await params;
  const { vista } = await searchParams;
  if (!/^[0-9a-f]{32}$/.test(token)) return <Invalido />;

  const admin = createAdminClient();
  const { data: r } = await admin
    .from("reportes_dueno")
    .select("id, dueno_id, periodo, visto_at, organizaciones(nombre)")
    .eq("token", token)
    .maybeSingle();
  if (!r) return <Invalido />;
  // La primera vez que el dueño lo abre queda registrado (la vista previa de la administradora no cuenta).
  if (!r.visto_at && vista !== "admin") await admin.from("reportes_dueno").update({ visto_at: new Date().toISOString() }).eq("id", r.id);

  const rep = await armarReporte(admin, r.dueno_id, r.periodo);
  if (!rep) return <Invalido />;
  const org = (r.organizaciones as unknown as { nombre: string } | null)?.nombre ?? "";

  const rutas = [...rep.resueltos, ...rep.enCurso].flatMap((t) => [...t.antes, ...t.despues]).map((f) => f.path);
  const { data: firmadas } = rutas.length ? await admin.storage.from(BUCKET).createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  const base = await origen();
  const t = rep.totales;

  return (
    <>
      <header>
        <p className="text-sm text-gris">
          {org} · Reporte de {mesTexto(rep.periodo)}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Hola {rep.dueno.nombre.split(" ")[0]}, así van tus propiedades
        </h1>
      </header>

      <section aria-label="Resumen del mes" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cifra titulo="Renta cobrada" valor={pesos.format(t.rentaCobrada)} nota={t.rentaEsperada > t.rentaCobrada ? `de ${pesos.format(t.rentaEsperada)}` : undefined} />
        <Cifra titulo="Mantenimiento" valor={t.gastos ? `−${pesos.format(t.gastos)}` : pesos.format(0)} />
        <Cifra titulo={`Comisión${rep.dueno.comision_pct ? ` (${Number(rep.dueno.comision_pct)}%)` : ""}`} valor={t.comision ? `−${pesos.format(t.comision)}` : pesos.format(0)} />
        <Cifra titulo={t.saldo < 0 ? "Saldo a cubrir" : "Para ti"} valor={t.saldo < 0 ? `−${pesos.format(-t.saldo)}` : pesos.format(t.saldo)} fuerte />
      </section>

      {rep.aprobacionesPendientes.length > 0 && (
        <section aria-label="Necesitamos tu aprobación" className="flex flex-col gap-2 rounded-2xl bg-[#FFF4E0] p-5">
          <h2 className="font-bold text-[#7A4E00]">Necesitamos tu aprobación</h2>
          {rep.aprobacionesPendientes.map((a) => (
            <a key={a.token} href={`${base}/a/${a.token}`} className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-white px-4 text-sm font-semibold">
              <span>{a.titulo}</span>
              <span className="font-mono">{a.monto != null ? pesos.format(a.monto) : "Ver"} →</span>
            </a>
          ))}
        </section>
      )}

      <section aria-label="Rentas" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
        <h2 className="font-bold">Rentas del mes</h2>
        {rep.cobros.length === 0 ? (
          <p className="text-sm text-gris">No hubo cobros de renta registrados este mes.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borde-suave">
            {rep.cobros.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">{c.propiedad}</span>
                  <span className="text-gris">
                    {c.inquilino ?? ""}
                    {c.pagado_at ? ` · pagó ${formatoFecha(c.pagado_at)}` : ` · vence ${formatoFecha(c.vence)}`}
                  </span>
                </span>
                <span className="flex flex-none items-center gap-2">
                  <span className="font-mono">{pesos.format(c.monto)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COBRO[c.estado]?.clase ?? ""}`}>{COBRO[c.estado]?.texto ?? c.estado}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Trabajos realizados" className="flex flex-col gap-4 rounded-2xl bg-white p-5">
        <h2 className="font-bold">Trabajos realizados</h2>
        {rep.resueltos.length === 0 ? (
          <p className="text-sm text-gris">Este mes no hubo reparaciones. 👌</p>
        ) : (
          rep.resueltos.map((tr) => <TrabajoCard key={tr.id} t={tr} url={url} />)
        )}
      </section>

      {rep.enCurso.length > 0 && (
        <section aria-label="En curso" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
          <h2 className="font-bold">En curso</h2>
          <ul className="flex flex-col divide-y divide-borde-suave">
            {rep.enCurso.map((tr) => (
              <li key={tr.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">{tr.titulo}</span>
                  <span className="text-gris">{tr.propiedad}</span>
                </span>
                <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-bold ${COLOR_ESTADO[tr.estado] ?? ""}`}>{etiqueta(ESTADOS_TICKET, tr.estado)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Tus propiedades" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
        <h2 className="font-bold">Tus propiedades</h2>
        <ul className="flex flex-col divide-y divide-borde-suave text-sm">
          {rep.propiedades.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2.5">
              <span className="font-semibold">{p.nombre}</span>
              <span className="text-gris">{p.estado === "rentada" ? "Rentada" : p.estado === "vacia" ? "Disponible" : "En mantenimiento"}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="pb-6 text-center text-xs text-gris">
        Preparado por {org} con Black Key · ¿Dudas? Responde al mensaje donde te llegó este link.
      </p>
    </>
  );
}

function Cifra({ titulo, valor, nota, fuerte }: { titulo: string; valor: string; nota?: string; fuerte?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl p-4 ${fuerte ? "bg-tinta text-white" : "bg-white"}`}>
      <span className={`text-xs font-semibold ${fuerte ? "text-[#B9C8C1]" : "text-gris"}`}>{titulo}</span>
      <span className="font-mono text-xl font-bold">{valor}</span>
      {nota && <span className="text-xs text-gris">{nota}</span>}
    </div>
  );
}

function TrabajoCard({ t, url }: { t: Trabajo; url: Map<string | null, string | null> }) {
  const fotos = (lista: Foto[], titulo: string) =>
    lista.length > 0 && (
      <figure className="flex min-w-0 flex-1 flex-col gap-1">
        <figcaption className="text-xs font-bold uppercase tracking-wide text-gris">{titulo}</figcaption>
        <div className="grid grid-cols-2 gap-1.5">
          {lista.map((f) => {
            const src = url.get(f.path);
            return src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.path} src={src} alt={`${titulo}: ${t.titulo}`} className="aspect-square w-full rounded-lg object-cover" />
            ) : null;
          })}
        </div>
      </figure>
    );
  return (
    <article className="flex flex-col gap-3 border-t border-borde-suave pt-4 first-of-type:border-0 first-of-type:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t.titulo}</h3>
          <p className="text-sm text-gris">
            {t.propiedad}
            {t.resuelto_at ? ` · resuelto ${formatoFecha(t.resuelto_at)}` : ""}
            {t.proveedor ? ` · ${t.proveedor}` : ""}
          </p>
        </div>
        {t.monto != null && (
          <span className="flex-none text-right text-sm">
            <span className="block font-mono font-bold">{pesos.format(t.monto)}</span>
            <span className="text-xs text-gris">{t.quien_paga === "dueno" ? "a tu cargo" : t.quien_paga === "inquilino" ? "lo pagó el inquilino" : ""}</span>
          </span>
        )}
      </div>
      {(t.antes.length > 0 || t.despues.length > 0) && (
        <div className="flex gap-3">
          {fotos(t.antes, "Antes")}
          {fotos(t.despues, "Después")}
        </div>
      )}
    </article>
  );
}

function Invalido() {
  return <p className="rounded-2xl bg-white p-6 text-sm">Este link ya no es válido. Pídele a tu administradora uno nuevo.</p>;
}
