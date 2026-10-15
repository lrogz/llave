import Link from "next/link";
import { Boton } from "@/components/Boton";
import { campo } from "@/components/Seguimiento";
import { alternarMantenimiento, borrarMantenimiento, ticketAhora } from "@/app/mantenimiento/actions";
export { FormMantenimiento } from "./FormMantenimiento";
import { cuandoVence } from "@/lib/crm";
import { formatoFecha, textoPaga, type Reparto } from "@/lib/datos";

export type FilaMant = {
  id: string;
  titulo: string;
  cada_meses: number;
  proxima: string;
  quien_paga: string | null;
  reparto?: Reparto | null;
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
                {m.quien_paga ? ` · paga ${textoPaga(m.quien_paga, m.reparto).toLowerCase()}` : ""}
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
