import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { BotonCopiar } from "@/components/BotonCopiar";
import { Cargando, Menu } from "@/components/Menu";
import { primerNombre } from "@/lib/crm";
import { BUCKET, etiqueta, formatoFecha, linkWhatsApp, origen, pesos } from "@/lib/util";
import { CAMPOS_SOLICITUD, COLOR_SOLICITUD, ESTADOS_SOLICITUD, MORADA_UNO_URL, TIPOS_ARCHIVO, type DatosSolicitud } from "@/lib/solicitud";
import { sesionConOrg } from "@/lib/sesion";
import { crearInquilinoDeSolicitud, estadoSolicitud } from "../actions";

export const metadata: Metadata = { title: "Solicitud de renta · Black Key" };

export default function PaginaSolicitud({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, org } = await sesionConOrg();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await supabase
    .from("solicitudes_renta")
    .select("id, token, nombre, telefono, email, datos, estado, recibida_at, created_at, inquilino_id, propiedad_id, propiedades(nombre, renta_mensual), solicitud_archivos(id, tipo, nombre, storage_path)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const s = data as unknown as {
    id: string;
    token: string;
    nombre: string;
    telefono: string | null;
    email: string | null;
    datos: DatosSolicitud;
    estado: string;
    recibida_at: string | null;
    created_at: string;
    inquilino_id: string | null;
    propiedad_id: string;
    propiedades: { nombre: string; renta_mensual: number | null } | null;
    solicitud_archivos: { id: string; tipo: string; nombre: string | null; storage_path: string }[];
  };
  // Links de 7 días para compartir el expediente con el investigador / la póliza.
  const rutas = s.solicitud_archivos.map((a) => a.storage_path);
  const { data: firmadas } = rutas.length ? await supabase.storage.from(BUCKET).createSignedUrls(rutas, 7 * 24 * 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  const link = `${await origen()}/s/${s.token}`;
  const ingreso = Number(String(s.datos.ingreso ?? "").replace(/[^0-9.]/g, ""));
  const renta = Number(s.propiedades?.renta_mensual ?? 0);
  const proporcion = ingreso && renta ? ingreso / renta : null;
  const expediente = [
    `Solicitud de arrendamiento · ${s.propiedades?.nombre ?? ""}${renta ? ` · renta ${pesos.format(renta)}` : ""}`,
    `Solicitante: ${s.nombre} · ${s.telefono ?? ""}${s.email ? ` · ${s.email}` : ""}`,
    ...CAMPOS_SOLICITUD.filter((c) => s.datos[c.clave]).map((c) => `${c.texto}: ${s.datos[c.clave]}`),
    "",
    "Documentos (links válidos 7 días):",
    ...s.solicitud_archivos.map((a) => `- ${etiqueta(TIPOS_ARCHIVO, a.tipo)}: ${url.get(a.storage_path) ?? ""}`),
  ].join("\n");

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Propiedades" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <Link href={`/propiedades/${s.propiedad_id}/anuncio`} className="text-sm font-semibold text-verde">
          ‹ Anuncio de {s.propiedades?.nombre}
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gris">Solicitud de renta · {s.propiedades?.nombre}</p>
            <h1 className="font-display text-4xl font-bold tracking-tight">{s.nombre}</h1>
            <p className="text-gris">
              {s.telefono}
              {s.email ? ` · ${s.email}` : ""}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${COLOR_SOLICITUD[s.estado] ?? ""}`}>{etiqueta(ESTADOS_SOLICITUD, s.estado)}</span>
        </header>

        {!s.recibida_at ? (
          <section aria-label="Mandar solicitud" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
            <h2 className="font-bold">Mándale el link para que la llene</h2>
            <p className="text-sm text-gris">Llena sus datos, referencias y sube su INE, comprobantes de ingresos y de domicilio desde el celular.</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={linkWhatsApp(s.telefono, `Hola ${primerNombre(s.nombre)}, para avanzar con ${s.propiedades?.nombre ?? "la casa"} llena tu solicitud y sube tus documentos aquí: ${link}`)}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center rounded-xl bg-verde px-4 text-sm font-bold text-white"
              >
                Mandar por WhatsApp
              </a>
              <BotonCopiar texto={link} etiqueta="Copiar link" />
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap items-start gap-5">
          <section aria-label="Datos" className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-3 rounded-2xl bg-white p-5 text-sm">
            <h2 className="font-bold">Datos</h2>
            {s.recibida_at ? (
              <>
                {proporcion != null && (
                  <p className={`rounded-xl p-3 ${proporcion >= 3 ? "bg-verde-claro text-verde-oscuro" : "bg-[#FFF4E0] text-[#7A4E00]"}`}>
                    Su ingreso es {proporcion.toFixed(1)} veces la renta {proporcion >= 3 ? "(lo usual es pedir 3 veces o más)" : "(lo usual es pedir 3 veces o más; revisa con la póliza)"}.
                  </p>
                )}
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  {CAMPOS_SOLICITUD.filter((c) => s.datos[c.clave]).map((c) => (
                    <div key={c.clave} className="contents">
                      <dt className="text-gris">{c.texto}</dt>
                      <dd>{c.clave === "mudanza" ? formatoFecha(s.datos[c.clave]!) : s.datos[c.clave]}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-gris">Recibida el {formatoFecha(s.recibida_at)}.</p>
              </>
            ) : (
              <p className="text-gris">Todavía no la llena.</p>
            )}
            <h2 className="mt-2 font-bold">Documentos ({s.solicitud_archivos.length})</h2>
            {s.solicitud_archivos.length === 0 ? (
              <p className="text-gris">Aún no sube documentos.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {s.solicitud_archivos.map((a) => (
                  <li key={a.id}>
                    <a href={url.get(a.storage_path) ?? "#"} target="_blank" rel="noreferrer" className="font-semibold text-verde hover:underline">
                      {etiqueta(TIPOS_ARCHIVO, a.tipo)}
                    </a>{" "}
                    <span className="text-xs text-gris">{a.nombre}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <section aria-label="Investigación y póliza" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Investigación y póliza (Morada Uno)</h2>
              <p className="text-sm text-gris">Copia el expediente (datos + links a los documentos, válidos 7 días) y pégalo en tu solicitud de Morada Uno o mándalo a tu asesor.</p>
              <div className="flex flex-wrap gap-2">
                <BotonCopiar texto={expediente} etiqueta="Copiar expediente" />
                <a href={MORADA_UNO_URL} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-xl bg-tinta px-4 text-sm font-bold text-white">
                  Abrir Morada Uno
                </a>
              </div>
              <form action={estadoSolicitud} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={s.id} />
                <select name="estado" defaultValue={s.estado} aria-label="Estado de la solicitud" className="min-h-11 rounded-xl border border-borde bg-white px-3 text-sm">
                  {ESTADOS_SOLICITUD.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
                <Boton estilo="claro">Guardar estado</Boton>
              </form>
            </section>
            <section aria-label="Siguiente paso" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">¿Aprobada?</h2>
              {s.inquilino_id ? (
                <Link href={`/personas/inquilinos/${s.inquilino_id}`} className="font-semibold text-verde hover:underline">
                  Ver ficha del inquilino →
                </Link>
              ) : (
                <form action={crearInquilinoDeSolicitud}>
                  <input type="hidden" name="id" value={s.id} />
                  <Boton enviando="Creando…">Crear inquilino y hacer su contrato</Boton>
                </form>
              )}
              <p className="text-xs text-gris">Después registra la póliza en su contrato (proveedor, número y vigencia) para que te avisemos antes de que venza.</p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
