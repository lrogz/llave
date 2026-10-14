import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotonCopiar } from "@/components/BotonCopiar";
import { Cargando, Menu } from "@/components/Menu";
import { BUCKET, CATEGORIAS, etiqueta, linkWhatsApp, pesos } from "@/lib/datos";
import { ZONAS_SUGERIDAS } from "@/lib/red";
import { sesionConOrg } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { origen } from "@/lib/util";

export const metadata: Metadata = { title: "Red de proveedores · Black Key" };

type Props = { searchParams: Promise<{ esp?: string; zona?: string }> };
type Prov = {
  id: string;
  nombre: string;
  telefono: string | null;
  especialidades: string[];
  zonas: string[];
  calificacion: number | null;
  trabajos: number;
  descripcion: string | null;
  precio_desde: number | null;
  experiencia_anios: number | null;
  verificado: boolean;
  foto_path: string | null;
  fotos_trabajos: string[];
  horario: { dias?: number[] } | null;
};

export default function Red(props: Props) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido {...props} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: Props) {
  const { supabase, org } = await sesionConOrg();
  const { esp, zona } = await searchParams;
  const filtro = CATEGORIAS.some(([v]) => v === esp) ? esp : undefined;
  const z = zona && ZONAS_SUGERIDAS.includes(zona) ? zona : undefined;
  let q = supabase
    .from("proveedores")
    .select("id, nombre, telefono, especialidades, zonas, calificacion, trabajos, descripcion, precio_desde, experiencia_anios, verificado, foto_path, fotos_trabajos, horario")
    .eq("es_red", true)
    .order("calificacion", { ascending: false, nullsFirst: false })
    .order("trabajos", { ascending: false })
    .limit(100);
  if (filtro) q = q.contains("especialidades", [filtro]);
  if (z) q = q.contains("zonas", [z]);
  const { data } = await q;
  const lista = (data ?? []) as Prov[];
  // Fotos de la red: están fuera de la carpeta de la organización, se firman con el cliente admin.
  const rutas = lista.flatMap((p) => [p.foto_path, ...(p.fotos_trabajos ?? []).slice(0, 4)]).filter((x): x is string => !!x);
  const { data: firmadas } = rutas.length ? await createAdminClient().storage.from(BUCKET).createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  const liga = (cambios: { esp?: string; zona?: string }) => {
    const p = new URLSearchParams(Object.entries({ esp: filtro, zona: z, ...cambios }).filter((x): x is [string, string] => !!x[1]));
    return `/proveedores/red${p.size ? `?${p}` : ""}`;
  };
  const base = await origen();

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Proveedores" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <header>
          <Link href="/proveedores" className="text-sm text-gris hover:underline">
            ← Mis proveedores
          </Link>
          <h1 className="font-display text-4xl font-bold tracking-tight">Red Black Key</h1>
          <p className="mt-1 text-gris">Proveedores verificados (identificación y domicilio) con calificaciones de otras administradoras. Invítalos a cotizar desde cualquier ticket.</p>
        </header>
        <nav aria-label="Especialidad" className="flex flex-wrap gap-2">
          <Filtro href={liga({ esp: "" })} activo={!filtro} texto="Todas" />
          {CATEGORIAS.filter(([v]) => v !== "otro").map(([v, t]) => (
            <Filtro key={v} href={liga({ esp: v })} activo={filtro === v} texto={t} />
          ))}
        </nav>
        <nav aria-label="Zona" className="flex flex-wrap gap-2">
          <Filtro href={liga({ zona: "" })} activo={!z} texto="Todas las zonas" />
          {ZONAS_SUGERIDAS.map((v) => (
            <Filtro key={v} href={liga({ zona: v })} activo={z === v} texto={v} />
          ))}
        </nav>
        {lista.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-sm text-gris">Todavía no hay proveedores de la red con esos filtros.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {lista.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 rounded-2xl bg-white p-5">
                <div className="flex items-start gap-3">
                  {p.foto_path && url.get(p.foto_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL firmada
                    <img src={url.get(p.foto_path) ?? ""} alt="" className="size-14 flex-none rounded-xl object-cover" />
                  ) : (
                    <span className="flex size-14 flex-none items-center justify-center rounded-xl bg-fondo font-display text-xl font-bold">{p.nombre.slice(0, 1)}</span>
                  )}
                  <div className="min-w-0">
                    <h2 className="font-bold">
                      {p.nombre} {p.verificado && <span className="ml-1 rounded-full bg-verde-claro px-2 py-0.5 text-xs font-bold text-verde-oscuro">✓ Verificado</span>}
                    </h2>
                    <p className="text-sm text-gris">{p.especialidades.map((e) => etiqueta(CATEGORIAS, e)).join(" · ")}</p>
                    <p className="text-sm">
                      {p.calificacion != null ? `★ ${Number(p.calificacion).toFixed(1)}` : "Sin calificaciones"} · {p.trabajos} {p.trabajos === 1 ? "trabajo" : "trabajos"}
                      {p.precio_desde ? ` · desde ${pesos.format(p.precio_desde)}` : ""}
                    </p>
                  </div>
                </div>
                {p.descripcion && <p className="line-clamp-3 text-sm text-gris">{p.descripcion}</p>}
                <p className="text-xs text-gris">
                  {p.zonas.join(", ") || "Toda la zona metropolitana"}
                  {p.experiencia_anios ? ` · ${p.experiencia_anios} años de experiencia` : ""}
                  {p.horario?.dias?.length ? " · agenda en línea" : ""}
                </p>
                {(p.fotos_trabajos ?? []).length > 0 && (
                  <ul className="grid grid-cols-4 gap-1.5">
                    {p.fotos_trabajos.slice(0, 4).map((f) => (
                      <li key={f}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada */}
                        <img src={url.get(f) ?? ""} alt="" className="aspect-square w-full rounded-lg object-cover" />
                      </li>
                    ))}
                  </ul>
                )}
                {p.telefono && (
                  <a href={linkWhatsApp(p.telefono, `Hola ${p.nombre.split(" ")[0]}, te encontré en la red de Black Key. `)} target="_blank" rel="noreferrer" className="flex min-h-10 items-center self-start rounded-xl border border-borde px-3 text-xs font-bold hover:border-verde">
                    WhatsApp
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        <section className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-borde bg-white p-5">
          <h2 className="font-bold">¿Conoces a un buen proveedor?</h2>
          <p className="text-sm text-gris">Pásale este link para que se registre. Lo verificamos y queda disponible para todas las administradoras.</p>
          <BotonCopiar texto={`${base}/red/unirme`} etiqueta="Copiar link de registro" className="self-start" />
        </section>
      </main>
    </div>
  );
}

function Filtro({ href, activo, texto }: { href: string; activo: boolean; texto: string }) {
  return (
    <Link href={href} aria-current={activo ? "page" : undefined} className={`flex min-h-10 items-center rounded-full px-4 text-sm font-bold ${activo ? "bg-tinta text-white" : "bg-white text-tinta"}`}>
      {texto}
    </Link>
  );
}
