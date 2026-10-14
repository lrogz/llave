"use client";

import { useActionState } from "react";
import { solicitarRed } from "./actions";

const campo = "min-h-12 w-full min-w-0 rounded-xl border border-borde bg-white px-3 text-base outline-none focus:border-verde";

export function FormRed({ categorias, zonas }: { categorias: [string, string][]; zonas: string[] }) {
  const [estado, accion, pendiente] = useActionState(solicitarRed, null);
  const v = estado?.valores ?? {};
  return (
    <form key={JSON.stringify(v)} action={accion} className="flex flex-col gap-4">
      <input name="empresa" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Nombre o negocio
          <input name="nombre" required defaultValue={v.nombre} maxLength={120} placeholder="Plomería Hernández" className={`${campo} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Persona de contacto
          <input name="contacto" defaultValue={v.contacto} maxLength={120} className={`${campo} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Celular (WhatsApp)
          <input name="telefono" required type="tel" defaultValue={v.telefono} maxLength={30} className={`${campo} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Correo
          <input name="email" type="email" defaultValue={v.email} maxLength={160} className={`${campo} font-normal`} />
        </label>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">¿Qué servicios das?</legend>
        <div className="flex flex-wrap gap-2">
          {categorias.map(([valor, texto]) => (
            <label key={valor} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-borde bg-white px-3 text-sm has-checked:border-verde has-checked:bg-verde-claro has-checked:font-bold">
              <input type="checkbox" name="especialidades" value={valor} defaultChecked={v.especialidades?.split(",").includes(valor)} className="accent-verde" />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Zonas donde trabajas (separadas por coma)
        <input name="zonas" defaultValue={v.zonas} list="zonas" maxLength={300} placeholder="Jurica, Juriquilla, Querétaro centro" className={`${campo} font-normal`} />
        <datalist id="zonas">
          {zonas.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Años de experiencia
          <input name="experiencia" inputMode="numeric" defaultValue={v.experiencia} maxLength={2} className={`${campo} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Precio desde (visita o trabajo mínimo)
          <input name="precio_desde" inputMode="decimal" defaultValue={v.precio_desde} placeholder="$350" className={`${campo} font-normal`} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Cuéntanos de tu trabajo
        <textarea name="descripcion" rows={3} defaultValue={v.descripcion} maxLength={1000} placeholder="Qué haces, garantía que das, si facturas…" className={`${campo} py-2 font-normal`} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acepto" className="mt-1 size-4 accent-verde" />
        <span>
          Acepto los <a href="/terminos" target="_blank" className="underline">términos</a> y el <a href="/privacidad" target="_blank" className="underline">aviso de privacidad</a>, y que Black Key verifique mis documentos.
        </span>
      </label>
      <button type="submit" disabled={pendiente} className="min-h-13 rounded-xl bg-verde text-base font-bold text-white disabled:opacity-60">
        {pendiente ? "Enviando…" : "Enviar solicitud"}
      </button>
      {estado && !estado.ok && (
        <p role="alert" className="text-sm text-naranja-oscuro">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
