import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Icono } from "@/components/vecino/Iconos";
import { BotonGrande, Cargando, Chip, Fila, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { ESTADO_REPORTE, cuando, datosVecino, urlsFirmadas } from "@/lib/condominios";

const FILTROS = [
  ["todos", "Todos"],
  ["proceso", "En proceso"],
  ["resueltos", "Resueltos"],
] as const;

export default function Reportes({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ f?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ f?: string }> }) {
  await connection();
  const [{ token }, { f = "todos" }] = await Promise.all([params, searchParams]);
  const d = await datosVecino(token);
  if (!d) return <LinkInvalido />;
  const base = `/vecino/${token}/reportes`;
  const lista = d.reportes.filter((r) => {
    const abierto = ESTADO_REPORTE[r.estado]?.abierto ?? true;
    return f === "proceso" ? abierto : f === "resueltos" ? !abierto : true;
  });
  const fotos = await urlsFirmadas(lista.map((r) => r.foto));

  return (
    <Pantalla>
      <Titulo titulo="Mis reportes" sub={d.vivienda.numero} atras={`/vecino/${token}`} />
      {d.permisos.reportes && (
        <BotonGrande href={`${base}/nuevo`} icono="mas">
          Nuevo reporte
        </BotonGrande>
      )}
      <nav aria-label="Filtrar" className="grid grid-cols-3 gap-2">
        {FILTROS.map(([v, t]) => (
          <Link
            key={v}
            href={v === "todos" ? base : `${base}?f=${v}`}
            aria-current={f === v ? "true" : undefined}
            className={`flex min-h-12 items-center justify-center rounded-full border text-lg ${f === v ? "border-transparent bg-[#D5E6CF] font-semibold text-[#1E4D2B]" : "border-[#BDB8AC] bg-[#FBF9F4]"}`}
          >
            {t}
          </Link>
        ))}
      </nav>
      {lista.length ? (
        lista.map((r) => {
          const e = ESTADO_REPORTE[r.estado] ?? ESTADO_REPORTE.reportado;
          const foto = r.foto ? fotos.get(r.foto) : null;
          const conDetalle = e.abierto && (r.responsable || r.fecha_compromiso);
          return (
            <Tarjeta key={r.id} className="overflow-hidden">
              <div className="flex gap-4 p-5">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <h2 className="font-display text-2xl leading-tight font-bold">{r.titulo}</h2>
                  <p className="text-lg text-[#5A5547]">
                    Folio #{String(r.folio).padStart(4, "0")}
                    {r.sensible ? " · Privado" : ""}
                  </p>
                  <Chip texto={e.texto} clase={e.clase} />
                </div>
                {foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={foto} alt="" className="size-32 shrink-0 rounded-xl object-cover" />
                )}
              </div>
              {conDetalle && (
                <div className="mx-5 border-t border-[#E1DCD0]">
                  {r.responsable && <Fila icono="llave">Asignado a {r.responsable}</Fila>}
                  {r.fecha_compromiso && <Fila icono="calendario">Próxima revisión · {cuando(`${r.fecha_compromiso}T12:00:00-06:00`).split(" · ")[0]}</Fila>}
                </div>
              )}
              <Link href={`${base}/${r.id}`} className="mx-5 flex min-h-14 items-center justify-between border-t border-[#E1DCD0] text-lg font-semibold">
                Ver seguimiento
                <Icono nombre="adelante" className="size-6" />
              </Link>
            </Tarjeta>
          );
        })
      ) : (
        <Vacio>{f === "todos" ? "Aún no has levantado reportes. Si algo falla en las áreas comunes, repórtalo aquí con una foto." : "Nada en esta lista."}</Vacio>
      )}
    </Pantalla>
  );
}
