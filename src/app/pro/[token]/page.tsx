import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Boton } from "@/components/Boton";
import { InputComprimido } from "@/components/InputComprimido";
import { Logo } from "@/components/Logo";
import { fechaCita } from "@/lib/agenda";
import { BUCKET, CATEGORIAS, etiqueta, linkWhatsApp } from "@/lib/datos";
import { TIPOS_DOC_PROVEEDOR } from "@/lib/red";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardarPerfil, marcarCita, subirArchivoProveedor } from "./actions";
import { FormHorario } from "./FormHorario";
import { AppCelular } from "@/components/AppCelular";
import { RegistrarSW } from "@/components/RegistrarSW";
import { pushConfigurado } from "@/lib/push";
import { desuscribirProveedor, probarProveedor, suscribirProveedor } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const valido = /^[0-9a-f]{32}$/.test(token);
  return {
    title: "Mi agenda · Black Key",
    robots: { index: false },
    manifest: valido ? `/pro/${token}/manifest.webmanifest` : undefined,
    appleWebApp: { capable: true, title: "Mi agenda", statusBarStyle: "black-translucent" },
  };
}

const haceHoras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ nuevo?: string }> };

export default function Portal(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-6">
      <Logo />
      <RegistrarSW />
      <Suspense fallback={<p className="text-sm text-gris">Cargando…</p>}>
        <Contenido {...props} />
      </Suspense>
    </main>
  );
}

type Cita = {
  id: string;
  inicio: string;
  estado: string;
  llegada_at: string | null;
  salida_at: string | null;
  notas: string | null;
  organizaciones: { nombre: string } | null;
  propiedades: { nombre: string; direccion: string | null; colonia: string | null } | null;
  tickets: { titulo: string; descripcion: string | null; inquilinos: { nombre: string; telefono: string | null } | null } | null;
};

