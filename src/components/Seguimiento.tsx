import Link from "next/link";
import { Boton } from "@/components/Boton";
import { agregarNota, agregarPendiente, marcarPendiente } from "@/app/personas/actions";
import { cuandoVence, DE_QUIEN, DE_QUIEN_OPCION, hoyMX } from "@/lib/crm";
import { etiqueta, formatoFecha, formatoFechaHora } from "@/lib/datos";
import { fechaConAnio } from "@/lib/crm";

export const campo = "min-h-11 min-w-0 rounded-xl border border-borde bg-white px-3 text-sm font-normal outline-none focus:border-verde";

export type Pendiente = {
  id: string;
  titulo: string;
  de_quien: string;
  vence: string | null;
  hecho_at: string | null;
  duenos?: { id: string; nombre: string } | null;
  inquilinos?: { id: string; nombre: string } | null;
  propiedades?: { id: string; nombre: string } | null;
};

export function Etiqueta({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
      {texto}
      {children}
    </label>
  );
}

type Contexto = { dueno_id?: string; inquilino_id?: string; propiedad_id?: string };

function Ocultos({ ctx, volver }: { ctx: Contexto; volver: string }) {
  return (
    <>
      <input type="hidden" name="volver" value={volver} />
      {Object.entries(ctx).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
    </>
  );
}

// Lista de temas por resolver con casilla para marcarlos como hechos.
export function ListaPendientes({ pendientes, volver, mostrarPersona = false }: { pendientes: Pendiente[]; volver: string; mostrarPersona?: boolean }) {
  const hoy = hoyMX();
  if (!pendientes.length) return <p className="text-sm text-gris">Nada pendiente. 🎉</p>;
  return (
    <ul className="flex flex-col divide-y divide-borde-suave">
      {pendientes.map((p) => {
        const v = cuandoVence(p.vence, hoy);
        const persona = p.duenos
          ? { href: `/personas/duenos/${p.duenos.id}`, nombre: p.duenos.nombre }
          : p.inquilinos
            ? { href: `/personas/inquilinos/${p.inquilinos.id}`, nombre: p.inquilinos.nombre }
            : null;
        return (
          <li key={p.id} className="flex items-start gap-3 py-2.5">
            <form action={marcarPendiente}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="volver" value={volver} />
              <input type="hidden" name="hecho" value={p.hecho_at ? "0" : "1"} />
              <button
                type="submit"
                aria-label={p.hecho_at ? `Reabrir: ${p.titulo}` : `Marcar como hecho: ${p.titulo}`}
                className={`mt-0.5 flex size-6 items-center justify-center rounded-md border-2 text-xs font-bold ${p.hecho_at ? "border-verde bg-verde text-white" : "border-borde bg-white hover:border-verde"}`}
              >
                {p.hecho_at ? "✓" : ""}
              </button>
            </form>
            <div className="min-w-0 flex-1 text-sm">
              <p className={p.hecho_at ? "text-gris line-through" : "font-semibold"}>{p.titulo}</p>
              <p className="text-xs text-gris">
                {!p.hecho_at && <span className={v.clase}>{v.texto}</span>}
                {p.hecho_at && <span>Hecho {formatoFecha(p.hecho_at)}</span>}
                <span> · Depende de: {etiqueta(DE_QUIEN, p.de_quien)}</span>
                {mostrarPersona && persona && (
                  <>
                    {" · "}
                    <Link href={persona.href} className="font-semibold text-verde hover:underline">
                      {persona.nombre}
                    </Link>
                  </>
                )}
                {mostrarPersona && p.propiedades && <span> · {p.propiedades.nombre}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function NuevoPendiente({ ctx, volver, deQuien = "administradora" }: { ctx: Contexto; volver: string; deQuien?: string }) {
  return (
    <form action={agregarPendiente} className="flex flex-wrap items-end gap-2 border-t border-borde-suave pt-3">
      <Ocultos ctx={ctx} volver={volver} />
      <input name="titulo" required maxLength={200} placeholder="Ej. Pedir copia de INE del aval" aria-label="Nuevo pendiente" className={`${campo} flex-[3_1_220px]`} />
      <select name="de_quien" defaultValue={deQuien} aria-label="Depende de" className={`${campo} flex-[1_1_180px]`}>
        {DE_QUIEN.map(([v]) => (
          <option key={v} value={v}>
            {DE_QUIEN_OPCION[v]}
          </option>
        ))}
      </select>
      <input type="date" name="vence" defaultValue={hoyMX(2)} aria-label="Fecha límite" className={`${campo} flex-[1_1_140px]`} />
      <Boton enviando="Agregando…" estilo="oscuro">
        + Pendiente
      </Boton>
    </form>
  );
}

export function NuevaNota({ ctx, volver }: { ctx: Contexto; volver: string }) {
  return (
    <form action={agregarNota} className="flex flex-col gap-2">
      <Ocultos ctx={ctx} volver={volver} />
      <textarea
        name="texto"
        required
        maxLength={2000}
        rows={2}
        placeholder="Ej. Llamé, dice que paga el viernes"
        aria-label="Nueva nota"
        className={`${campo} py-2.5`}
      />
      <Boton enviando="Guardando…" className="self-start">
        Guardar nota
      </Boton>
    </form>
  );
}

export type Evento = {
  fecha: string;
  tipo: "nota" | "ticket" | "resuelto" | "aprobacion" | "decision" | "contrato" | "pago" | "pendiente";
  titulo: string;
  detalle?: string | null;
  href?: string;
  soloFecha?: boolean;
};

const PUNTO: Record<Evento["tipo"], { color: string; texto: string }> = {
  nota: { color: "bg-tinta", texto: "Nota" },
  ticket: { color: "bg-naranja", texto: "Ticket" },
  resuelto: { color: "bg-verde", texto: "Resuelto" },
  aprobacion: { color: "bg-[#E0A100]", texto: "Aprobación" },
  decision: { color: "bg-verde", texto: "Decisión" },
  contrato: { color: "bg-[#2A4A93]", texto: "Contrato" },
  pago: { color: "bg-menta", texto: "Pago" },
  pendiente: { color: "bg-gris", texto: "Pendiente" },
};

// Todo lo que ha pasado con esta persona, lo más reciente arriba.
export function LineaTiempo({ eventos }: { eventos: Evento[] }) {
  const orden = [...eventos].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha)).slice(0, 60);
  if (!orden.length) return <p className="text-sm text-gris">Todavía no hay historial.</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l-2 border-borde-suave pl-5">
      {orden.map((e, i) => {
        const punto = PUNTO[e.tipo];
        const cuerpo = (
          <>
            <p className="text-xs text-gris">
              <span className="font-bold uppercase tracking-wide">{punto.texto}</span> · {e.soloFecha ? fechaConAnio(e.fecha.slice(0, 10)) : formatoFechaHora(e.fecha)}
            </p>
            <p className="text-sm font-semibold">{e.titulo}</p>
            {e.detalle && <p className="whitespace-pre-line text-sm text-gris">{e.detalle}</p>}
          </>
        );
        return (
          <li key={i} className="relative">
            <span className={`absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-white ${punto.color}`} aria-hidden="true" />
            {e.href ? (
              <Link href={e.href} className="block rounded-lg hover:bg-fondo">
                {cuerpo}
              </Link>
            ) : (
              cuerpo
            )}
          </li>
        );
      })}
    </ol>
  );
}
