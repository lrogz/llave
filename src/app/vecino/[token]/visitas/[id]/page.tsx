import { Suspense } from "react";
import { connection } from "next/server";
import QRCode from "qrcode";
import { cancelarPase } from "@/app/vecino/actions";
import { Boton } from "@/components/Boton";
import { Icono } from "@/components/vecino/Iconos";
import { Aviso, Cargando, Chip, Fila, LinkInvalido, Pantalla, Titulo } from "@/components/vecino/Piezas";
import { DIAS, cuando, datosVecino, estadoPase, etiquetaDe, hora, vigencia } from "@/lib/condominios";
import { linkWhatsApp, origen } from "@/lib/util";

export default function DetallePase({ params, searchParams }: { params: Promise<{ token: string; id: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: { params: Promise<{ token: string; id: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  await connection();
  const [{ token, id }, { nuevo }] = await Promise.all([params, searchParams]);
  const d = await datosVecino(token);
  if (!d) return <LinkInvalido />;
  const p = d.pases.find((x) => x.id === id);
  if (!p) return <LinkInvalido />;
  const e = estadoPase(p);
  const url = `${await origen()}/pase/${p.codigo}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#FFFFFF" } });
  const dias = p.dias?.length ? p.dias.map((n) => etiquetaDe(DIAS, n)).join(", ") : "Todos los días";
  const mensaje =
    p.metodo_acceso === "lista"
      ? `Hola ${p.visitante}, ya estás autorizada(o) para entrar a ${d.condominio.nombre} (${d.vivienda.numero}): ${dias}, ${p.hora_desde?.slice(0, 5) ?? ""} a ${p.hora_hasta?.slice(0, 5) ?? ""}. En caseta da tu nombre.`
      : `Hola ${p.visitante}, este es tu pase para entrar a ${d.condominio.nombre}. Muéstralo en caseta: ${url}`;

  return (
    <Pantalla>
      <Titulo titulo={p.servicio ? "Personal autorizado" : "Pase de visita"} atras={`/vecino/${token}/visitas`} />
      {nuevo && <Aviso>Listo. Compártelo por WhatsApp a tu visita.</Aviso>}
      <div className="flex justify-center">
        <Chip texto={e.texto} clase={e.clase} />
      </div>
      {p.metodo_acceso === "qr" ? (
        <div className={`mx-auto w-full max-w-72 rounded-2xl border border-[#E1DCD0] bg-white p-6 ${e.vigente ? "" : "opacity-40 grayscale"}`}>
          <div className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="Código QR del pase" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="mt-3 text-center font-mono text-base tracking-[0.2em] text-[#5A5547]">{p.codigo}</p>
        </div>
      ) : (
        <p className="rounded-2xl border border-[#E1DCD0] bg-white p-5 text-center text-lg">Sin QR: caseta la tiene en su lista de personal autorizado y la registra por nombre.</p>
      )}
      <div>
        <h2 className="font-display text-3xl font-bold">{p.servicio ? p.visitante : `Visita de ${p.visitante}`}</h2>
        <p className="text-lg text-[#5A5547]">
          {d.vivienda.numero}
          {p.servicio ? ` · ${p.servicio}` : ""}
          {p.placa ? ` · ${p.placa}` : ""}
        </p>
      </div>
      <div className="divide-y divide-[#E1DCD0] border-y border-[#E1DCD0]">
        {p.modalidad === "unico" ? (
          <>
            <Fila icono="calendario">{vigencia(p.desde, p.hasta)}</Fila>
            <Fila icono="boleto">{p.usos ? "Ya entró" : "Un solo uso"}</Fila>
          </>
        ) : (
          <>
            <Fila icono="calendario">
              {dias}
              {p.hora_desde ? ` · ${p.hora_desde.slice(0, 5)} a ${p.hora_hasta?.slice(0, 5) ?? ""}` : ""}
            </Fila>
            <Fila icono="reloj">Hasta el {cuando(p.hasta).split(" · ")[0]}</Fila>
            <Fila icono="boleto">Recurrente · {p.usos} entradas</Fila>
          </>
        )}
      </div>
      {e.vigente && (
        <div className="flex flex-col gap-3">
          <a href={linkWhatsApp(null, mensaje)} target="_blank" rel="noopener" className="flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-[#17583A] px-5 text-xl font-semibold text-white">
            <Icono nombre="whatsapp" className="size-7" />
            Compartir por WhatsApp
          </a>
          <form action={cancelarPase}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="pase_id" value={p.id} />
            <Boton estilo="claro" enviando="Cancelando…" className="min-h-14 w-full rounded-2xl! border-[#BDB8AC]! bg-[#FBF9F4]! text-lg! font-medium!">
              Cancelar pase
            </Boton>
          </form>
        </div>
      )}
      <p className="text-center text-sm text-[#5A5547]">Creado {cuando(p.created_at)}{p.estado === "cancelado" ? "" : ` · vence ${hora(p.hasta)}`}</p>
    </Pantalla>
  );
}
