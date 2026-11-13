import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Icono, type NombreIcono } from "@/components/vecino/Iconos";
import { BotonGrande, Cargando, LinkInvalido, Pantalla, Tarjeta, Titulo } from "@/components/vecino/Piezas";
import { responderTimbre } from "@/app/vecino/actions";
import { ActivarAvisos } from "@/components/vecino/ActivarAvisos";
import { Refrescar } from "@/components/vecino/Refrescar";
import { comunidadVecino, cuando, datosVecino, dineroMXN, urlsFirmadas } from "@/lib/condominios";

export default function InicioVecino({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

function Mosaico({ href, icono, texto, cuenta }: { href: string; icono: NombreIcono; texto: string; cuenta?: number }) {
  return (
    <Link href={href} className="relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-[#E1DCD0] bg-[#FBF9F4] text-lg text-[#1F1E1A]">
      <Icono nombre={icono} className="size-9" grueso={1.5} />
      {texto}
      {!!cuenta && (
        <span className="absolute top-3 right-3 flex min-w-6 items-center justify-center rounded-full bg-[#17583A] px-1.5 text-sm font-bold text-white" aria-label={`${cuenta} pendientes`}>
          {cuenta}
        </span>
      )}
    </Link>
  );
}

function Novedad({ href, icono, titulo, detalle }: { href: string; icono: NombreIcono; titulo: string; detalle: string }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-2xl border border-[#E1DCD0] bg-[#FBF9F4] p-4">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[#DCE8D5] text-[#2E4A33]">
        <Icono nombre={icono} className="size-8" grueso={1.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold">{titulo}</span>
        <span className="block truncate text-base text-[#5A5547]">{detalle}</span>
      </span>
      <Icono nombre="adelante" className="size-6 shrink-0 text-[#5A5547]" />
    </Link>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const [d, com] = await Promise.all([datosVecino(token), comunidadVecino(token)]);
  if (!d) return <LinkInvalido />;
  const base = `/vecino/${token}`;
  const timbre = (com?.llamadas ?? []).filter((l) => l.estado === "esperando");
  const votacion = com?.votaciones.find((v) => v.abierta && v.mi_voto === null && (!v.solo_propietarios || d.residente.tipo === "propietario"));
  const fotos = await urlsFirmadas([d.condominio.foto_path, ...timbre.map((l) => l.foto_path)]);
  const foto = d.condominio.foto_path ? fotos.get(d.condominio.foto_path) : null;
  const pendientes = d.paquetes.filter((p) => !p.entregado_at);
  const activos = d.pases.filter((p) => p.estado === "activo" && new Date(p.hasta) > new Date() && (p.max_usos === null || p.usos < p.max_usos));
  const abiertos = d.reportes.filter((r) => !["resuelto", "cancelado"].includes(r.estado));
  const respuesta = d.chat.at(-1)?.lado === "caseta" ? d.chat.at(-1) : null;
  const porRevisar = d.cuenta?.pagos.find((p) => p.estado === "pendiente");
  const aviso = d.avisos[0];

  return (
    <Pantalla>
      <Refrescar cada={12000} />
      <Titulo
        titulo={d.condominio.nombre}
        sub={d.vivienda.numero}
        accion={
          <Link href={`${base}/avisos`} aria-label="Avisos" className="relative -mr-2 flex size-12 items-center justify-center rounded-full hover:bg-black/5">
            <Icono nombre="campana" className="size-8" grueso={1.5} />
            {d.avisos.length > 0 && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-[#C2410C]" />}
          </Link>
        }
      />

      {timbre.map((l) => (
        <section key={l.id} role="alert" className="flex flex-col gap-3 rounded-2xl bg-[#17583A] p-5 text-white">
          <div className="flex items-center gap-4">
            {l.foto_path && fotos.get(l.foto_path) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotos.get(l.foto_path)} alt="" className="size-16 rounded-xl object-cover" />
            ) : (
              <Icono nombre="campana" className="size-10" />
            )}
            <div>
              <p className="text-sm text-white/80">Tocan el timbre · {cuando(l.created_at)}</p>
              <p className="text-2xl font-bold">{l.visitante}</p>
              {l.motivo && <p className="text-base text-white/90">{l.motivo}</p>}
            </div>
          </div>
          <form action={responderTimbre} className="grid grid-cols-2 gap-2">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="llamada_id" value={l.id} />
            <button name="decision" value="autorizar" className="min-h-14 rounded-xl bg-white text-lg font-bold text-[#17583A]">
              Dejar pasar
            </button>
            <button name="decision" value="rechazar" className="min-h-14 rounded-xl border-2 border-white/60 text-lg font-semibold">
              No lo conozco
            </button>
          </form>
        </section>
      ))}

      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt={`Foto de ${d.condominio.nombre}`} className="aspect-[2/1] w-full rounded-2xl object-cover" />
      ) : (
        <div aria-hidden="true" className="flex aspect-[2.4/1] w-full items-end rounded-2xl bg-[linear-gradient(135deg,#DCE8D5,#C9D9BF_45%,#E9E1CF)] p-5">
          <span className="font-display text-2xl font-bold text-[#2E4A33]/70">{d.condominio.administradora}</span>
        </div>
      )}

      {d.permisos.pases && (
        <BotonGrande href={`${base}/visitas/nuevo`} icono="qr">
          Crear pase QR
        </BotonGrande>
      )}

      <div className="grid grid-cols-2 gap-3">
        {d.permisos.ver_cuenta ? <Mosaico href={`${base}/cuenta`} icono="cuenta" texto="Mi cuenta" /> : <Mosaico href={`${base}/visitas`} icono="visitas" texto="Mis visitas" cuenta={activos.length} />}
        {d.permisos.reportes ? <Mosaico href={`${base}/reportes`} icono="alerta" texto="Reportar" cuenta={abiertos.length} /> : <Mosaico href={`${base}/avisos`} icono="campana" texto="Avisos" />}
        <Mosaico href={`${base}/caseta`} icono="caseta" texto="Caseta" />
        <Mosaico href={`${base}/paquetes`} icono="paquete" texto="Paquetes" cuenta={pendientes.length} />
        <Mosaico href={`${base}/amenidades`} icono="calendario" texto="Amenidades" />
        <Mosaico href={`${base}/mudanza`} icono="boleto" texto="Mudanza" />
        <Mosaico href={`${base}/comunidad`} icono="persona" texto="Comunidad" cuenta={votacion ? 1 : 0} />
        <Mosaico href={`${base}/accesos`} icono="llave" texto="Autos y entregas" />
      </div>
      <ActivarAvisos token={token} />

      <div className="flex flex-col gap-3">
        {pendientes[0] && <Novedad href={`${base}/paquetes`} icono="paquete" titulo={pendientes.length > 1 ? `${pendientes.length} paquetes recibidos` : "Paquete recibido"} detalle={`Disponible en caseta${pendientes[0].paqueteria ? ` · ${pendientes[0].paqueteria}` : ""}`} />}
        {respuesta && <Novedad href={`${base}/caseta`} icono="chat" titulo="Caseta te respondió" detalle={respuesta.texto} />}
        {porRevisar && <Novedad href={`${base}/cuenta`} icono="banco" titulo="Pago en revisión" detalle={`${dineroMXN(porRevisar.monto_centavos)} · la administración lo confirmará`} />}
        {activos[0] && <Novedad href={`${base}/visitas/${activos[0].id}`} icono="qr" titulo={activos.length > 1 ? `${activos.length} pases activos` : `Pase de ${activos[0].visitante}`} detalle={cuando(activos[0].desde)} />}
        {votacion && <Novedad href={`${base}/comunidad`} icono="check" titulo="Votación abierta" detalle={votacion.pregunta} />}
        {aviso && <Novedad href={`${base}/avisos`} icono="campana" titulo={aviso.titulo} detalle={aviso.cuerpo} />}
      </div>

      {d.comunidad.cobranza_pct !== null && (
        <Tarjeta className="p-4">
          <p className="text-base font-semibold">Tu comunidad este mes</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-sm text-[#5A5547]">Cobranza</dt>
              <dd className="text-xl font-bold">{d.comunidad.cobranza_pct}%</dd>
            </div>
            <div>
              <dt className="text-sm text-[#5A5547]">Gastos</dt>
              <dd className="text-xl font-bold">{dineroMXN(d.comunidad.gastos_centavos).replace(" MXN", "").replace(/\.\d\d$/, "")}</dd>
            </div>
            <div>
              <dt className="text-sm text-[#5A5547]">Reportes abiertos</dt>
              <dd className="text-xl font-bold">{d.comunidad.reportes_abiertos}</dd>
            </div>
          </dl>
        </Tarjeta>
      )}
      <p className="text-center text-sm text-[#5A5547]">
        Administra {d.condominio.administradora} con Black Key · Link personal de {d.residente.nombre}: no lo compartas.
      </p>
    </Pantalla>
  );
}
