import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Boton } from "@/components/Boton";
import { Cargando, Menu } from "@/components/Menu";
import { campo } from "@/components/Seguimiento";
import { diasEntre, fechaConAnio, hoyMX } from "@/lib/crm";
import { pesos } from "@/lib/datos";
import { sesionConOrg } from "@/lib/sesion";
import { agregarDueno, agregarInquilino } from "./actions";

export const metadata: Metadata = { title: "Personas · Black Key" };

type Dueno = {
  id: string;
  nombre: string;
  telefono: string | null;
  propiedades: { id: string }[];
  pendientes: { id: string; hecho_at: string | null }[];
};
type Inquilino = {
  id: string;
  nombre: string;
  telefono: string | null;
  contratos: { fin: string; renta: number; activo: boolean; propiedades: { nombre: string } | null }[];
  pendientes: { id: string; hecho_at: string | null }[];
};

export default function Personas({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { supabase, org } = await sesionConOrg();
  const ver = (await searchParams).ver === "inquilinos" ? "inquilinos" : "duenos";
  const hoy = hoyMX();

  const [{ data: duenos }, { data: inquilinos }, { data: propiedades }] = await Promise.all([
    supabase.from("duenos").select("id, nombre, telefono, propiedades(id), pendientes(id, hecho_at)").order("nombre"),
    supabase
      .from("inquilinos")
      .select("id, nombre, telefono, contratos(fin, renta, activo, propiedades(nombre)), pendientes(id, hecho_at)")
      .order("nombre"),
    supabase.from("propiedades").select("id, nombre, estado, renta_mensual").order("nombre"),
  ]);

  const abiertos = (p: { hecho_at: string | null }[]) => p.filter((x) => !x.hecho_at).length;

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Personas" nombreOrg={org.nombre} />
      <main className="min-w-0 flex-[999_1_560px] px-5 py-8 sm:px-10">
        <h1 className="font-display text-4xl font-bold tracking-tight">Personas</h1>
        <p className="mt-1 text-gris">Dueños e inquilinos, con todo su historial y lo que falta resolver.</p>

        <nav aria-label="Ver" className="mt-5 flex gap-2">
          {(
            [
              ["duenos", `Dueños (${duenos?.length ?? 0})`],
              ["inquilinos", `Inquilinos (${inquilinos?.length ?? 0})`],
            ] as const
          ).map(([v, t]) => (
            <Link
              key={v}
              href={`/personas?ver=${v}`}
              aria-current={ver === v ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-full px-4 text-sm font-bold ${ver === v ? "bg-tinta text-white" : "bg-white text-tinta"}`}
            >
              {t}
            </Link>
          ))}
        </nav>

        <div className="mt-5 flex flex-wrap items-start gap-5">
          <section aria-label={ver === "duenos" ? "Dueños" : "Inquilinos"} className="min-w-0 flex-[2_1_420px] overflow-hidden rounded-2xl bg-white">
            {ver === "duenos" ? (
              (duenos as Dueno[] | null)?.length ? (
                <ul className="divide-y divide-borde-suave">
                  {(duenos as Dueno[]).map((d) => {
                    const n = abiertos(d.pendientes);
                    return (
                      <li key={d.id}>
                        <Link href={`/personas/duenos/${d.id}`} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3 hover:bg-fondo">
                          <span className="min-w-0">
                            <span className="block truncate font-bold">{d.nombre}</span>
                            <span className="text-sm text-gris">
                              {d.propiedades.length} {d.propiedades.length === 1 ? "propiedad" : "propiedades"}
                              {d.telefono ? ` · ${d.telefono}` : ""}
                            </span>
                          </span>
                          {n > 0 && (
                            <span className="flex-none rounded-full bg-naranja-claro px-2.5 py-1 text-xs font-bold text-naranja-oscuro">
                              {n} {n === 1 ? "pendiente" : "pendientes"}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="p-5 text-sm text-gris">Aún no hay dueños. Agrégalos aquí o impórtalos desde Excel.</p>
              )
            ) : (inquilinos as unknown as Inquilino[] | null)?.length ? (
              <ul className="divide-y divide-borde-suave">
                {(inquilinos as unknown as Inquilino[]).map((i) => {
                  const c = i.contratos.find((x) => x.activo);
                  const n = abiertos(i.pendientes);
                  const dias = c ? diasEntre(hoy, c.fin) : null;
                  return (
                    <li key={i.id}>
                      <Link href={`/personas/inquilinos/${i.id}`} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3 hover:bg-fondo">
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{i.nombre}</span>
                          <span className="text-sm text-gris">
                            {c ? `${c.propiedades?.nombre ?? ""} · ${pesos.format(c.renta)} · vence ${fechaConAnio(c.fin)}` : "Sin contrato activo"}
                          </span>
                        </span>
                        <span className="flex flex-none flex-col items-end gap-1">
                          {dias != null && dias <= 90 && (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${dias < 0 ? "bg-naranja text-white" : "bg-[#FFF4E0] text-[#7A4E00]"}`}>
                              {dias < 0 ? "Contrato vencido" : `Vence en ${dias} días`}
                            </span>
                          )}
                          {n > 0 && (
                            <span className="rounded-full bg-naranja-claro px-2.5 py-1 text-xs font-bold text-naranja-oscuro">
                              {n} {n === 1 ? "pendiente" : "pendientes"}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="p-5 text-sm text-gris">Aún no hay inquilinos. Agrega el primero con su contrato.</p>
            )}
          </section>

          {ver === "duenos" ? (
            <form action={agregarDueno} className="flex flex-[1_1_280px] flex-col gap-3 rounded-2xl border-2 border-dashed border-borde bg-white p-5">
              <h2 className="font-bold">Agregar dueño</h2>
              <input name="nombre" required placeholder="Nombre" aria-label="Nombre" className={campo} />
              <input name="telefono" type="tel" placeholder="WhatsApp" aria-label="WhatsApp" className={campo} />
              <input name="email" type="email" placeholder="Correo (opcional)" aria-label="Correo" className={campo} />
              <Boton enviando="Agregando…">+ Agregar dueño</Boton>
            </form>
          ) : (
            <form action={agregarInquilino} className="flex flex-[1_1_280px] flex-col gap-3 rounded-2xl border-2 border-dashed border-borde bg-white p-5">
              <h2 className="font-bold">Agregar inquilino</h2>
              <input name="nombre" required placeholder="Nombre" aria-label="Nombre" className={campo} />
              <input name="telefono" type="tel" placeholder="WhatsApp" aria-label="WhatsApp" className={campo} />
              <input name="email" type="email" placeholder="Correo (opcional)" aria-label="Correo" className={campo} />
              <p className="pt-1 text-sm font-bold">Contrato</p>
              <select name="propiedad_id" aria-label="Propiedad" className={campo} defaultValue="">
                <option value="">Propiedad…</option>
                {(propiedades ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.estado === "vacia" ? " (vacía)" : ""}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
                  Inicio
                  <input type="date" name="inicio" defaultValue={hoy} className={campo} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
                  Fin
                  <input type="date" name="fin" defaultValue={hoyMX(365)} className={campo} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
                  Renta
                  <input name="renta" inputMode="decimal" placeholder="$15,000" className={campo} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
                  Día de pago
                  <input name="dia_pago" type="number" min={1} max={31} defaultValue={1} className={campo} />
                </label>
              </div>
              <Boton enviando="Agregando…">+ Agregar inquilino</Boton>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
