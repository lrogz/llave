import { COLOR_PARTIDA, ESTADOS_PARTIDA, etiquetaTipo, type Partida } from "@/lib/inspeccion";
import type { InspeccionCompleta } from "@/lib/inspeccion-datos";
import { etiqueta, formatoFecha, formatoFechaHora } from "@/lib/datos";

// Vista de solo lectura (la firma el inquilino y se imprime): cuarto por cuarto, con la entrega anterior al lado.

export function Estado({ estado }: { estado: string }) {
  if (!estado) return <span className="rounded-full bg-fondo px-2.5 py-0.5 text-xs font-bold text-gris">Sin revisar</span>;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COLOR_PARTIDA[estado] ?? ""}`}>{etiqueta(ESTADOS_PARTIDA, estado)}</span>;
}

export function Fotos({ fotos, chicas = false }: { fotos: { id: string; url: string }[]; chicas?: boolean }) {
  if (!fotos.length) return null;
  return (
    <ul className={`grid gap-1.5 ${chicas ? "grid-cols-[repeat(auto-fill,minmax(64px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(96px,1fr))]"}`}>
      {fotos.map((f) => (
        <li key={f.id}>
          <a href={f.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada */}
            <img src={f.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Previa({ previa, partida }: { previa: InspeccionCompleta["previa"]; partida: Partida }) {
  if (!previa) return null;
  const antes = previa.partidas.find((p) => p.id === partida.id);
  if (!antes) return <p className="text-xs text-gris">No estaba en la entrega del {formatoFecha(previa.fecha)}.</p>;
  const cambio = antes.estado === "bien" && (partida.estado === "detalle" || partida.estado === "danado");
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl p-3 text-xs ${cambio ? "bg-naranja-claro" : "bg-fondo"}`}>
      <span className="flex flex-wrap items-center gap-2 font-semibold text-gris">
        Al entregarse ({formatoFecha(previa.fecha)}): <Estado estado={antes.estado} />
        {cambio && <span className="font-bold text-naranja-oscuro">Cambió desde la entrega</span>}
      </span>
      {antes.nota && <span className="text-gris">“{antes.nota}”</span>}
      <Fotos fotos={previa.fotos[antes.id] ?? []} chicas />
    </div>
  );
}

export function VistaInspeccion({ i }: { i: InspeccionCompleta }) {
  const l = i.lecturas;
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {i.partidas.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 rounded-2xl bg-white p-4 break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">{p.cuarto}</h3>
              <Estado estado={p.estado} />
            </div>
            {p.nota && <p className="text-sm text-gris">{p.nota}</p>}
            <Fotos fotos={i.fotos[p.id] ?? []} />
            <Previa previa={i.previa} partida={p} />
          </li>
        ))}
      </ul>
      {(l.luz || l.agua || l.gas || l.llaves || i.notas) && (
        <section className="flex flex-col gap-1 rounded-2xl bg-white p-4 text-sm break-inside-avoid">
          <h3 className="font-bold">Medidores, llaves y notas</h3>
          {l.luz && <p>Luz: {l.luz}</p>}
          {l.agua && <p>Agua: {l.agua}</p>}
          {l.gas && <p>Gas: {l.gas}</p>}
          {l.llaves && <p>Llaves y controles: {l.llaves}</p>}
          {i.notas && <p className="text-gris">{i.notas}</p>}
        </section>
      )}
    </div>
  );
}

export function Firma({ i }: { i: InspeccionCompleta }) {
  if (!i.firmada_at) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 text-sm break-inside-avoid">
      <h3 className="font-bold">Firma de conformidad</h3>
      {i.firmaUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada
        <img src={i.firmaUrl} alt={`Firma de ${i.firma_nombre ?? "el inquilino"}`} className="h-24 w-fit rounded-lg border border-borde-suave bg-white" />
      )}
      <p>
        <strong>{i.firma_nombre}</strong> · {formatoFechaHora(i.firmada_at)}
      </p>
      {i.observaciones_inquilino && <p className="text-gris">Observaciones del inquilino: “{i.observaciones_inquilino}”</p>}
      <p className="text-xs text-gris">
        {etiquetaTipo(i.tipo)} del {formatoFecha(i.fecha)}. Firmado desde el link enviado por {i.org}.
      </p>
    </section>
  );
}
