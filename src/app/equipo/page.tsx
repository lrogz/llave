import type { Metadata } from "next";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { campo } from "@/components/Seguimiento";
import { formatoFecha, linkWhatsApp, origen } from "@/lib/util";
import { sesionConOrg } from "@/lib/sesion";
import { cancelarInvitacion, invitar, quitarMiembro } from "./actions";

export const metadata: Metadata = { title: "Equipo · Black Key" };

const ROL: Record<string, { texto: string; detalle: string }> = {
  propietario: { texto: "Dueña de la cuenta", detalle: "Todo, incluido el equipo y los datos de pago" },
  admin: { texto: "Administradora", detalle: "Todo: invitar, borrar y cambiar datos de pago" },
  staff: { texto: "Asistente", detalle: "El día a día: tickets, cobros, notas. No borra ni invita" },
};

export default function Equipo() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const { supabase, org, user } = await sesionConOrg();
  const [{ data: miembros }, { data: invs }] = await Promise.all([
    supabase.from("miembros").select("user_id, rol, email, created_at").eq("organizacion_id", org.id).order("created_at"),
    supabase.from("invitaciones").select("id, email, rol, token, created_at").eq("organizacion_id", org.id).is("aceptada_at", null).order("created_at"),
  ]);
  const yo = miembros?.find((m) => m.user_id === user.id);
  const puedeAdministrar = yo?.rol === "propietario" || yo?.rol === "admin";
  const base = await origen();

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Equipo" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <header>
          <h1 className="font-display text-4xl font-bold tracking-tight">Equipo</h1>
          <p className="mt-1 text-gris">Quién más trabaja contigo en {org.nombre}. Cada quien entra con su propio correo.</p>
        </header>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[2_1_420px] flex-col gap-5">
            <section aria-label="Miembros" className="overflow-hidden rounded-2xl bg-white">
              <ul className="divide-y divide-borde-suave">
                {(miembros ?? []).map((m) => (
                  <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <span className="min-w-0">
                      <span className="block truncate font-bold">
                        {m.email ?? "Sin correo"}
                        {m.user_id === user.id && <span className="font-normal text-gris"> (tú)</span>}
                      </span>
                      <span className="text-sm text-gris">
                        {ROL[m.rol]?.texto} · desde {formatoFecha(m.created_at)}
                      </span>
                    </span>
                    {puedeAdministrar && m.rol !== "propietario" && m.user_id !== user.id && (
                      <form action={quitarMiembro}>
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <Boton estilo="peligro" enviando="…" className="min-h-10 text-xs">
                          Quitar acceso
                        </Boton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {puedeAdministrar && (invs ?? []).length > 0 && (
              <section aria-label="Invitaciones pendientes" className="flex flex-col gap-2 rounded-2xl bg-white p-5">
                <h2 className="font-bold">Invitaciones pendientes</h2>
                <ul className="flex flex-col divide-y divide-borde-suave">
                  {(invs ?? []).map((i) => {
                    const link = `${base}/unirme/${i.token}`;
                    return (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <span className="min-w-0 text-sm">
                          <span className="block font-semibold">{i.email}</span>
                          <span className="text-xs text-gris">
                            {ROL[i.rol]?.texto} · enviada {formatoFecha(i.created_at)}
                          </span>
                          <code className="mt-1 block break-all text-xs text-gris">{link}</code>
                        </span>
                        <span className="flex flex-none gap-2">
                          <a
                            href={linkWhatsApp(null, `Te invito a trabajar conmigo en ${org.nombre} con Black Key. Entra con tu correo ${i.email} aquí: ${link}`)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex min-h-10 items-center rounded-xl bg-verde px-3 text-xs font-bold text-white"
                          >
                            Mandar por WhatsApp
                          </a>
                          <form action={cancelarInvitacion}>
                            <input type="hidden" name="id" value={i.id} />
                            <Boton estilo="claro" enviando="…" className="min-h-10 text-xs">
                              Cancelar
                            </Boton>
                          </form>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>

          {puedeAdministrar ? (
            <form action={invitar} className="flex flex-[1_1_280px] flex-col gap-3 rounded-2xl border-2 border-dashed border-borde bg-white p-5">
              <h2 className="font-bold">Invitar a alguien</h2>
              <input name="email" type="email" required placeholder="correo@ejemplo.com" aria-label="Correo de la persona" className={campo} />
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold">¿Qué puede hacer?</legend>
                {(["staff", "admin"] as const).map((r) => (
                  <label key={r} className="flex cursor-pointer items-start gap-2 rounded-xl border border-borde p-3 text-sm has-checked:border-verde has-checked:bg-verde-claro">
                    <input type="radio" name="rol" value={r} defaultChecked={r === "staff"} className="mt-1 accent-verde" />
                    <span>
                      <span className="block font-semibold">{ROL[r].texto}</span>
                      <span className="text-xs text-gris">{ROL[r].detalle}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <Boton enviando="Creando…">Crear invitación</Boton>
              <p className="text-xs text-gris">Te damos un link para mandarle por WhatsApp. Entra con ese mismo correo.</p>
            </form>
          ) : (
            <p className="flex-[1_1_280px] rounded-2xl bg-white p-5 text-sm text-gris">Solo la dueña de la cuenta o una administradora puede invitar personas.</p>
          )}
        </div>
      </main>
    </div>
  );
}
