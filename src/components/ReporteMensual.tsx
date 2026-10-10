import { Boton } from "@/components/Boton";
import { crearReporte } from "@/app/personas/actions";
import { plantillas } from "@/lib/crm";
import { formatoFecha, linkWhatsApp } from "@/lib/datos";
import { mesTexto } from "@/lib/reporte";

export type ReporteFila = { periodo: string; token: string; visto_at: string | null; created_at: string };

// Una fila por mes: preparar el link, mandarlo por WhatsApp y ver si el dueño ya lo abrió.
export function FilaReporte({
  dueno,
  periodo,
  reporte,
  base,
  volver,
  conNombre = false,
}: {
  dueno: { id: string; nombre: string; telefono: string | null };
  periodo: string;
  reporte?: ReporteFila;
  base: string;
  volver: string;
  conNombre?: boolean;
}) {
  const mes = mesTexto(periodo);
  const link = reporte ? `${base}/e/${reporte.token}` : "";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <span className="min-w-0 text-sm">
        <span className="block font-semibold first-letter:uppercase">{conNombre ? dueno.nombre : mes}</span>
        <span className="text-xs text-gris">
          {conNombre ? `${mes} · ` : ""}
          {!reporte ? "Sin preparar" : reporte.visto_at ? `✓ Lo abrió el ${formatoFecha(reporte.visto_at)}` : "Listo · aún no lo abre"}
        </span>
      </span>
      {reporte ? (
        <span className="flex flex-none gap-2">
          <a href={`${link}?vista=admin`} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded-xl border border-borde px-3 text-xs font-bold hover:border-verde">
            Ver
          </a>
          <a
            href={linkWhatsApp(dueno.telefono, plantillas.reporte(dueno.nombre, mes, link))}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-10 items-center rounded-xl bg-verde px-3 text-xs font-bold text-white"
          >
            Enviar por WhatsApp
          </a>
        </span>
      ) : (
        <form action={crearReporte}>
          <input type="hidden" name="dueno_id" value={dueno.id} />
          <input type="hidden" name="periodo" value={periodo} />
          <input type="hidden" name="volver" value={volver} />
          <Boton estilo="oscuro" enviando="Preparando…" className="min-h-10 text-xs">
            Preparar reporte
          </Boton>
        </form>
      )}
    </li>
  );
}
