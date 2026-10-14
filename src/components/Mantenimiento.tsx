import Link from "next/link";
import { Boton } from "@/components/Boton";
import { campo } from "@/components/Seguimiento";
import { alternarMantenimiento, borrarMantenimiento, programarMantenimiento, ticketAhora } from "@/app/mantenimiento/actions";
import { cuandoVence } from "@/lib/crm";
import { QUIEN_PAGA, etiqueta, formatoFecha } from "@/lib/datos";
import { DIAS_ANTES, PLANTILLAS_MANT } from "@/lib/mantenimiento";

export type FilaMant = {
  id: string;
  titulo: string;
  cada_meses: number;
  proxima: string;
  quien_paga: string | null;
  activo: boolean;
  propiedades: { id: string; nombre: string } | null;
};

const cada = (n: number) => (n === 1 ? "Cada mes" : n === 12 ? "Cada año" : n === 24 ? "Cada 2 años" : `Cada ${n} meses`);

export function ListaMantenimiento({ filas, volver, conPropiedad = false }: { filas: FilaMant[]; volver: string; conPropiedad?: boolean }) {
  if (!filas.length) return <p className="text-sm text-gris">Sin tareas programadas.</p>;
  return (
    <ul className="flex flex-col divide-y divide-borde-suave text-sm">
      {filas.map((m) => {
        const v = cuandoVence(m.proxima);
        return (
          <li key={m.id} className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${m.activo ? "" : "opacity-60"}`}>
            <span className="min-w-0">
              <span className="block font-semibold">
                {m.titulo}
                {conPropiedad && m.propiedades ? (
                  <>
                    {" · "}
                    <Link href={`/propiedades/${m.propiedades.id}`} className="font-normal text-verde hover:underline">
                      {m.propiedades.nombre}
                    </Link>
                  </>
                ) : null}
              </span>
              <span className="text-xs text-gris">
                {cada(m.cada_meses)} · {m.activo ? <>próxima {formatoFecha(m.proxima)} (<span className={v.clase}>{v.texto.toLowerCase()}</span>)</> : "pausada"}
                {m.quien_paga ? ` · paga ${etiqueta(QUIEN_PAGA, m.quien_paga).toLowerCase()}` : ""}
              </span>
            </span>
            <span className="flex flex-none flex-wrap gap-1.5">
              {m.activo && (
                <form action={ticketAhora}>
                  <input type="hidden" name="id" value={m.id} />
                  <Boton estilo="claro" enviando="Creando…" className="min-h-9 px-3 text-xs">
                    Crear ticket ya
                  </Boton>
                </form>
              )}
              <form action={alternarMantenimiento}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="volver" value={volver} />
                <Boton estilo="claro" enviando="…" className="min-h-9 px-3 text-xs">
                  {m.activo ? "Pausar" : "Reactivar"}
                </Boton>
              </form>
              <form action={borrarMantenimiento}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="volver" value={volver} />
                <Boton estilo="peligro" enviando="…" className="min-h-9 px-3 text-xs">
                  Quitar
                </Boton>
              </form>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function FormMantenimiento({ propiedades, propiedadId, volver, hoy }: { propiedades?: { id: string; nombre: string }[]; propiedadId?: string; volver: string; hoy: string }) {
  return (
    <form action={programarMantenimiento} className="flex flex-col gap-2">
      <input type="hidden" name="volver" value={volver} />
      {propiedadId ? (
        <input type="hidden" name="propiedad_id" value={propiedadId} />
      ) : (
        <select name="propiedad_id" required defaultValue="" aria-label="Propiedad" className={campo}>
          <option value="" disabled>
            Propiedad…
          </option>
          <option value="todas">Todas mis propiedades</option>
          {(propiedades ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <select name="tarea" defaultValue="impermeabilizar" aria-label="Tarea" className={campo}>
          {PLANTILLAS_MANT.map((p) => (
            <option key={p.clave} value={p.clave}>
              {p.titulo} ({cada(p.meses).toLowerCase()})
            </option>
          ))}
          <option value="otra">Otra (escríbela)</option>
        </select>
        <input name="titulo" maxLength={120} placeholder="O escribe otra tarea" aria-label="Otra tarea" className={campo} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
          Cada cuántos meses
          <input name="cada_meses" inputMode="numeric" placeholder="Según la tarea" className={`${campo} text-tinta`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
          Próxima vez
          <input name="proxima" type="date" required defaultValue={hoy} className={`${campo} text-tinta`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
          Quién paga
          <select name="quien_paga" defaultValue="dueno" className={`${campo} text-tinta`}>
            {QUIEN_PAGA.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input name="notas" maxLength={500} placeholder="Notas para el ticket (proveedor de siempre, medidas…)" aria-label="Notas" className={campo} />
      <p className="text-xs text-gris">El ticket se crea solo {DIAS_ANTES} días antes de la fecha y la siguiente se programa sola.</p>
      <Boton className="self-start">Programar</Boton>
    </form>
  );
}
