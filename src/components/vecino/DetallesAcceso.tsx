import { Fila } from "./Piezas";

type Ctx = { folio: number | null; acceso: string | null; instrucciones: string | null; trabajo: string | null; recursos: string[] | null; cajon: string | null; evento: string | null };

const RECURSO: Record<string, string> = { zona_carga: "Zona de carga", elevador: "Elevador de servicio" };

// Lo que necesita saber quien llega: por dónde entra, qué hace en caseta, dónde se estaciona y qué trabajo está autorizado.
export function DetallesAcceso({ ctx }: { ctx: Ctx }) {
  return (
    <div className="divide-y divide-[#E1DCD0] border-y border-[#E1DCD0]">
      {ctx.folio != null && <Fila icono="boleto">Folio #{ctx.folio} · si la cámara falla, dilo en caseta</Fila>}
      {ctx.evento && <Fila icono="persona">Invitada(o) a: {ctx.evento}</Fila>}
      {ctx.acceso && <Fila icono="llave">Entra por: {ctx.acceso}</Fila>}
      {ctx.cajon && <Fila icono="inicio">Cajón de visitas {ctx.cajon}</Fila>}
      {ctx.recursos?.length ? <Fila icono="check">Apartado: {ctx.recursos.map((r) => RECURSO[r] ?? r).join(" y ")}</Fila> : null}
      {ctx.trabajo && <Fila icono="documento">Trabajo autorizado: {ctx.trabajo}</Fila>}
      {ctx.instrucciones && <Fila icono="alerta">{ctx.instrucciones}</Fila>}
    </div>
  );
}
