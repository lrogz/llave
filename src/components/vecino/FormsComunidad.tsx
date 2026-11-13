"use client";

import { useActionState } from "react";
import { crearPinEntrega, guardarVehiculo, publicar } from "@/app/vecino/actions";
import { TIPOS_TABLERO } from "@/lib/condominios-datos";
import { Aviso, CAMPO, ETIQUETA } from "./Piezas";

const BOTON = "min-h-14 rounded-2xl bg-[#17583A] px-5 text-lg font-semibold text-white disabled:opacity-60";

export function FormPublicar({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(publicar, null);
  return (
    <form action={accion} className="flex flex-col gap-3 rounded-2xl border border-[#E1DCD0] bg-[#FBF9F4] p-4">
      <input type="hidden" name="token" value={token} />
      <select name="tipo" className={CAMPO} aria-label="Tipo" defaultValue="recomendacion">
        {TIPOS_TABLERO.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
      <input name="titulo" required minLength={3} maxLength={100} placeholder="Título" className={CAMPO} aria-label="Título" />
      <textarea name="texto" required rows={3} maxLength={1000} placeholder="Cuéntales a tus vecinos" className={`${CAMPO} py-3`} aria-label="Texto" />
      <p className="text-sm text-[#5A5547]">Se publica con tu nombre de pila. Tu teléfono no se muestra; te pueden responder aquí.</p>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso>{estado.ok}</Aviso>}
      <button disabled={pendiente} className={BOTON}>
        {pendiente ? "Publicando…" : "Publicar"}
      </button>
    </form>
  );
}

export function FormVehiculo({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(guardarVehiculo, null);
  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <div className="grid grid-cols-2 gap-3">
        <label className={ETIQUETA}>
          Placa
          <input name="placa" required autoCapitalize="characters" placeholder="UAB-123-C" className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          Auto
          <input name="descripcion" placeholder="Jetta gris" className={CAMPO} />
        </label>
      </div>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso>{estado.ok}</Aviso>}
      <button disabled={pendiente} className={BOTON}>
        {pendiente ? "Guardando…" : "Registrar mi auto"}
      </button>
    </form>
  );
}

export function FormPin({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(crearPinEntrega, null);
  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <div className="grid grid-cols-2 gap-3">
        <label className={ETIQUETA}>
          ¿Qué esperas?
          <input name="descripcion" placeholder="Amazon" className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          Válido por
          <select name="dias" defaultValue="3" className={CAMPO}>
            <option value="1">1 día</option>
            <option value="3">3 días</option>
            <option value="7">1 semana</option>
          </select>
        </label>
      </div>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.ok && (
        <div className="rounded-2xl bg-[#DCE8D5] p-5 text-center">
          <p className="text-base">Código para el repartidor</p>
          <p className="font-mono text-5xl font-bold tracking-[0.2em]">{estado.ok}</p>
          <p className="mt-1 text-sm">Ponlo en las instrucciones de entrega. Sirve una sola vez.</p>
        </div>
      )}
      <button disabled={pendiente} className={BOTON}>
        {pendiente ? "Generando…" : "Generar código de entrega"}
      </button>
    </form>
  );
}
