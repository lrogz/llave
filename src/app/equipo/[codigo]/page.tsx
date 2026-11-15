import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cargando, Menu } from "@/components/Menu";
import { sesionConOrg } from "@/lib/sesion";
import { BUCKET } from "@/lib/datos";
import { cuando, dinero, esToken, hoyCDMX } from "@/lib/condominios";

export const metadata: Metadata = { title: "Equipo · Black Key", robots: { index: false, follow: false } };

// Lo que ve el equipo de la administradora al escanear el QR pegado en un equipo: historial, gastos, evidencias y garantía.
export default function Equipo({ params }: { params: Promise<{ codigo: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ codigo: string }> }) {
  const s = await sesionConOrg();
  const { codigo } = await params;
  if (!esToken(codigo)) notFound();
  const { data: e } = await s.supabase
    .from("equipos_condominio")
    .select("id, condominio_id, nombre, tipo, ubicacion, marca, modelo, serie, instalado, garantia_hasta, notas, proveedores(nombre, telefono), condominios(nombre)")
    .eq("codigo", codigo)
    .maybeSingle();
  if (!e) notFound();
  const [{ data: tickets }, { data: gastos }] = await Promise.all([
    s.supabase.from("tickets").select("id, folio, titulo, estado, created_at, resuelto_at, resolucion").eq("equipo_id", e.id).order("created_at", { ascending: false }).limit(50),
    s.supabase.from("gastos_condominio").select("id, descripcion, monto_centavos, fecha, comprobante_path, proveedores(nombre)").eq("equipo_id", e.id).order("fecha", { ascending: false }).limit(50),
  ]);
  const rutas = (gastos ?? []).map((g) => g.comprobante_path).filter((x): x is string => !!x);
  const { data: firmadas } = rutas.length ? await s.supabase.storage.from(BUCKET).createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  const total = (gastos ?? []).reduce((a, g) => a + Number(g.monto_centavos), 0);
  const prov = e.proveedores as unknown as { nombre: string; telefono: string | null } | null;
  const vencida = e.garantia_hasta && e.garantia_hasta < hoyCDMX();
  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Condominios" nombreOrg={s.org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <header>
          <Link href={`/condominios/${e.condominio_id}?vista=obras`} className="text-sm font-semibold text-gris">
            ‹ {(e.condominios as unknown as { nombre: string } | null)?.nombre}
          </Link>
          <h1 className="font-display text-4xl font-bold tracking-tight">{e.nombre}</h1>
          <p className="text-sm text-gris">{[e.ubicacion, e.marca, e.modelo, e.serie && `serie ${e.serie}`].filter(Boolean).join(" · ")}</p>
        </header>
        <dl className="grid gap-3 sm:grid-cols-4">
          {[
            ["Instalado", e.instalado ?? "—"],
            ["Garantía", e.garantia_hasta ? `${vencida ? "Venció" : "Hasta"} ${e.garantia_hasta}` : "—"],
            ["Proveedor", prov ? `${prov.nombre}${prov.telefono ? ` · ${prov.telefono}` : ""}` : "—"],
            ["Gastado", dinero(total)],
          ].map(([t, v]) => (
            <div key={t} className="rounded-2xl bg-white p-4">
              <dt className="text-xs text-gris">{t}</dt>
              <dd className={`font-bold ${t === "Garantía" && vencida ? "text-naranja-oscuro" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
        {e.notas && <p className="rounded-2xl bg-white p-4 text-sm whitespace-pre-line">{e.notas}</p>}
        <section className="flex flex-col gap-2 rounded-2xl bg-white p-5">
          <h2 className="font-display text-xl font-bold">Reparaciones y reportes</h2>
          {tickets?.length ? (
            <ul className="divide-y divide-borde-suave text-sm">
              {tickets.map((t) => (
                <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <Link href={`/tickets/${t.id}`} className="underline">
                    #{t.folio} {t.titulo}
                  </Link>
                  <span className="text-gris">
                    {t.estado} · {cuando(t.created_at)}
                  </span>
                  {t.resolucion && <p className="w-full text-gris">{t.resolucion}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gris">Sin reportes ligados. Liga un ticket a este equipo desde el ticket.</p>
          )}
        </section>
        <section className="flex flex-col gap-2 rounded-2xl bg-white p-5">
          <h2 className="font-display text-xl font-bold">Gastos y evidencias</h2>
          {gastos?.length ? (
            <ul className="divide-y divide-borde-suave text-sm">
              {gastos.map((g) => (
                <li key={g.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {g.fecha} · {g.descripcion}
                    {(g.proveedores as unknown as { nombre: string } | null)?.nombre ? ` · ${(g.proveedores as unknown as { nombre: string }).nombre}` : ""}
                  </span>
                  <span className="flex gap-3">
                    <b className="tabular-nums">{dinero(g.monto_centavos)}</b>
                    {g.comprobante_path && url.get(g.comprobante_path) && (
                      <a href={url.get(g.comprobante_path)!} target="_blank" rel="noopener" className="underline">
                        comprobante
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gris">Sin gastos registrados.</p>
          )}
        </section>
      </main>
    </div>
  );
}
