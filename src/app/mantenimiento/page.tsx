import type { Metadata } from "next";
import { Suspense } from "react";
import { FormMantenimiento, ListaMantenimiento, type FilaMant } from "@/components/Mantenimiento";
import { Cargando, Menu } from "@/components/Menu";
import { hoyMX } from "@/lib/crm";
import { sesionConOrg } from "@/lib/sesion";

export const metadata: Metadata = { title: "Mantenimiento preventivo · Black Key" };

export default function Mantenimiento() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const { supabase, org } = await sesionConOrg();
  const hoy = hoyMX();
  const [{ data }, { data: props }] = await Promise.all([
    supabase.from("mantenimientos").select("id, titulo, cada_meses, proxima, quien_paga, reparto, activo, propiedades(id, nombre)").order("activo", { ascending: false }).order("proxima"),
    supabase.from("propiedades").select("id, nombre").order("nombre"),
  ]);
  const filas = (data ?? []) as unknown as FilaMant[];
  const proximas = filas.filter((m) => m.activo && m.proxima <= hoyMX(30));

  return (
    <div className="flex flex-1 flex-wrap bg-fondo">
      <Menu activo="Mantenimiento" nombreOrg={org.nombre} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-5 py-8 sm:px-10">
        <header>
          <p className="text-sm font-semibold text-gris">
            {filas.filter((m) => m.activo).length} tareas activas · {proximas.length} en los próximos 30 días
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight">Mantenimiento preventivo</h1>
        </header>
        <div className="flex flex-wrap items-start gap-5">
          <section aria-label="Tareas programadas" className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-2 rounded-2xl bg-white p-5">
            <h2 className="font-bold">Tareas programadas</h2>
            <ListaMantenimiento filas={filas} volver="/mantenimiento" conPropiedad />
          </section>
          <section aria-label="Programar tarea" className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 rounded-2xl bg-white p-5">
            <h2 className="font-bold">Programar una tarea</h2>
            <FormMantenimiento propiedades={(props ?? []) as { id: string; nombre: string }[]} volver="/mantenimiento" hoy={hoy} />
          </section>
        </div>
      </main>
    </div>
  );
}
