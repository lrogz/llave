"use client";

import { useActionState } from "react";
import { activarFacturacionDueno, facturar, facturarMes, guardarFiscalInquilino } from "@/app/facturacion/actions";

const campo = "min-h-11 min-w-0 rounded-xl border border-borde bg-white px-3 text-sm outline-none focus:border-verde";
const REGIMENES = [
  ["606", "606 · Arrendamiento"],
  ["612", "612 · Actividades empresariales y profesionales"],
  ["626", "626 · RESICO"],
  ["601", "601 · General de Ley Personas Morales"],
  ["603", "603 · Personas Morales sin fines de lucro"],
  ["605", "605 · Sueldos y salarios"],
  ["616", "616 · Sin obligaciones fiscales"],
];

function Mensaje({ estado }: { estado: { ok: boolean; mensaje: string } | null }) {
  if (!estado) return null;
  return (
    <p role="status" className={`text-sm ${estado.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
      {estado.mensaje}
    </p>
  );
}

type Fiscal = { rfc: string; razon_social: string; regimen_fiscal: string; cp_fiscal: string };

export function FormFiscalDueno({ duenoId, datos: iniciales }: { duenoId: string; datos: Fiscal }) {
  const [estado, accion, pendiente] = useActionState(activarFacturacionDueno, null);
  const datos = { ...iniciales, ...(estado?.valores ?? {}) } as Fiscal;
  return (
    <form key={JSON.stringify(estado?.valores ?? null)} action={accion} className="flex flex-col gap-2">
      <input type="hidden" name="dueno_id" value={duenoId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="rfc" required defaultValue={datos.rfc} maxLength={13} placeholder="RFC" aria-label="RFC del dueño" className={`${campo} uppercase`} />
        <input name="cp_fiscal" required defaultValue={datos.cp_fiscal} inputMode="numeric" maxLength={5} placeholder="C.P. fiscal" aria-label="Código postal fiscal del dueño" className={campo} />
      </div>
      <input name="razon_social" required defaultValue={datos.razon_social} placeholder="Nombre o razón social (como en la constancia)" aria-label="Razón social del dueño" className={`${campo} uppercase`} />
      <select name="regimen_fiscal" required defaultValue={datos.regimen_fiscal || "606"} aria-label="Régimen fiscal del dueño" className={campo}>
        {REGIMENES.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
      <fieldset className="flex flex-col gap-2 rounded-xl border border-borde-suave p-3">
        <legend className="px-1 text-xs font-semibold text-gris">Sello digital (CSD) del SAT · no es la e.firma</legend>
        <label className="flex flex-col gap-1 text-xs text-gris">
          Certificado (.cer)
          <input type="file" name="cer" accept=".cer" aria-label="Archivo .cer" className="text-sm text-tinta" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gris">
          Llave privada (.key)
          <input type="file" name="key" accept=".key" aria-label="Archivo .key" className="text-sm text-tinta" />
        </label>
        <input type="password" name="contrasena" autoComplete="off" placeholder="Contraseña de la llave" aria-label="Contraseña del sello" className={campo} />
        <span className="text-xs text-gris">La contraseña no se guarda en Black Key: se manda directo al PAC (Facturapi) para sellar las facturas.</span>
      </fieldset>
      <button type="submit" disabled={pendiente} className="min-h-11 self-start rounded-xl bg-verde px-4 text-sm font-bold text-white disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar y activar facturación"}
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}

export function FormFiscalInquilino({ inquilinoId, datos: iniciales }: { inquilinoId: string; datos: Fiscal & { uso_cfdi: string; factura_automatica: boolean } }) {
  const [estado, accion, pendiente] = useActionState(guardarFiscalInquilino, null);
  const datos = { ...iniciales, ...(estado?.valores ?? {}) } as Fiscal & { uso_cfdi: string; factura_automatica: boolean };
  return (
    <form key={JSON.stringify(estado?.valores ?? null)} action={accion} className="flex flex-col gap-2">
      <input type="hidden" name="inquilino_id" value={inquilinoId} />
      <p className="text-xs text-gris">Déjalo en blanco si no pide factura: se le factura a público en general.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="rfc" defaultValue={datos.rfc} maxLength={13} placeholder="RFC" aria-label="RFC del inquilino" className={`${campo} uppercase`} />
        <input name="cp_fiscal" defaultValue={datos.cp_fiscal} inputMode="numeric" maxLength={5} placeholder="C.P. fiscal" aria-label="Código postal fiscal del inquilino" className={campo} />
      </div>
      <input name="razon_social" defaultValue={datos.razon_social} placeholder="Nombre o razón social (como en su constancia)" aria-label="Razón social del inquilino" className={`${campo} uppercase`} />
      <div className="grid gap-2 sm:grid-cols-2">
        <select name="regimen_fiscal" defaultValue={datos.regimen_fiscal || "605"} aria-label="Régimen fiscal del inquilino" className={campo}>
          {REGIMENES.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        <select name="uso_cfdi" defaultValue={datos.uso_cfdi || "G03"} aria-label="Uso del CFDI" className={campo}>
          <option value="G03">G03 · Gastos en general</option>
          <option value="S01">S01 · Sin efectos fiscales</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="factura_automatica" defaultChecked={datos.factura_automatica} className="size-4 accent-verde" />
        Facturar solo cada vez que se registre su pago
      </label>
      <button type="submit" disabled={pendiente} className="min-h-11 self-start rounded-xl border border-borde bg-white px-4 text-sm font-bold disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar datos fiscales"}
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}

export function BotonFacturarMes({ periodo }: { periodo: string }) {
  const [estado, accion, pendiente] = useActionState(facturarMes, null);
  return (
    <form action={accion} className="flex flex-col gap-1">
      <input type="hidden" name="periodo" value={periodo} />
      <button type="submit" disabled={pendiente} className="flex min-h-11 items-center rounded-xl border border-borde bg-white px-4 text-sm font-bold disabled:opacity-60">
        {pendiente ? "Timbrando…" : "Facturar rentas pagadas del mes"}
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}

export function BotonFacturar({ cobroId }: { cobroId: string }) {
  const [estado, accion, pendiente] = useActionState(facturar, null);
  return (
    <form action={accion} className="flex flex-col gap-1">
      <input type="hidden" name="cobro_id" value={cobroId} />
      <button type="submit" disabled={pendiente} className="self-start text-xs font-semibold text-verde underline disabled:opacity-60">
        {pendiente ? "Timbrando…" : "Facturar"}
      </button>
      {estado && !estado.ok && <span className="text-xs text-naranja-oscuro">{estado.mensaje}</span>}
    </form>
  );
}
