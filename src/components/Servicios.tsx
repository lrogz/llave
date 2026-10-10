import { Boton } from "@/components/Boton";
import { campo } from "@/components/Seguimiento";
import { agregarServicio, quitarServicio } from "@/app/servicios/actions";
import { QUIEN_PAGA, TIPOS_SERVICIO, etiqueta } from "@/lib/datos";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;
const PERIODOS = [
  ["mensual", "Cada mes"],
  ["bimestral", "Cada 2 meses"],
  ["anual", "Una vez al año"],
] as const;

// Servicios de una propiedad (luz, agua, predial…): quién paga y cuándo vence.
export async function SeccionServicios({ db, propiedadId }: { db: Db; propiedadId: string }) {
  const { data } = await db
    .from("servicios")
    .select("id, tipo, compania, numero_servicio, quien_paga, dia_vencimiento, periodicidad, recibos_servicio(estado, periodo)")
    .eq("propiedad_id", propiedadId)
    .order("tipo");
  const servicios = (data ?? []) as {
    id: string;
    tipo: string;
    compania: string | null;
    numero_servicio: string | null;
    quien_paga: string;
    dia_vencimiento: number | null;
    periodicidad: string;
    recibos_servicio: { estado: string; periodo: string }[];
  }[];

  return (
    <section aria-label="Servicios" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
      <h2 className="font-bold">Servicios</h2>
      {servicios.length === 0 ? (
        <p className="text-sm text-gris">Da de alta luz, agua, predial o la cuota para que no se pase ningún pago.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde-suave">
          {servicios.map((s) => {
            const ultimo = [...s.recibos_servicio].sort((a, b) => b.periodo.localeCompare(a.periodo))[0];
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {etiqueta(TIPOS_SERVICIO, s.tipo)}
                    {s.compania ? ` · ${s.compania}` : ""}
                  </span>
                  <span className="text-xs text-gris">
                    Paga: {etiqueta(QUIEN_PAGA, s.quien_paga)} · {etiqueta(PERIODOS, s.periodicidad).toLowerCase()}
                    {s.dia_vencimiento ? `, día ${s.dia_vencimiento}` : ""}
                    {s.numero_servicio ? ` · No. ${s.numero_servicio}` : ""}
                  </span>
                </span>
                <span className="flex flex-none items-center gap-2">
                  {ultimo && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ultimo.estado === "pagado" ? "bg-verde-claro text-verde-oscuro" : ultimo.estado === "vencido" ? "bg-naranja text-white" : "bg-[#FFF4E0] text-[#7A4E00]"}`}
                    >
                      {ultimo.estado === "pagado" ? "Al corriente" : ultimo.estado === "vencido" ? "Vencido" : "Pendiente"}
                    </span>
                  )}
                  <form action={quitarServicio}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" aria-label={`Quitar ${etiqueta(TIPOS_SERVICIO, s.tipo)}`} className="min-h-10 px-1 text-xs text-gris underline">
                      Quitar
                    </button>
                  </form>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <details className="border-t border-borde-suave pt-3">
        <summary className="cursor-pointer text-sm font-bold text-verde">+ Agregar servicio</summary>
        <form action={agregarServicio} className="mt-3 grid grid-cols-2 gap-2">
          <input type="hidden" name="propiedad_id" value={propiedadId} />
          <select name="tipo" aria-label="Servicio" className={campo}>
            {TIPOS_SERVICIO.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
          <input name="compania" placeholder="Compañía (CFE…)" aria-label="Compañía" className={campo} />
          <input name="numero_servicio" placeholder="No. de servicio" aria-label="Número de servicio" className={campo} />
          <select name="quien_paga" defaultValue="inquilino" aria-label="Quién paga" className={campo}>
            {QUIEN_PAGA.map(([v, t]) => (
              <option key={v} value={v}>
                Paga: {t}
              </option>
            ))}
          </select>
          <select name="periodicidad" aria-label="Cada cuándo" className={campo}>
            {PERIODOS.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
          <input name="dia_vencimiento" type="number" min={1} max={31} placeholder="Día que vence" aria-label="Día que vence" className={campo} />
          <Boton enviando="Agregando…" className="col-span-2 justify-self-start">
            Agregar
          </Boton>
        </form>
      </details>
    </section>
  );
}
