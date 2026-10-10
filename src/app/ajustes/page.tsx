import type { Metadata } from "next";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { campo } from "@/components/Seguimiento";
import { AVISOS, type TipoAviso } from "@/lib/avisos";
import { correoConfigurado } from "@/lib/correo";
import { formatoFechaHora } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";
import { guardarAvisos, guardarNombre } from "./actions";
import { BotonMandarAhora, FormContrasena } from "./Formularios";

export const metadata: Metadata = { title: "Ajustes · Black Key" };

const TIPO_TEXTO: Record<string, string> = { renta: "Aviso de renta", vencida: "Renta vencida", reporte: "Reporte al dueño", renovacion: "Renovación", servicios: "Servicio", resumen: "Resumen diario" };

export default function Ajustes() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const { supabase, org, user } = await sesionConOrg();
  const [{ data: o }, { data: yo }, { data: enviados }] = await Promise.all([
    supabase.from("organizaciones").select("nombre, avisos").eq("id", org.id).single(),
    supabase.from("miembros").select("rol").eq("organizacion_id", org.id).eq("user_id", user.id).maybeSingle(),
    supabase.from("avisos_enviados").select("tipo, para, asunto, created_at").eq("organizacion_id", org.id).order("created_at", { ascending: false }).limit(15),
  ]);
  const admin = yo?.rol === "propietario" || yo?.rol === "admin";
  const avisos = (o?.avisos ?? {}) as Partial<Record<TipoAviso, boolean>>;
  const conCorreo = correoConfigurado();

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Ajustes" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <h1 className="font-display text-4xl font-bold tracking-tight">Ajustes</h1>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-5">
            <section aria-label="Avisos automáticos" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
              <h2 className="font-bold">Avisos automáticos por correo</h2>
              <p className="text-sm text-gris">Cada mañana Black Key manda estos correos por ti. Solo llegan a quien tenga correo registrado. Las respuestas te llegan a ti.</p>
              {!conCorreo && (
                <p className="rounded-xl bg-naranja-claro p-3 text-sm text-naranja-oscuro">
                  Falta conectar el correo de envío. Mientras tanto no sale ningún aviso. (Pasos en el README: RESEND_API_KEY y AVISOS_REMITENTE en Vercel.)
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
                {admin && (
                  <Boton className="self-start" estilo="claro">
                    Guardar avisos
                  </Boton>
                )}
              </form>
              {admin && <BotonMandarAhora />}
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
