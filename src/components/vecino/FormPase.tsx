"use client";

import { useActionState, useState } from "react";
import { crearPase } from "@/app/vecino/actions";
import { DIAS, TIPOS_VISITA } from "@/lib/condominios-datos";
import { Aviso, CAMPO, ETIQUETA } from "./Piezas";

const SERVICIOS = ["Limpieza", "Jardinería", "Niñera", "Cocina", "Chofer", "Cuidado de personas", "Otro"];

function Segmento({ opciones, valor, onCambio, nombre }: { opciones: [string, string][]; valor: string; onCambio: (v: string) => void; nombre: string }) {
  return (
    <div role="radiogroup" className="grid grid-flow-col gap-2">
      {opciones.map(([v, t]) => (
        <label key={v} className={`flex min-h-13 cursor-pointer items-center justify-center rounded-xl border px-3 text-lg ${valor === v ? "border-transparent bg-[#D5E6CF] font-semibold text-[#1E4D2B]" : "border-[#BDB8AC] bg-[#FBF9F4]"}`}>
          <input type="radio" name={nombre} value={v} checked={valor === v} onChange={() => onCambio(v)} className="sr-only" />
          {t}
        </label>
      ))}
    </div>
  );
}

// Crear pase de visita (un uso o recurrente) o dar de alta a personal doméstico.
export function FormPase({ token, hoy, personal, servicio = false }: { token: string; hoy: string; personal: boolean; servicio?: boolean }) {
  const [estado, accion, pendiente] = useActionState(crearPase, null);
  const [modalidad, setModalidad] = useState(personal ? "recurrente" : "unico");
  const finDeAno = `${hoy.slice(0, 4)}-12-31`;

  return (
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      {(personal || servicio) && <input type="hidden" name="tipo_visita" value="servicio" />}
      {personal && <input type="hidden" name="modalidad" value="recurrente" />}

      <label className={ETIQUETA}>
        {personal ? "Nombre completo" : servicio ? "Persona o empresa" : "¿Quién viene?"}
        <input name="visitante" required minLength={2} maxLength={120} autoComplete="off" placeholder={personal ? "María López" : servicio ? "Plomería Ruiz" : "Ana"} className={CAMPO} />
      </label>
      {servicio && (
        <label className={ETIQUETA}>
          Trabajo autorizado
          <textarea name="trabajo" required minLength={3} maxLength={300} rows={2} placeholder="Revisar fuga en baño de visitas. Trae herramienta y refacciones." className={`${CAMPO} py-3`} />
        </label>
      )}

      {personal ? (
        <label className={ETIQUETA}>
          Tipo de servicio
          <select name="servicio" className={CAMPO} defaultValue="Limpieza">
            {SERVICIOS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      ) : servicio ? null : (
        <>
          <label className={ETIQUETA}>
            Tipo de visita
            <select name="tipo_visita" className={CAMPO} defaultValue="visita">
              {TIPOS_VISITA.filter(([v]) => v !== "servicio").map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-base font-semibold">¿Cuántas veces?</legend>
            <Segmento nombre="modalidad" valor={modalidad} onCambio={setModalidad} opciones={[["unico", "Un solo uso"], ["recurrente", "Recurrente"]]} />
          </fieldset>
        </>
      )}

      {modalidad === "recurrente" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-base font-semibold">{personal ? "Días autorizados" : "Días"}</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {DIAS.map(([n, t]) => (
              <label key={n} className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-[#BDB8AC] bg-[#FBF9F4] text-base has-checked:border-transparent has-checked:bg-[#D5E6CF] has-checked:font-bold has-checked:text-[#1E4D2B]">
                <input type="checkbox" name="dias" value={n} defaultChecked={n <= 5} className="sr-only" />
                {t}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className={`${ETIQUETA} col-span-2`}>
          {modalidad === "unico" ? "Día" : "Desde"}
          <input type="date" name="fecha" required defaultValue={hoy} min={hoy} className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          {modalidad === "unico" ? "Llega desde" : "Horario de"}
          <input type="time" name="hora_desde" required defaultValue={modalidad === "unico" ? "16:00" : "09:00"} className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          hasta
          <input type="time" name="hora_hasta" required defaultValue={modalidad === "unico" ? "20:00" : "14:00"} className={CAMPO} />
        </label>
        {modalidad === "recurrente" && (
          <label className={`${ETIQUETA} col-span-2`}>
            Vigencia: hasta el
            <input type="date" name="fecha_fin" required defaultValue={personal ? finDeAno : hoy} min={hoy} className={CAMPO} />
          </label>
        )}
      </div>

      {personal ? (
        <label className={ETIQUETA}>
          Método de acceso
          <select name="metodo" className={CAMPO} defaultValue="qr">
            <option value="qr">Pase QR recurrente</option>
            <option value="lista">Caseta la busca por nombre (sin celular)</option>
          </select>
        </label>
      ) : (
        <>
          <label className={ETIQUETA}>
            Placas (opcional)
            <input name="placa" maxLength={12} autoCapitalize="characters" placeholder="UAB-123-C" className={CAMPO} />
          </label>
          <label className="flex min-h-13 cursor-pointer items-center gap-3 rounded-xl border border-[#BDB8AC] bg-[#FBF9F4] px-4 text-lg has-checked:border-transparent has-checked:bg-[#D5E6CF] has-checked:text-[#1E4D2B]">
            <input type="checkbox" name="cajon" value="si" className="size-5 accent-[#17583A]" />
            Apartar cajón de visitas
          </label>
          <label className={ETIQUETA}>
            Indicaciones para tu visita (opcional)
            <textarea name="instrucciones" maxLength={500} rows={2} placeholder="Toca en la puerta de atrás." className={`${CAMPO} py-3`} />
          </label>
        </>
      )}

      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <button type="submit" disabled={pendiente} className="min-h-16 rounded-2xl bg-[#17583A] px-5 text-xl font-semibold text-white disabled:opacity-60">
        {pendiente ? "Creando…" : personal ? "Autorizar acceso" : "Crear pase"}
      </button>
    </form>
  );
}
