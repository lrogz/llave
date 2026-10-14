import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando } from "@/components/Menu";
import { Logo } from "@/components/Logo";
import { BUCKET, CATEGORIAS, etiqueta, formatoFecha, linkWhatsApp, pesos } from "@/lib/datos";
import { TIPOS_DOC_PROVEEDOR, esPlataforma } from "@/lib/red";
import { sesion } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { decidirSolicitud } from "./actions";

export const metadata: Metadata = { title: "Solicitudes a la red · Black Key", robots: { index: false } };

type Sol = {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  especialidades: string[];
  zonas: string[];
  descripcion: string | null;
  experiencia_anios: number | null;
  precio_desde: number | null;
  estado_red: string;
  horario: { dias?: number[] } | null;
  foto_path: string | null;
  fotos_trabajos: string[];
  documentos: { tipo: string; path: string; nombre: string }[];
  created_at: string;
};

export default function AdminRed({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { user } = await sesion();
  if (!esPlataforma(user.email)) notFound();
  const { ver } = await searchParams;
  const estado = ver === "aprobado" || ver === "rechazado" ? ver : "solicitud";
  const admin = createAdminClient();
  const { data } = await admin
    .from("proveedores")
    .select("id, nombre, contacto, telefono, email, especialidades, zonas, descripcion, experiencia_anios, precio_desde, estado_red, horario, foto_path, fotos_trabajos, documentos, created_at")
    .eq("estado_red", estado)
    .order("created_at", { ascending: false })
    .limit(100);
  const lista = (data ?? []) as Sol[];
  const rutas = lista.flatMap((p) => [p.foto_path, ...p.fotos_trabajos, ...p.documentos.map((d) => d.path)]).filter((x): x is string => !!x);
  const { data: firmadas } = rutas.length ? await admin.storage.from(BUCKET).createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-5 py-6">
      <Logo />
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Red de proveedores</h1>
        <p className="text-gris">Revisa documentos y aprueba a quien entra a la red.</p>
      </header>
      <nav className="flex gap-2">
        {[
          ["solicitud", "Por revisar"],
          ["aprobado", "Aprobados"],
          ["rechazado", "Rechazados"],
        ].map(([v, t]) => (
          <a key={v} href={`/red/admin?ver=${v}`} aria-current={estado === v ? "page" : undefined} className={`flex min-h-10 items-center rounded-full px-4 text-sm font-bold ${estado === v ? "bg-tinta text-white" : "bg-white"}`}>
            {t}
          </a>
        ))}
      </nav>
      {lista.length === 0 && <p className="rounded-2xl bg-white p-5 text-sm text-gris">No hay nada aquí.</p>}
      <ul className="flex flex-col gap-4">
        {lista.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 rounded-2xl bg-white p-5">
            <div className="flex items-start gap-3">
              {p.foto_path && url.get(p.foto_path) && (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmada
                <img src={url.get(p.foto_path) ?? ""} alt="" className="size-14 rounded-xl object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold">{p.nombre}</h2>
                <p className="text-sm text-gris">
                  {p.especialidades.map((e) => etiqueta(CATEGORIAS, e)).join(" · ")} · {p.zonas.join(", ") || "sin zonas"}
                </p>
                <p className="text-sm text-gris">
                  {[p.contacto, p.telefono, p.email, p.experiencia_anios != null ? `${p.experiencia_anios} años` : null, p.precio_desde ? `desde ${pesos.format(p.precio_desde)}` : null, `solicitó ${formatoFecha(p.created_at.slice(0, 10))}`].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            {p.descripcion && <p className="text-sm">{p.descripcion}</p>}
            <ul className="flex flex-wrap gap-2 text-sm">
              {TIPOS_DOC_PROVEEDOR.map(([t, texto]) => {
                const d = p.documentos.filter((x) => x.tipo === t).at(-1);
                return (
                  <li key={t}>
                    {d && url.get(d.path) ? (
                      <a href={url.get(d.path) ?? ""} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded-xl border border-verde px-3 font-semibold text-verde-oscuro">
                        ✓ {texto}
                      </a>
                    ) : (
                      <span className="flex min-h-10 items-center rounded-xl border border-dashed border-borde px-3 text-gris">Falta: {texto}</span>
                    )}
                  </li>
                );
              })}
              <li className="flex min-h-10 items-center px-1 text-gris">{p.horario?.dias?.length ? "✓ Con horario" : "Sin horario"}</li>
            </ul>
            {p.fotos_trabajos.length > 0 && (
              <ul className="grid grid-cols-6 gap-2">
                {p.fotos_trabajos.map((f) => (
                  <li key={f}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada */}
                    <img src={url.get(f) ?? ""} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  </li>
                ))}
              </ul>
            )}
            <form action={decidirSolicitud} className="flex flex-wrap gap-2">
              <input type="hidden" name="proveedor_id" value={p.id} />
              {estado !== "aprobado" && (
                <Boton name="decision" value="aprobar" enviando="…">
                  Aprobar y verificar
                </Boton>
              )}
              {estado === "aprobado" && (
                <Boton name="decision" value="pausar" estilo="claro" enviando="…">
                  Sacar de la red
                </Boton>
              )}
              {estado !== "rechazado" && (
                <Boton name="decision" value="rechazar" estilo="peligro" enviando="…">
                  Rechazar
                </Boton>
              )}
              {p.telefono && (
                <a href={linkWhatsApp(p.telefono, `Hola ${p.nombre}, te escribimos de Black Key sobre tu solicitud a la red de proveedores.`)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-xl border border-borde px-3 text-sm font-bold">
                  WhatsApp
                </a>
              )}
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
