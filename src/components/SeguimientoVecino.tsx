import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Boton } from "./Boton";
import { seguimientoReporte } from "@/app/condominios/actions";
import { cuando } from "@/lib/condominios-datos";

// En un ticket que levantó un vecino: responsable, fecha de revisión, resolución e historial que el vecino ve en su portal.
export async function SeguimientoVecino({ supabase, ticketId }: { supabase: SupabaseClient; ticketId: string }) {
  const { data: t } = await supabase
    .from("tickets")
    .select("id, condominio_id, ubicacion, sensible, responsable, fecha_compromiso, resolucion, reaperturas, estado, condominios(nombre), viviendas(numero), residentes(nombre, telefono)")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t?.condominio_id) return null;
  const { data: h } = await supabase.from("ticket_historial").select("actor, de_estado, a_estado, nota, created_at").eq("ticket_id", ticketId).order("created_at");
  const nombre = (x: unknown, k: string) => (x as Record<string, string> | null)?.[k] ?? "";
  const abierto = !["resuelto", "cancelado"].includes(t.estado);
  return (
    <section aria-label="Reporte de vecino" className="flex flex-col gap-3 rounded-2xl bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">
          Reporte de vecino ·{" "}
          <Link href={`/condominios/${t.condominio_id}`} className="underline">
            {nombre(t.condominios, "nombre")}
          </Link>
        </h2>
        <span className="flex gap-2 text-xs font-semibold">
          {t.sensible && <span className="rounded-full bg-naranja-claro px-2.5 py-1 text-naranja-oscuro">Queja privada: solo propietaria y admins</span>}
          {t.reaperturas > 0 && <span className="rounded-full bg-[#FFF4E0] px-2.5 py-1 text-[#7A4E00]">Reabierto {t.reaperturas}×</span>}
        </span>
      </div>
      <p className="text-sm text-gris">
        {nombre(t.viviendas, "numero") || "Sin vivienda"} · {nombre(t.residentes, "nombre")}
        {t.ubicacion ? ` · ${t.ubicacion}` : ""}. Lo que pongas aquí lo ve el vecino en su portal.
      </p>
      <form action={seguimientoReporte} className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="ticket_id" value={t.id} />
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Responsable
          <input name="responsable" defaultValue={t.responsable ?? ""} placeholder="Mantenimiento, Jardinería, Comité…" className="min-h-11 rounded-xl border border-borde px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Próxima revisión
          <input name="fecha_compromiso" type="date" defaultValue={t.fecha_compromiso ?? ""} className="min-h-11 rounded-xl border border-borde px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
          Resolución (qué se hizo)
          <textarea name="resolucion" rows={2} defaultValue={t.resolucion ?? ""} className="rounded-xl border border-borde px-3 py-2" />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Boton estilo="claro">Guardar seguimiento</Boton>
          {abierto && (
            <Boton name="cerrar" value="1" enviando="Cerrando…">
              Cerrar como resuelto
            </Boton>
          )}
        </div>
      </form>
      {h?.length ? (
        <ol className="flex flex-col gap-1 border-t border-borde-suave pt-3 text-xs text-gris">
          {h.map((x, i) => (
            <li key={i}>
              {cuando(x.created_at)} · {x.actor}
              {x.a_estado ? ` · ${x.de_estado ? `${x.de_estado} → ` : ""}${x.a_estado}` : ""}
              {x.nota ? ` · ${x.nota}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
