import { ESTADOS_TICKET } from "@/lib/datos";

// Barra de avance del ticket: reportado → cotizando → aprobación → en proceso → resuelto.
export function Avance({ estado }: { estado: string }) {
  const actual = ESTADOS_TICKET.findIndex(([v]) => v === estado);
  return (
    <ol aria-label="Avance" className="grid grid-cols-5 gap-1.5">
      {ESTADOS_TICKET.map(([valor, texto], i) => {
        const hecho = i < actual || estado === "resuelto";
        const esActual = i === actual && estado !== "resuelto";
        return (
          <li
            key={valor}
            aria-current={esActual ? "step" : undefined}
            className={`flex flex-col gap-1.5 text-xs sm:text-sm ${hecho || esActual ? "font-bold" : "text-gris"} ${esActual ? "text-verde-oscuro" : ""}`}
          >
            <span className={`h-1.5 rounded-full ${hecho ? "bg-verde" : esActual ? "bg-menta" : "bg-[#D5DDD9]"}`} />
            {texto}
          </li>
        );
      })}
    </ol>
  );
}
