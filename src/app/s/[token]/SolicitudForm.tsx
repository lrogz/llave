"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CAMPOS_SOLICITUD } from "@/lib/solicitud";
import { enviarSolicitud } from "./actions";

const campo = "min-h-12 w-full min-w-0 rounded-xl border border-borde bg-white px-3 text-base outline-none focus:border-verde";

export function SolicitudForm({ token, iniciales, org }: { token: string; iniciales: Record<string, string>; org: string }) {
  const [estado, accion, pendiente] = useActionState(enviarSolicitud, null);
  const router = useRouter();
  useEffect(() => {
    if (estado?.ok) router.refresh();
  }, [estado, router]);
  const v = estado?.valores ?? iniciales;
  return (
    <form key={JSON.stringify(v)} action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre completo" name="nombre" v={v} requerido />
        <Campo etiqueta="Celular (WhatsApp)" name="telefono" v={v} modo="tel" requerido />
        <Campo etiqueta="Correo" name="email" v={v} modo="email" />
        {CAMPOS_SOLICITUD.map((c) =>
          "tipo" in c && c.tipo === "select" ? (
            <label key={c.clave} className="flex flex-col gap-1 text-sm font-semibold">
              {c.texto}
              <select name={c.clave} defaultValue={v[c.clave] ?? ""} className={`${campo} font-normal`}>
                <option value="">Elige…</option>
                {c.opciones.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          ) : "tipo" in c && c.tipo === "textarea" ? (
            <label key={c.clave} className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
              {c.texto}
              <textarea name={c.clave} rows={3} maxLength={1000} defaultValue={v[c.clave] ?? ""} className={`${campo} py-2 font-normal`} />
            </label>
          ) : (
            <Campo key={c.clave} etiqueta={c.texto} name={c.clave} v={v} modo={"tipo" in c && c.tipo === "date" ? "date" : "modo" in c ? c.modo : undefined} placeholder={"placeholder" in c ? c.placeholder : undefined} />
          ),
        )}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="autorizo" className="mt-1 size-4 accent-verde" />
        Autorizo a {org} a revisar esta información y mis documentos, y a compartirlos con su proveedor de investigación y póliza jurídica (por ejemplo, Morada Uno) solo para evaluar este arrendamiento.
      </label>
      <button type="submit" disabled={pendiente} className="min-h-13 rounded-xl bg-verde text-base font-bold text-white disabled:opacity-60">
        {pendiente ? "Enviando…" : "Enviar solicitud"}
      </button>
      {estado && (
        <p role={estado.ok ? "status" : "alert"} className={`text-sm ${estado.ok ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

function Campo({ etiqueta, name, v, modo, placeholder, requerido }: { etiqueta: string; name: string; v: Record<string, string>; modo?: string; placeholder?: string; requerido?: boolean }) {
  const tipo = modo === "date" ? "date" : modo === "email" ? "email" : modo === "tel" ? "tel" : "text";
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {etiqueta}
      <input name={name} type={tipo} inputMode={modo === "decimal" || modo === "numeric" ? modo : undefined} required={requerido} defaultValue={v[name] ?? ""} placeholder={placeholder} maxLength={160} className={`${campo} font-normal`} />
    </label>
  );
}
