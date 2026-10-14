import type { Metadata } from "next";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { campo } from "@/components/Seguimiento";
import Link from "next/link";
import { AVISOS, valido, type ConfigAvisos } from "@/lib/avisos";
import { correoConfigurado } from "@/lib/correo";
import { telefonoValido, whatsappConfigurado } from "@/lib/whatsapp";
import { formatoFechaHora } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";
import { pushConfigurado } from "@/lib/push";
import { AppCelular } from "@/components/AppCelular";
import { desuscribir, probarNotificacion, suscribir } from "@/app/notificaciones/actions";
import { guardarAvisos, guardarNombre } from "./actions";
import { BotonMandarAhora, FormContrasena, FormCorreoAvisos } from "./Formularios";

export const metadata: Metadata = { title: "Ajustes · Black Key" };

const TIPO_TEXTO: Record<string, string> = { renta: "Aviso de renta", vencida: "Renta vencida", reporte: "Reporte al dueño", renovacion: "Renovación", servicios: "Servicio", citas: "Visita", resumen: "Resumen diario" };

export default function Ajustes() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const { supabase, org, user } = await sesionConOrg();
  const [{ data: o }, { data: yo }, { data: enviados }, { data: equipo }, { data: duenos }, { data: inquilinos }] = await Promise.all([
    supabase.from("organizaciones").select("nombre, avisos").eq("id", org.id).single(),
    supabase.from("miembros").select("rol").eq("organizacion_id", org.id).eq("user_id", user.id).maybeSingle(),
    supabase.from("avisos_enviados").select("tipo, para, asunto, created_at").eq("organizacion_id", org.id).order("created_at", { ascending: false }).limit(15),
    supabase.from("miembros").select("email, rol").eq("organizacion_id", org.id),
    supabase.from("duenos").select("id, nombre, email, telefono, propiedades(id)").eq("organizacion_id", org.id).order("nombre").limit(500),
    supabase.from("inquilinos").select("id, nombre, email, telefono, contratos(activo)").eq("organizacion_id", org.id).order("nombre").limit(500),
  ]);
  const admin = yo?.rol === "propietario" || yo?.rol === "admin";
  const avisos = (o?.avisos ?? {}) as ConfigAvisos;
  const conCorreo = correoConfigurado();
  const conWA = whatsappConfigurado();
  const administradoras = (equipo ?? []).filter((m) => (m.rol === "propietario" || m.rol === "admin") && valido(m.email)).map((m) => m.email as string);
  const destino = valido(avisos.correo) ? [avisos.correo] : administradoras;
  const alcanzable = (x: { email: string | null; telefono: string | null }) => valido(x.email) || (conWA && avisos.whatsapp !== false && telefonoValido(x.telefono));
  // Solo cuentan quienes recibirían avisos: dueños con propiedades e inquilinos con contrato activo.
  const sinCorreo = [
    ...((duenos ?? []) as { id: string; nombre: string; email: string | null; telefono: string | null; propiedades: { id: string }[] }[])
      .filter((d) => d.propiedades.length && !alcanzable(d))
      .map((d) => ({ id: d.id, nombre: d.nombre, quien: "Dueño", href: `/personas/duenos/${d.id}`, pierde: "reporte mensual" })),
    ...((inquilinos ?? []) as { id: string; nombre: string; email: string | null; telefono: string | null; contratos: { activo: boolean }[] }[])
      .filter((i) => i.contratos.some((c) => c.activo) && !alcanzable(i))
      .map((i) => ({ id: i.id, nombre: i.nombre, quien: "Inquilino", href: `/personas/inquilinos/${i.id}`, pierde: "avisos de renta y renovación" })),
  ];

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Ajustes" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <h1 className="font-display text-4xl font-bold tracking-tight">Ajustes</h1>

        <section id="app" aria-label="App en tu celular" className="flex scroll-mt-6 flex-col gap-3 rounded-2xl bg-white p-5">
          <h2 className="font-bold">Black Key en tu celular</h2>
          <p className="text-sm text-gris">Instálala como app (sin tienda de apps) y recibe avisos al instante. Cada persona del equipo la activa en su propio celular.</p>
          <AppCelular
            configurado={pushConfigurado()}
            avisos="Reportes nuevos (urgentes primero), comprobantes de pago, cotizaciones, respuestas de dueños, interesados en tus anuncios, solicitudes y firmas."
            suscribir={suscribir}
            desuscribir={desuscribir}
            probar={probarNotificacion}
          />
        </section>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-5">
            <section aria-label="Avisos automáticos" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Avisos automáticos</h2>
              <p className="text-sm text-gris">Cada mañana Black Key manda estos avisos por ti: por correo a quien tenga correo y por WhatsApp a quien tenga celular. Las respuestas por correo te llegan a ti.</p>
              {!conCorreo && !conWA && (
                <p className="rounded-xl bg-naranja-claro p-3 text-sm text-naranja-oscuro">
                  Falta conectar el correo o WhatsApp. Mientras tanto no sale ningún aviso. (Pasos en el README.)
                </p>
              )}
              <form action={guardarAvisos} className="flex flex-col gap-2">
                {AVISOS.map((a) => (
                  <label key={a.clave} className="flex cursor-pointer items-start gap-3 rounded-xl border border-borde p-3 has-checked:border-verde has-checked:bg-verde-claro">
                    <input type="checkbox" name={a.clave} defaultChecked={avisos[a.clave] !== false} disabled={!admin} className="mt-1 size-4 accent-verde" />
                    <span className="text-sm">
                      <span className="block font-semibold">{a.texto}</span>
                      <span className="text-xs text-gris">{a.detalle}</span>
                    </span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-borde p-3 has-checked:border-verde has-checked:bg-verde-claro">
                  <input type="checkbox" name="whatsapp" defaultChecked={avisos.whatsapp !== false} disabled={!admin} className="mt-1 size-4 accent-verde" />
                  <span className="text-sm">
                    <span className="block font-semibold">Mandarlos también por WhatsApp</span>
                    <span className="text-xs text-gris">{conWA ? "WhatsApp conectado ✓" : "WhatsApp todavía no está conectado (pasos en el README)"}</span>
                  </span>
                </label>
                {admin && (
                  <Boton className="self-start" estilo="claro">
                    Guardar avisos
                  </Boton>
                )}
              </form>
              {admin && <BotonMandarAhora />}
            </section>

            <section aria-label="Sin correo" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
              <h2 className="font-bold">{conWA ? "Sin correo ni celular" : "Sin correo"}: no reciben avisos</h2>
              {sinCorreo.length === 0 ? (
                <p className="text-sm text-gris">Todos tus dueños e inquilinos activos tienen correo. 👌</p>
              ) : (
                <>
                  <p className="text-sm text-gris">
                    {sinCorreo.length} {sinCorreo.length === 1 ? "persona" : "personas"} {conWA ? "sin correo ni celular válido" : "sin correo válido"}. Agrégalo en su ficha para que les lleguen los avisos.
                  </p>
                  <ul className="flex flex-col divide-y divide-borde-suave text-sm">
                    {sinCorreo.map((x) => (
                      <li key={x.quien + x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>
                          <span className="font-semibold">{x.nombre}</span>
                          <span className="block text-xs text-gris">
                            {x.quien} · sin {x.pierde}
                          </span>
                        </span>
                        <Link href={x.href} className="flex min-h-10 items-center rounded-xl border border-borde px-3 font-bold hover:border-verde">
                          Agregar correo
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section aria-label="Últimos avisos enviados" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Últimos avisos enviados</h2>
              {(enviados ?? []).length === 0 ? (
                <p className="text-sm text-gris">Todavía no se ha mandado ninguno.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-borde-suave text-sm">
                  {(enviados ?? []).map((e, i) => (
                    <li key={i} className="py-2">
                      <span className="block font-semibold">{e.asunto}</span>
                      <span className="text-xs text-gris">
                        {TIPO_TEXTO[e.tipo] ?? e.tipo} · a {e.para} · {formatoFechaHora(e.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <section aria-label="Tu contraseña" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Tu contraseña</h2>
              <p className="text-sm text-gris">Para entrar con {user.email} sin esperar el link del correo.</p>
              <FormContrasena />
            </section>

            <section aria-label="Tu resumen y respuestas" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Tu resumen y las respuestas</h2>
              <p className="text-sm text-gris">
                El resumen diario y las respuestas de inquilinos y dueños llegan a:{" "}
                <strong className="text-tinta">{destino.length ? destino.join(", ") : "nadie todavía"}</strong>
              </p>
              {admin && <FormCorreoAvisos actual={avisos.correo ?? ""} porDefecto={administradoras.join(", ")} />}
            </section>

            {admin && (
              <section aria-label="Tu administradora" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
                <h2 className="font-bold">Nombre de tu administradora</h2>
                <form action={guardarNombre} className="flex flex-col gap-2">
                  <input name="nombre" required maxLength={80} defaultValue={o?.nombre ?? ""} aria-label="Nombre de la administradora" className={campo} />
                  <Boton className="self-start" estilo="claro">
                    Guardar
                  </Boton>
                </form>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