async function Contenido({ params, searchParams }: Props) {
  await connection();
  const { token } = await params;
  const { nuevo } = await searchParams;
  const admin = createAdminClient();
  const { data: portal } = /^[0-9a-f]{32}$/.test(token) ? await admin.from("proveedor_portal").select("proveedor_id").eq("token", token).maybeSingle() : { data: null };
  const { data: p } = portal
    ? await admin.from("proveedores").select("id, nombre, especialidades, zonas, descripcion, precio_desde, es_red, verificado, estado_red, horario, foto_path, fotos_trabajos, documentos, organizaciones(nombre)").eq("id", portal.proveedor_id).maybeSingle()
    : { data: null };
  if (!p) return <p className="rounded-2xl bg-white p-6">Este link no es válido. Pídelo de nuevo a la administradora.</p>;
  const prov = p as unknown as {
    id: string;
    nombre: string;
    especialidades: string[];
    zonas: string[];
    descripcion: string | null;
    precio_desde: number | null;
    es_red: boolean;
    verificado: boolean;
    estado_red: string | null;
    horario: { dias?: number[]; desde?: string; hasta?: string; duracion?: number };
    foto_path: string | null;
    fotos_trabajos: string[];
    documentos: { tipo: string; path: string; nombre: string }[];
    organizaciones: { nombre: string } | null;
  };
  const desde = haceHoras(12);
  const { data: cs } = await admin
    .from("citas")
    .select("id, inicio, estado, llegada_at, salida_at, notas, organizaciones(nombre), propiedades(nombre, direccion, colonia), tickets(titulo, descripcion, inquilinos(nombre, telefono))")
    .eq("proveedor_id", prov.id)
    .in("estado", ["confirmada", "hecha"])
    .gte("inicio", desde)
    .order("inicio")
    .limit(50);
  const citas = (cs ?? []) as unknown as Cita[];
  const { data: sols } = await admin
    .from("solicitudes_cotizacion")
    .select("token, estado, enviada_at, organizaciones(nombre), tickets(titulo, urgencia, estado, propiedades(colonia))")
    .eq("proveedor_id", prov.id)
    .in("estado", ["enviada", "vista"])
    .order("enviada_at", { ascending: false })
    .limit(30);
  const porCotizar = ((sols ?? []) as unknown as { token: string; estado: string; enviada_at: string; organizaciones: { nombre: string } | null; tickets: { titulo: string; urgencia: string; estado: string; propiedades: { colonia: string | null } | null } | null }[]).filter(
    (x) => x.tickets && !["resuelto", "cancelado", "en_proceso"].includes(x.tickets.estado),
  );
  const rutas = [prov.foto_path, ...prov.fotos_trabajos].filter((x): x is string => !!x);
  const { data: firmadas } = rutas.length ? await admin.storage.from(BUCKET).createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  const enRed = prov.estado_red !== null;

  return (
    <>
      <header className="flex items-center gap-4">
        {prov.foto_path && url.get(prov.foto_path) && (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada
          <img src={url.get(prov.foto_path)!} alt="" className="size-16 rounded-2xl object-cover" />
        )}
        <div>
          <p className="text-sm text-gris">{enRed ? "Red de proveedores Black Key" : `Proveedor de ${prov.organizaciones?.nombre ?? ""}`}</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">{prov.nombre}</h1>
          <p className="text-sm text-gris">{prov.especialidades.map((e) => etiqueta(CATEGORIAS, e)).join(" · ")}</p>
        </div>
      </header>

      {nuevo && <p className="rounded-2xl bg-verde-claro p-4 text-verde-oscuro">¡Recibimos tu solicitud! Guarda este link: aquí verás tus citas. Para verificarte, sube abajo tu INE y comprobante de domicilio, y pon tu horario.</p>}
      {enRed && (
        <p className={`rounded-2xl p-4 text-sm ${prov.estado_red === "aprobado" ? "bg-verde-claro text-verde-oscuro" : prov.estado_red === "rechazado" ? "bg-naranja-claro text-naranja-oscuro" : "bg-[#FFF4E0] text-[#7A4E00]"}`}>
          {prov.estado_red === "aprobado" ? "✓ Verificado: ya apareces en la red y te pueden invitar a cotizar y agendar." : prov.estado_red === "rechazado" ? "Tu solicitud no fue aprobada por ahora. Escríbenos si quieres más información." : "Tu solicitud está en revisión. Te avisamos cuando estés verificado."}
        </p>
      )}

      {porCotizar.length > 0 && (
        <section aria-label="Por cotizar" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
          <h2 className="font-bold">Trabajos por cotizar ({porCotizar.length})</h2>
          <ul className="flex flex-col gap-2">
            {porCotizar.map((x) => (
              <li key={x.token}>
                <a href={`/c/${x.token}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde-suave p-3 text-sm hover:border-verde">
                  <span className="min-w-0">
                    <span className="block font-bold">
                      {x.tickets?.urgencia === "urgente" ? "🚨 " : ""}
                      {x.tickets?.titulo}
                    </span>
                    <span className="text-gris">
                      {x.organizaciones?.nombre}
                      {x.tickets?.propiedades?.colonia ? ` · ${x.tickets.propiedades.colonia}` : ""}
                    </span>
                  </span>
                  <span className="flex min-h-10 items-center rounded-xl bg-verde px-3 text-xs font-bold text-white">{x.estado === "enviada" ? "Ver y cotizar" : "Cotizar"}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Mis citas" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
        <h2 className="font-bold">Mis citas</h2>
        {citas.length === 0 ? (
          <p className="text-sm text-gris">No tienes citas próximas.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {citas.map((c) => {
              const inq = c.tickets?.inquilinos;
              return (
                <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-borde-suave p-4 text-sm">
                  <span className="font-bold first-letter:uppercase">{fechaCita(c.inicio)}</span>
                  <span>
                    {c.tickets?.titulo ?? "Visita"} · {c.organizaciones?.nombre}
                  </span>
                  <span className="text-gris">
                    {c.propiedades?.nombre} · {[c.propiedades?.direccion, c.propiedades?.colonia].filter(Boolean).join(", ")}
                  </span>
                  {c.tickets?.descripcion && <span className="text-gris">“{c.tickets.descripcion.slice(0, 200)}”</span>}
                  <div className="flex flex-wrap gap-2">
                    {c.propiedades?.direccion && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.propiedades.direccion, c.propiedades.colonia, "Querétaro"].filter(Boolean).join(", "))}`} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded-xl border border-borde px-3 text-xs font-bold">
                        Cómo llegar
                      </a>
                    )}
                    {inq?.telefono && (
                      <a href={linkWhatsApp(inq.telefono, `Hola ${inq.nombre.split(" ")[0]}, soy ${prov.nombre}, voy en camino para la visita.`)} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded-xl border border-borde px-3 text-xs font-bold">
                        Avisar al inquilino
                      </a>
                    )}
                    {c.salida_at ? (
                      <span className="flex min-h-10 items-center text-xs font-bold text-verde-oscuro">✓ Terminada</span>
                    ) : (
                      <form action={marcarCita}>
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="cita_id" value={c.id} />
                        <input type="hidden" name="paso" value={c.llegada_at ? "termine" : "llegue"} />
                        <Boton enviando="…" className="min-h-10 text-xs">
                          {c.llegada_at ? "Terminé" : "Llegué"}
                        </Boton>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Avisos en tu celular" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
        <h2 className="font-bold">Recibe tus trabajos en el celular</h2>
        <p className="text-sm text-gris">Instala tu agenda como app (sin tienda de apps) y te avisamos al instante.</p>
        <AppCelular
          configurado={pushConfigurado()}
          nombre="Mi agenda"
          avisos="Trabajos nuevos para cotizar, cotizaciones aprobadas, visitas agendadas o canceladas y el recordatorio un día antes."
          suscribir={suscribirProveedor.bind(null, token)}
          desuscribir={desuscribirProveedor.bind(null, token)}
          probar={probarProveedor.bind(null, token)}
        />
      </section>

      <section aria-label="Mi horario" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
        <h2 className="font-bold">Mi horario para visitas</h2>
        <p className="text-sm text-gris">Las administradoras y los inquilinos solo podrán agendarte en estos horarios, y nunca dos visitas a la misma hora.</p>
        <FormHorario token={token} horario={prov.horario ?? {}} />
      </section>

      {enRed && (
        <section aria-label="Mi perfil" className="flex flex-col gap-4 rounded-2xl bg-white p-5">
          <h2 className="font-bold">Mi perfil y documentos</h2>
          <form action={guardarPerfil} className="flex flex-col gap-2">
            <input type="hidden" name="token" value={token} />
            <textarea name="descripcion" rows={3} defaultValue={prov.descripcion ?? ""} maxLength={1000} placeholder="Qué haces, garantía, si facturas…" aria-label="Descripción" className="rounded-xl border border-borde px-3 py-2 text-sm" />
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="precio_desde" defaultValue={prov.precio_desde ?? ""} inputMode="decimal" placeholder="Precio desde" aria-label="Precio desde" className="min-h-11 rounded-xl border border-borde px-3 text-sm" />
              <input name="zonas" defaultValue={prov.zonas.join(", ")} placeholder="Zonas" aria-label="Zonas" className="min-h-11 rounded-xl border border-borde px-3 text-sm" />
            </div>
            <Boton estilo="claro" className="self-start">
              Guardar perfil
            </Boton>
          </form>
          <ul className="flex flex-col gap-3">
            {[["foto", "Foto o logo"], ...TIPOS_DOC_PROVEEDOR, ["trabajo", "Fotos de trabajos (hasta 8)"]].map(([tipo, texto]) => {
              const listo = tipo === "foto" ? !!prov.foto_path : tipo === "trabajo" ? prov.fotos_trabajos.length > 0 : prov.documentos.some((d) => d.tipo === tipo);
              return (
                <li key={tipo} className="flex flex-col gap-2 rounded-xl border border-borde-suave p-3">
                  <span className="text-sm font-semibold">
                    {texto} {listo && <span className="text-verde-oscuro">· ✓ subido</span>}
                  </span>
                  <form action={subirArchivoProveedor} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="tipo" value={tipo} />
                    <InputComprimido name="archivos" accept={tipo === "foto" || tipo === "trabajo" ? "image/jpeg,image/png,image/webp,image/heic" : "application/pdf,image/jpeg,image/png,image/webp,image/heic"} multiple={tipo === "trabajo"} required className="max-w-full text-sm" />
                    <Boton estilo="claro" enviando="Subiendo…">
                      Subir
                    </Boton>
                  </form>
                </li>
              );
            })}
          </ul>
          {prov.fotos_trabajos.length > 0 && (
            <ul className="grid grid-cols-4 gap-2">
              {prov.fotos_trabajos.map((f) => (
                <li key={f}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada */}
                  <img src={url.get(f) ?? ""} alt="" className="aspect-square w-full rounded-lg object-cover" />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
