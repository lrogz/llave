import { Suspense } from "react";
import { connection } from "next/server";
import { FormReabrir } from "@/components/vecino/FormReporte";
import { Aviso, Cargando, Chip, Fila, LinkInvalido, Pantalla, Titulo } from "@/components/vecino/Piezas";
import { ESTADO_REPORTE, cuando, datosVecino, urlsFirmadas, incidentesVecino } from "@/lib/condominios";

const PASO: Record<string, string> = {
  reportado: "Recibido",
  cotizando: "Cotizando la reparación",
  aprobacion: "Por aprobar",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
  cancelado: "Cancelado",
};

export default function Seguimiento({ params, searchParams }: { params: Promise<{ token: string; id: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ token: string; id: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  await connection();
  const [{ token, id }, { nuevo }] = await Promise.all([params, searchParams]);
  const [d, incidentes] = await Promise.all([datosVecino(token), incidentesVecino(token)]);
  const r = d?.reportes.find((x) => x.id === id);
  const inc = incidentes?.[id];
  if (!d || !r) return <LinkInvalido />;
  const e = ESTADO_REPORTE[r.estado] ?? ESTADO_REPORTE.reportado;
  const fotos = await urlsFirmadas([r.foto]);
  const foto = r.foto ? fotos.get(r.foto) : null;

  return (
    <Pantalla>
      <Titulo titulo={r.titulo} sub={`Folio #${String(r.folio).padStart(4, "0")}`} atras={`/vecino/${token}/reportes`} />
      {nuevo && <Aviso>Recibimos tu reporte. Aquí verás cada avance.</Aviso>}
      <Chip texto={e.texto} clase={e.clase} />
      {inc && (
        <p className="rounded-xl border border-[#E1DCD0] bg-white px-4 py-3 text-lg">
          Tu reporte forma parte de un problema general: <strong>{inc.titulo}</strong>
          {inc.afectados > 1 ? ` (lo reportaron ${inc.afectados} viviendas)` : ""}. Conservas tu folio y aquí verás cada avance.
        </p>
      )}
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="Foto del reporte" className="aspect-video w-full rounded-2xl object-cover" />
      )}
      {(r.responsable || r.fecha_compromiso) && (
        <div className="divide-y divide-[#E1DCD0] border-y border-[#E1DCD0]">
          {r.responsable && <Fila icono="llave">Asignado a {r.responsable}</Fila>}
          {r.fecha_compromiso && <Fila icono="calendario">Próxima revisión · {cuando(`${r.fecha_compromiso}T12:00:00-06:00`).split(" · ")[0]}</Fila>}
        </div>
      )}
      {r.resolucion && !e.abierto && <p className="rounded-xl bg-[#D5E6CF] px-4 py-3 text-lg text-[#1E4D2B]">{r.resolucion}</p>}
      <section className="flex flex-col gap-1">
        <h2 className="mb-2 text-xl font-bold">Seguimiento</h2>
        <ol className="relative ml-3 border-l-2 border-[#CFC9BB]">
          {(r.historial ?? []).map((h, i) => (
            <li key={i} className="relative pb-5 pl-6">
              <span className={`absolute top-1.5 -left-[9px] size-4 rounded-full border-2 border-[#F7F4EE] ${i === (r.historial?.length ?? 0) - 1 ? "bg-[#17583A]" : "bg-[#9C978A]"}`} />
              <p className="text-lg font-semibold">{h.a ? PASO[h.a] ?? h.a : "Actualización"}</p>
              {h.nota && <p className="text-base">{h.nota}</p>}
              <p className="text-sm text-[#5A5547]">{cuando(h.fecha)}</p>
            </li>
          ))}
        </ol>
      </section>
      {!e.abierto && <FormReabrir token={token} ticketId={r.id} />}
    </Pantalla>
  );
}
