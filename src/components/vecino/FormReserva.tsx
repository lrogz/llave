"use client";

import { useActionState, useMemo, useState } from "react";
import { reservar } from "@/app/vecino/actions";
import type { Amenidad } from "@/lib/condominios";
import { dinero, dineroMXN } from "@/lib/condominios-datos";
import { Icono } from "./Iconos";
import { Aviso, CAMPO } from "./Piezas";

const diaFmt = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", timeZone: "UTC" });
const largoFmt = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const aHora = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const instante = (fecha: string, min: number) => new Date(`${fecha}T${aHora(min)}:00-06:00`).getTime() + (min >= 1440 ? 86400_000 : 0);

function Opcion({ activa, deshabilitada, onClick, children }: { activa: boolean; deshabilitada?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      disabled={deshabilitada}
      onClick={onClick}
      className={`min-h-14 rounded-xl border text-xl disabled:border-dashed disabled:text-[#A8A396] disabled:line-through ${activa ? "border-transparent bg-[#D5E6CF] font-semibold text-[#1E4D2B]" : "border-[#BDB8AC] bg-[#FBF9F4]"}`}
    >
      {children}
    </button>
  );
}

// Reservar una amenidad: días, horarios con lugar y, si se renta, el total inicial.
export function FormReserva({ token, a, hoy }: { token: string; a: Amenidad; hoy: string }) {
  const [estado, accion, pendiente] = useActionState(reservar, null);
  const dias = useMemo(() => Array.from({ length: 14 }, (_, i) => new Date(Date.parse(`${hoy}T12:00:00Z`) + i * 86400_000).toISOString().slice(0, 10)), [hoy]);
  const [dia, setDia] = useState(dias[0]);
  const [minutos, setMinutos] = useState(a.duraciones[0]);
  const [hora, setHora] = useState<number | null>(null);
  const [personas, setPersonas] = useState(a.modo === "turnos" ? 1 : Math.min(10, a.capacidad));
  const [verDias, setVerDias] = useState(3);
  const [ahora] = useState(() => Date.now());

  const abre = aMin(a.hora_abre);
  const cierra = a.hora_cierra.startsWith("23:59") ? 1440 : aMin(a.hora_cierra);
  const paso = a.modo === "turnos" ? 60 : 60;
  const horarios = [];
  for (let m = abre; m + minutos <= cierra; m += paso) {
    const ini = instante(dia, m);
    const fin = ini + minutos * 60_000;
    const choques = a.ocupacion.filter((o) => Date.parse(o.inicio) < fin && Date.parse(o.fin) > ini);
    const lleno = a.modo === "turnos" ? choques.reduce((s, o) => s + o.personas, 0) + personas > a.capacidad : choques.length > 0;
    horarios.push({ m, lleno, pasado: ini < ahora });
  }
  const total = Number(a.renta_centavos) + Number(a.deposito_centavos);

  return (
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="amenidad_id" value={a.id} />
      <input type="hidden" name="fecha" value={dia} />
      <input type="hidden" name="hora" value={hora === null ? "" : aHora(hora)} />
      <input type="hidden" name="minutos" value={minutos} />
      <input type="hidden" name="personas" value={personas} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-xl font-bold">Fecha</legend>
        <div className="grid grid-cols-3 gap-3">
          {dias.slice(0, verDias).map((d) => (
            <Opcion key={d} activa={d === dia} onClick={() => (setDia(d), setHora(null))}>
              {cap(diaFmt.format(new Date(`${d}T12:00:00Z`)))}
            </Opcion>
          ))}
        </div>
        {verDias < dias.length && (
          <button type="button" onClick={() => setVerDias(verDias + 3)} className="self-start text-base font-semibold text-[#17583A] underline underline-offset-4">
            Ver más días
          </button>
        )}
      </fieldset>

      <div className="flex items-center justify-between gap-4">
        <label htmlFor="duracion" className="text-xl font-bold">
          Duración
        </label>
        <select id="duracion" value={minutos} onChange={(e) => (setMinutos(Number(e.target.value)), setHora(null))} className={`${CAMPO} max-w-52`}>
          {a.duraciones.map((d) => (
            <option key={d} value={d}>
              {d % 60 === 0 && d >= 120 ? `${d / 60} horas` : `${d} min`}
            </option>
          ))}
        </select>
      </div>

      {a.modo === "solicitud" && (
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="personas" className="text-xl font-bold">
            Personas
          </label>
          <input id="personas" type="number" min={1} max={a.capacidad} value={personas} onChange={(e) => setPersonas(Math.max(1, Math.min(a.capacidad, Number(e.target.value) || 1)))} className={`${CAMPO} max-w-52`} />
        </div>
      )}

      <fieldset>
        <legend className="mb-3 text-xl font-bold">Horarios disponibles</legend>
        <div className="grid grid-cols-3 gap-3">
          {horarios.map((h) => (
            <Opcion key={h.m} activa={hora === h.m} deshabilitada={h.lleno || h.pasado} onClick={() => setHora(h.m)}>
              {aHora(h.m)}
            </Opcion>
          ))}
        </div>
        {!horarios.some((h) => !h.lleno && !h.pasado) && <p className="mt-2 text-base text-[#5A5547]">No hay horarios libres este día. Prueba otro.</p>}
      </fieldset>

      {a.modo === "turnos" ? (
        <div className="flex items-center justify-between gap-4">
          <span className="text-xl font-bold">Costo</span>
          <span className="flex min-h-13 w-52 items-center rounded-xl border border-[#BDB8AC] bg-[#FBF9F4] px-4 text-lg">{Number(a.renta_centavos) ? dinero(a.renta_centavos) : "Incluido"}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {hora !== null && (
            <div className="flex items-center gap-4 rounded-xl border border-[#E1DCD0] bg-[#FBF9F4] px-4 py-3 text-lg">
              <Icono nombre="calendario" className="size-7" grueso={1.5} />
              {cap(largoFmt.format(new Date(`${dia}T12:00:00Z`)))} · {aHora(hora)} a {aHora(hora + minutos)}
            </div>
          )}
          <div className="flex items-center gap-4 rounded-xl border border-[#E1DCD0] bg-[#FBF9F4] px-4 py-3 text-lg">
            <Icono nombre="persona" className="size-7" grueso={1.5} />
            Hasta {a.capacidad} personas
          </div>
          {total > 0 && (
            <dl className="rounded-xl border border-[#E1DCD0] bg-[#FBF9F4] px-4 py-3 text-lg">
              <div className="flex justify-between py-1">
                <dt>Renta</dt>
                <dd className="tabular-nums">{dinero(a.renta_centavos)}</dd>
              </div>
              <div className="flex justify-between py-1">
                <dt>Depósito reembolsable</dt>
                <dd className="tabular-nums">{dinero(a.deposito_centavos)}</dd>
              </div>
              <div className="mt-2 flex justify-between border-t border-[#E1DCD0] pt-3 text-xl font-bold">
                <dt>Total inicial</dt>
                <dd className="tabular-nums">{dineroMXN(total)}</dd>
              </div>
            </dl>
          )}
          {a.reglas && (
            <details className="rounded-xl border border-[#BDB8AC] bg-[#FBF9F4]">
              <summary className="flex min-h-13 cursor-pointer list-none items-center justify-center text-lg">Ver reglas</summary>
              <p className="px-4 pb-4 text-base whitespace-pre-line">{a.reglas}</p>
            </details>
          )}
          <p className="text-base text-[#5A5547]">La administración aprueba la solicitud. Al aprobarla, la renta y el depósito se suman a tu estado de cuenta; el depósito se devuelve después del evento si todo está en orden.</p>
        </div>
      )}

      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <button type="submit" disabled={pendiente || hora === null} className="min-h-16 rounded-2xl bg-[#17583A] px-5 text-xl font-semibold text-white disabled:opacity-50">
        {pendiente ? "Enviando…" : a.modo === "turnos" ? "Confirmar reserva" : "Solicitar reserva"}
      </button>
    </form>
  );
}
