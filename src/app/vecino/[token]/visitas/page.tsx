import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Icono } from "@/components/vecino/Iconos";
import { BotonContorno, BotonGrande, Cargando, Chip, LinkInvalido, Pantalla, Tarjeta, Titulo, Vacio } from "@/components/vecino/Piezas";
import { TIPOS_VISITA, cuando, datosVecino, estadoPase, etiquetaDe, vigencia, type DatosVecino } from "@/lib/condominios";

export default function Visitas({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const d = await datosVecino(token);
  if (!d) return <LinkInvalido />;
  const base = `/vecino/${token}`;
  const vigentes = d.pases.filter((p) => estadoPase(p).vigente);
  const otros = d.pases.filter((p) => !estadoPase(p).vigente).slice(0, 10);

  const Item = ({ p }: { p: DatosVecino["pases"][number] }) => {
    const e = estadoPase(p);
    return (
      <li>
        <Link href={`${base}/visitas/${p.id}`} className="flex items-center gap-3 px-4 py-4">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold">{p.visitante}</span>
            <span className="block text-base text-[#5A5547]">
              {p.servicio ?? etiquetaDe(TIPOS_VISITA, p.tipo_visita)} · {p.modalidad === "unico" ? vigencia(p.desde, p.hasta) : `Recurrente hasta ${cuando(p.hasta).split(" · ")[0]}`}
            </span>
          </span>
          <Chip texto={e.texto} clase={e.clase} />
          <Icono nombre="adelante" className="size-5 text-[#5A5547]" />
        </Link>
      </li>
    );
  };

  return (
    <Pantalla>
      <Titulo titulo="Visitas" sub={d.vivienda.numero} />
      {d.permisos.pases ? (
        <div className="flex flex-col gap-3">
          <BotonGrande href={`${base}/visitas/nuevo`} icono="qr">
            Crear pase QR
          </BotonGrande>
          <BotonContorno href={`${base}/fiesta`}>Fiesta o reunión (un pase por invitado)</BotonContorno>
          <BotonContorno href={`${base}/visitas/nuevo?personal=1`}>Alta de personal doméstico</BotonContorno>
        </div>
      ) : (
        <Vacio>Tu cuenta no puede crear pases. Pídelo a tu administración.</Vacio>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Pases activos</h2>
        {vigentes.length ? (
          <Tarjeta>
            <ul className="divide-y divide-[#E1DCD0]">{vigentes.map((p) => <Item key={p.id} p={p} />)}</ul>
          </Tarjeta>
        ) : (
          <Vacio>No tienes pases activos.</Vacio>
        )}
      </section>

      {otros.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">Anteriores</h2>
          <Tarjeta>
            <ul className="divide-y divide-[#E1DCD0]">{otros.map((p) => <Item key={p.id} p={p} />)}</ul>
          </Tarjeta>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Entradas y salidas</h2>
        {d.accesos.length ? (
          <Tarjeta>
            <ul className="divide-y divide-[#E1DCD0]">
              {d.accesos.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-base">
                  <span className="min-w-0 truncate">
                    <b className={a.tipo === "entrada" ? "text-[#17583A]" : "text-[#5A5547]"}>{a.tipo === "entrada" ? "Entró" : "Salió"}</b> {a.visitante}
                  </span>
                  <span className="shrink-0 text-[#5A5547]">{cuando(a.ocurrio_at)}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : (
          <Vacio>Aquí verás quién entra y sale de tu vivienda.</Vacio>
        )}
      </section>
    </Pantalla>
  );
}
