import { ROL, type DocContrato } from "@/lib/contrato-datos";
import { formatoFechaHora } from "@/lib/datos";

// Texto del contrato + hoja de firmas con su evidencia (para la administradora, las partes y para imprimir).
export function TextoContrato({ texto }: { texto: string }) {
  return (
    <article className="rounded-2xl bg-white p-6 font-serif text-[15px] leading-relaxed whitespace-pre-line text-tinta sm:p-10 print:p-0">
      {texto}
    </article>
  );
}

export function HojaFirmas({ d }: { d: DocContrato }) {
  if (!d.firmantes.length) return null;
  return (
    <section aria-label="Firmas" className="flex flex-col gap-4 rounded-2xl bg-white p-6 break-inside-avoid print:p-0">
      <h2 className="font-bold">Firmas</h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {d.firmantes.map((f) => (
          <li key={f.id} className="flex flex-col gap-1 rounded-xl border border-borde-suave p-4 text-sm">
            <span className="text-xs font-semibold text-gris">{ROL[f.rol] ?? f.rol}</span>
            {f.firmaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada
              <img src={f.firmaUrl} alt={`Firma de ${f.nombre}`} className="h-20 w-fit" />
            ) : (
              <span className="flex h-20 items-center text-gris">Pendiente de firma</span>
            )}
            <span className="border-t border-borde pt-1 font-semibold">{f.nombre}</span>
            {f.firmada_at && (
              <span className="text-xs text-gris">
                Firmó el {formatoFechaHora(f.firmada_at)}
                {f.ip ? ` · IP ${f.ip}` : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
      {d.hash && (
        <p className="text-xs break-all text-gris">
          Huella digital del texto firmado (SHA-256): <span className="font-mono">{d.hash}</span>. Cualquier cambio al texto produciría una huella distinta.
        </p>
      )}
    </section>
  );
}
