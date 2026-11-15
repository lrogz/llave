"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import {
  abrirPluma,
  cerrarTurno,
  confirmarRecepcion,
  entradaDeLista,
  entregarATercero,
  entregarPaquete,
  escanear,
  marcarAtendido,
  paqueteAvisado,
  recibirPaquete,
  registrarAclaracion,
  registrarSalida,
  registroManual,
  responder,
  salirSinCerrar,
  subirFotoAcceso,
  usarPin,
  verChat,
  type RegistroManual,
  type Resultado,
} from "@/app/caseta/actions";
import { RESULTADO_ESCANEO, nombreDeMRZ } from "@/lib/condominios-datos";
import { comprimir } from "@/components/InputComprimido";
import { Icono, type NombreIcono } from "@/components/vecino/Iconos";
import { Escaner } from "./Escaner";

type Residente = { nombre: string; telefono: string | null; tipo: string };
export type DatosCaseta = {
  condominio: string;
  guardia: string;
  inicio: string;
  viviendas: { id: string; numero: string; zona: string | null; residentes: Residente[] | null }[];
  accesos_hoy: { id: string; tipo: string; visitante: string; placa: string | null; metodo: string; autorizo: string; ocurrio_at: string; vivienda: string; revision: string | null }[];
  chats: { vivienda_id: string; vivienda: string; pendiente: boolean; ultimo_at: string; ultimo: string | null }[];
  autorizados_hoy: { id: string; visitante: string; servicio: string | null; tipo_visita: string; hora_desde: string | null; hora_hasta: string | null; metodo_acceso: string; vivienda: string }[];
  entrega: {
    dentro: { id: string; visitante: string; placa: string | null; ocurrio_at: string; vivienda: string; metodo: string; cajon: string | null }[];
    chats_pendientes: { vivienda_id: string; vivienda: string; ultimo: string | null; ultimo_at: string }[];
    paquetes: { id: string; vivienda: string; paqueteria: string | null; descripcion: string | null; recibido_at: string; avisado_at: string | null; ubicacion: string | null }[];
    esperados: {
      id: string; folio: number | null; visitante: string; tipo_visita: string; vivienda: string; desde: string; hasta: string; placa: string | null;
      acceso: string | null; trabajo: string | null; cajon: string | null; evento: string | null;
    }[];
    incidencias?: { tipo: string; titulo: string; estado: string; zona: string | null; created_at: string; reportes: number }[];
    manuales_pendientes: number;
    turno_anterior: { guardia: string; inicio: string; fin: string; notas: string | null } | null;
  };
};
export type ExtraCaseta = {
  alertas: { id: string; tipo: string; detalle: string; created_at: string }[];
  timbre: { id: string; visitante: string; vivienda: string; estado: string; respondio: string | null; created_at: string; pase_id: string | null; usado: boolean | null }[];
  rondin: { id: string; nombre: string; ultima: string | null; en_mi_turno: number }[];
  tiene_pluma: boolean;
  vetados: { nombre: string | null; placa: string | null; motivo: string }[];
};
export type CajonesCaseta = { cajones: { nombre: string; ocupado_por: string | null; apartado_para: string | null }[]; recepcion_at: string | null };
export type AgendaCaseta = {
  mudanzas: { tipo: string; vivienda: string; empresa: string; placa: string | null; inicio: string; fin: string; recursos: string[] }[];
  eventos: { amenidad: string; vivienda: string; inicio: string; fin: string; personas: number }[];
};

const horaFmt = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" });
const hora = (iso: string) => horaFmt.format(new Date(iso));
const TABS: { id: string; texto: string; icono: NombreIcono }[] = [
  { id: "escanear", texto: "Escanear", icono: "qr" },
  { id: "llegadas", texto: "Llegadas", icono: "lista" },
  { id: "dentro", texto: "Dentro", icono: "persona" },
  { id: "chat", texto: "Chat", icono: "chat" },
  { id: "paquetes", texto: "Paquetes", icono: "paquete" },
  { id: "turno", texto: "Turno", icono: "reloj" },
];
const BOTON = "min-h-14 rounded-xl px-4 text-lg font-bold disabled:opacity-50";
const CAMPO = "min-h-14 w-full rounded-xl border-2 border-white/15 bg-white/5 px-4 text-lg text-white placeholder:text-white/40 outline-none focus:border-menta";

function telefonoWa(t: string | null) {
  const d = (t ?? "").replace(/\D/g, "");
  return d.length === 10 ? `52${d}` : d;
}

// Cola local de registros hechos sin conexión. Se envía sola al volver la señal; el servidor ignora repetidos.
const EVENTO_COLA = "caseta-cola";
function useCola(token: string) {
  const clave = `caseta-cola-${token.slice(0, 8)}`;
  const crudo = useSyncExternalStore(
    (avisar) => {
      window.addEventListener("storage", avisar);
      window.addEventListener(EVENTO_COLA, avisar);
      return () => {
        window.removeEventListener("storage", avisar);
        window.removeEventListener(EVENTO_COLA, avisar);
      };
    },
    () => {
      try {
        return localStorage.getItem(clave) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  const cola = useMemo<RegistroManual[]>(() => {
    try {
      return JSON.parse(crudo);
    } catch {
      return [];
    }
  }, [crudo]);
  const guardar = useCallback(
    (nueva: RegistroManual[]) => {
      try {
        localStorage.setItem(clave, JSON.stringify(nueva));
      } catch {
        /* sin almacenamiento */
      }
      window.dispatchEvent(new Event(EVENTO_COLA));
    },
    [clave],
  );
  return { cola, guardar };
}

// Estado real de la conexión del dispositivo.
function useEnLinea() {
  return useSyncExternalStore(
    (avisar) => {
      window.addEventListener("online", avisar);
      window.addEventListener("offline", avisar);
      return () => {
        window.removeEventListener("online", avisar);
        window.removeEventListener("offline", avisar);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export function CasetaApp({ token, datos, agenda, extra, cajones }: { token: string; datos: DatosCaseta; agenda: AgendaCaseta; extra: ExtraCaseta; cajones: CajonesCaseta }) {
  const router = useRouter();
  const [tab, setTab] = useState("escanear");
  const enLinea = useEnLinea();
  const [sesionPerdida, setSesionPerdida] = useState(false);
  const { cola, guardar } = useCola(token);
  const [, empezar] = useTransition();

  const revisar = useCallback(
    (r: Resultado) => {
      if (r.motivo === "sin_turno") setSesionPerdida(true);
      return r;
    },
    [],
  );

  // Estado real de la conexión y envío de la cola pendiente.
  const enviarCola = useCallback(async () => {
    if (!navigator.onLine || !cola.length) return;
    const quedan: RegistroManual[] = [];
    for (const r of cola) {
      try {
        // Se queda en la cola solo si no llegó o si no hay turno; lo demás ya quedó registrado (o repetido).
        const res = revisar(await registroManual(token, r));
        if (res.motivo === "sin_turno") quedan.push(r);
      } catch {
        quedan.push(r);
      }
    }
    guardar(quedan);
    router.refresh();
  }, [cola, guardar, revisar, router, token]);

  useEffect(() => {
    if (!enLinea || !cola.length) return;
    const id = setTimeout(enviarCola, 1500); // espera a que la señal se estabilice
    return () => clearTimeout(id);
  }, [enLinea, cola.length, enviarCola]);
  // Datos frescos cada 20 s (chats nuevos, paquetes, entradas de otro dispositivo).
  useEffect(() => {
    const id = setInterval(() => navigator.onLine && document.visibilityState === "visible" && empezar(() => router.refresh()), 20000);
    return () => clearInterval(id);
  }, [router]);

  const pendientesChat = datos.chats.filter((c) => c.pendiente).length;
  const paquetes = datos.entrega.paquetes.length;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-tinta text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-bold">{datos.condominio}</p>
          <p className="text-sm text-white/70">
            Caseta · {datos.guardia} · desde {hora(datos.inicio)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BotonPluma token={token} configurada={extra.tiene_pluma} deshabilitado={!enLinea} />
          <span role="status" className={`rounded-full px-3 py-1 text-sm font-bold ${enLinea ? "bg-menta/20 text-menta" : "bg-naranja text-white"}`}>
            {enLinea ? "En línea" : "Sin conexión"}
          </span>
        </div>
      </header>
      {extra.alertas.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 bg-naranja-oscuro px-4 py-3 text-base">
          {extra.alertas.slice(0, 3).map((a) => (
            <p key={a.id}>
              <b>{a.tipo === "vetado" ? "🚫 Vetado" : a.tipo === "placa_desconocida" ? "🚗 Placa sin registro" : "⚠️ Alerta"}</b> · {hora(a.created_at)} · {a.detalle}
            </p>
          ))}
        </div>
      )}

      {sesionPerdida && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-naranja px-4 py-3 text-base font-semibold">
          Tu turno se cerró (otro guardia inició turno o se renovó el link).
          <a href={`/caseta/${token}`} className="shrink-0 underline">
            Entrar de nuevo
          </a>
        </div>
      )}
      {!enLinea && (
        <div role="alert" className="bg-naranja/90 px-4 py-3 text-base">
          <b>Sin internet.</b> El QR no se puede validar. Usa <b>Registro manual</b>: pide identificación, confirma por interfón o teléfono con la vivienda y regístralo. Se guarda en este teléfono y se envía solo al volver la señal; la administración lo revisa. Si el teléfono falla, anota en la bitácora de papel: hora, nombre, vivienda y quién autorizó.
        </div>
      )}
      {cola.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-white/10 px-4 py-2 text-base">
          {cola.length} registro(s) guardados en el teléfono, por enviar.
          {enLinea && (
            <button type="button" onClick={enviarCola} className="font-bold text-menta underline">
              Enviar ahora
            </button>
          )}
        </div>
      )}

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-5 pb-28">
        {tab === "escanear" && <PestanaEscanear token={token} datos={datos} extra={extra} enLinea={enLinea} revisar={revisar} cola={cola} guardarCola={guardar} />}
        {tab === "llegadas" && <PestanaLlegadas token={token} datos={datos} enLinea={enLinea} revisar={revisar} />}
        {tab === "dentro" && <PestanaDentro token={token} datos={datos} revisar={revisar} />}
        {tab === "chat" && <PestanaChat token={token} datos={datos} revisar={revisar} />}
        {tab === "paquetes" && <PestanaPaquetes token={token} datos={datos} revisar={revisar} />}
        {tab === "turno" && <PestanaTurno token={token} datos={datos} agenda={agenda} extra={extra} cajones={cajones} />}
      </main>

      <nav aria-label="Secciones de caseta" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0D1714] pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-xl grid-cols-6">
          {TABS.map((t) => {
            const n = t.id === "chat" ? pendientesChat : t.id === "paquetes" ? paquetes : t.id === "dentro" ? datos.entrega.dentro.length : t.id === "llegadas" ? datos.entrega.esperados.length : 0;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={`relative flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-xs font-bold ${tab === t.id ? "text-menta" : "text-white/70"}`}
                >
                  <Icono nombre={t.icono} />
                  {t.texto}
                  {n > 0 && <span className="absolute top-1.5 right-[22%] min-w-5 rounded-full bg-naranja px-1 text-[11px] text-white">{n}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

// ─── Escanear y registro manual ───
function PestanaEscanear({
  token,
  datos,
  extra,
  enLinea,
  revisar,
  cola,
  guardarCola,
}: {
  token: string;
  datos: DatosCaseta;
  extra: ExtraCaseta;
  enLinea: boolean;
  revisar: (r: Resultado) => Resultado;
  cola: RegistroManual[];
  guardarCola: (c: RegistroManual[]) => void;
}) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [manual, setManual] = useState(false);
  const [busca, setBusca] = useState("");

  const validar = async (texto: string) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      setResultado(revisar(await escanear(token, texto)));
    } catch {
      setResultado({ ok: false, error: "Sin conexión: usa el registro manual." });
    } finally {
      setOcupado(false);
    }
  };

  const autorizados = datos.autorizados_hoy.filter((a) => !busca || `${a.visitante} ${a.vivienda} ${a.servicio ?? ""}`.toLowerCase().includes(busca.toLowerCase()));

  if (resultado) {
    const r = resultado;
    const info = RESULTADO_ESCANEO[(r.motivo as string) ?? ""] ?? { titulo: r.ok ? "Listo" : "No se pudo validar", detalle: (r.error as string) ?? "" };
    return (
      <section aria-live="assertive" className={`flex flex-col gap-4 rounded-3xl p-6 ${r.ok ? "bg-menta text-tinta" : "bg-naranja text-white"}`}>
        <span className="flex items-center gap-3">
          <Icono nombre={r.ok ? "check" : "alerta"} className="size-12" grueso={2.2} />
          <span className="font-display text-3xl leading-tight font-bold">{info.titulo}</span>
        </span>
        {typeof r.visitante === "string" && (
          <dl className="grid gap-1 text-xl">
            <div>
              <dt className="sr-only">Visita</dt>
              <dd className="text-3xl font-bold">{r.visitante}</dd>
            </div>
            {typeof r.vivienda === "string" && <dd>Va a: <b>{r.vivienda}</b></dd>}
            {typeof r.autorizo === "string" && r.autorizo && <dd>Autorizó: {r.autorizo}</dd>}
            {typeof r.placa === "string" && r.placa && <dd>Placas: {r.placa}</dd>}
            {typeof r.folio === "number" && <dd>Folio #{r.folio}</dd>}
            {typeof r.acceso === "string" && r.acceso && <dd>Acceso: <b>{r.acceso}</b></dd>}
            {typeof r.cajon === "string" && r.cajon && <dd className="text-2xl">Cajón <b>{r.cajon}</b></dd>}
            {Array.isArray(r.recursos) && r.recursos.length > 0 && <dd>Apartado: {(r.recursos as string[]).map((x) => (x === "elevador" ? "elevador de servicio" : "zona de carga")).join(" y ")}</dd>}
            {typeof r.trabajo === "string" && r.trabajo && <dd className="rounded-xl bg-black/10 px-3 py-2">Trabajo autorizado: <b>{r.trabajo}</b></dd>}
            {typeof r.instrucciones === "string" && r.instrucciones && <dd className="text-base">{r.instrucciones}</dd>}
          </dl>
        )}
        <p className="text-lg">{info.detalle || (r.error as string)}</p>
        {r.ok && typeof r.acceso_id === "string" && <FotoAcceso token={token} accesoId={r.acceso_id} />}
        {r.motivo === "punto_marcado" && typeof r.punto === "string" && <p className="text-2xl font-bold">{r.punto}</p>}
        <button type="button" autoFocus onClick={() => setResultado(null)} className={`${BOTON} ${r.ok ? "bg-tinta text-white" : "bg-white text-naranja-oscuro"}`}>
          Siguiente
        </button>
      </section>
    );
  }

  return (
    <>
      {!manual && (
        <>
          <Escaner activo={enLinea && !ocupado} onCodigo={validar} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (codigo.trim()) validar(codigo.trim());
              setCodigo("");
            }}
            className="flex gap-2"
          >
            <label htmlFor="codigo" className="sr-only">
              Código del pase
            </label>
            <input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código o folio (#123)" autoCapitalize="characters" autoComplete="off" className={`${CAMPO} font-mono tracking-widest`} />
            <button type="submit" disabled={ocupado || !enLinea} className={`${BOTON} shrink-0 bg-menta text-tinta`}>
              Validar
            </button>
          </form>
        </>
      )}
      <button type="button" onClick={() => setManual(!manual)} className={`${BOTON} border-2 border-white/20`}>
        {manual ? "Volver al escáner" : "Registro manual (sin QR o sin internet)"}
      </button>
      {!manual && <FormAclaracion token={token} datos={datos} enLinea={enLinea} revisar={revisar} />}
      {manual && (
        <FormManual
          token={token}
          datos={datos}
          enLinea={enLinea}
          revisar={revisar}
          cola={cola}
          guardarCola={guardarCola}
          onListo={(r) => {
            setManual(false);
            if (r) setResultado(r);
          }}
        />
      )}

      {!manual && extra.timbre.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Timbre (última hora)</h2>
          <ul className="flex flex-col divide-y divide-white/10 rounded-2xl bg-white/5">
            {extra.timbre.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold">{l.visitante}</span>
                  <span className="block text-sm text-white/70">
                    {l.vivienda} · {hora(l.created_at)} ·{" "}
                    {l.estado === "esperando" ? "esperando respuesta" : l.estado === "autorizada" ? `autorizó ${l.respondio ?? ""}` : "no autorizada"}
                  </span>
                </span>
                {l.estado === "autorizada" && l.pase_id && !l.usado && (
                  <button
                    type="button"
                    disabled={ocupado || !enLinea}
                    onClick={async () => {
                      setOcupado(true);
                      try {
                        setResultado(revisar(await entradaDeLista(token, l.pase_id!)));
                      } finally {
                        setOcupado(false);
                      }
                    }}
                    className="min-h-12 shrink-0 rounded-xl bg-menta px-4 font-bold text-tinta disabled:opacity-50"
                  >
                    Entrada
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!manual && datos.autorizados_hoy.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Personal autorizado hoy</h2>
          {datos.autorizados_hoy.length > 6 && <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre o vivienda" className={CAMPO} aria-label="Buscar personal" />}
          <ul className="flex flex-col divide-y divide-white/10 rounded-2xl bg-white/5">
            {autorizados.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold">{a.visitante}</span>
                  <span className="block text-sm text-white/70">
                    {a.vivienda} · {a.servicio ?? a.tipo_visita}
                    {a.hora_desde ? ` · ${a.hora_desde.slice(0, 5)}–${a.hora_hasta?.slice(0, 5) ?? ""}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={ocupado || !enLinea}
                  onClick={async () => {
                    setOcupado(true);
                    try {
                      setResultado(revisar(await entradaDeLista(token, a.id)));
                    } finally {
                      setOcupado(false);
                    }
                  }}
                  className="min-h-12 shrink-0 rounded-xl bg-menta px-4 font-bold text-tinta disabled:opacity-50"
                >
                  Entrada
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function FormManual({
  token,
  datos,
  enLinea,
  revisar,
  cola,
  guardarCola,
  onListo,
}: {
  token: string;
  datos: DatosCaseta;
  enLinea: boolean;
  revisar: (r: Resultado) => Resultado;
  cola: RegistroManual[];
  guardarCola: (c: RegistroManual[]) => void;
  onListo: (r?: Resultado) => void;
}) {
  const [vivienda, setVivienda] = useState("");
  const [nombre, setNombre] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [llegada] = useState(() => new Date().toISOString()); // cuando el guardia empezó a atender
  const v = datos.viviendas.find((x) => x.numero.toLowerCase() === vivienda.trim().toLowerCase());

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v) return setMensaje("Elige una vivienda de la lista.");
        const f = new FormData(e.currentTarget);
        const r: RegistroManual = {
          ref: crypto.randomUUID(),
          vivienda_id: v.id,
          tipo: f.get("tipo") === "salida" ? "salida" : "entrada",
          visitante: String(f.get("visitante") ?? ""),
          placa: String(f.get("placa") ?? ""),
          autorizo: String(f.get("autorizo") ?? ""),
          metodo: enLinea ? "manual" : "sin_conexion",
          ocurrio_at: new Date().toISOString(),
          llegada_at: llegada,
        };
        setEnviando(true);
        let res: Resultado | undefined;
        try {
          if (!enLinea) throw new Error("offline");
          res = revisar(await registroManual(token, r));
          if (res.motivo === "vetado") return onListo(res);
          if (!res.ok) return setMensaje(res.error ?? "No se pudo registrar.");
        } catch {
          guardarCola([...cola, { ...r, metodo: "sin_conexion" }]);
        } finally {
          setEnviando(false);
        }
        onListo(res?.ok ? { ...res, motivo: "autorizado", visitante: r.visitante, vivienda: v.numero } : undefined);
      }}
      className="flex flex-col gap-4 rounded-2xl bg-white/5 p-4"
    >
      <div className="grid grid-cols-2 gap-2">
        {["entrada", "salida"].map((t) => (
          <label key={t} className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-white/15 text-lg has-checked:border-menta has-checked:bg-menta/15 has-checked:font-bold">
            <input type="radio" name="tipo" value={t} defaultChecked={t === "entrada"} className="sr-only" />
            {t === "entrada" ? "Entrada" : "Salida"}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-base font-semibold">
        Vivienda
        <input list="viviendas-caseta" value={vivienda} onChange={(e) => setVivienda(e.target.value)} required placeholder="Casa 24" className={CAMPO} />
        <datalist id="viviendas-caseta">
          {datos.viviendas.map((x) => (
            <option key={x.id} value={x.numero} />
          ))}
        </datalist>
      </label>
      {v?.residentes?.length ? (
        <div className="flex flex-wrap gap-2">
          {v.residentes.map((r) => (
            <a key={r.nombre} href={r.telefono ? `tel:${r.telefono.replace(/\s/g, "")}` : undefined} className="flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-base">
              📞 {r.nombre}
            </a>
          ))}
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-base font-semibold">
        Nombre de quien entra o sale
        <input name="visitante" required minLength={2} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} />
      </label>
      <label className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/25 text-base ${leyendo ? "opacity-60" : ""}`}>
        <Icono nombre="camara" className="size-5" />
        {leyendo ? "Leyendo la INE…" : "Leer nombre de la INE (foto del reverso)"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={leyendo}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setLeyendo(true);
            setMensaje(null);
            try {
              // El texto se lee en este teléfono; la foto no se guarda ni se envía.
              const { recognize } = await import("tesseract.js");
              const { data } = await recognize(await comprimir(f, 1600, 0.9), "eng");
              const n = nombreDeMRZ(data.text);
              if (n) setNombre(n);
              else setMensaje("No se pudo leer. Toma la foto del reverso de frente, con buena luz, o escribe el nombre.");
            } catch {
              setMensaje("No se pudo leer la INE en este teléfono. Escribe el nombre.");
            } finally {
              setLeyendo(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-base font-semibold">
        Placas (opcional)
        <input name="placa" maxLength={12} autoCapitalize="characters" className={CAMPO} />
      </label>
      <label className="flex flex-col gap-1 text-base font-semibold">
        ¿Quién autorizó?
        <input name="autorizo" required minLength={2} list="autorizo-caseta" placeholder="Nombre del residente o 'Interfón'" className={CAMPO} />
        <datalist id="autorizo-caseta">
          {(v?.residentes ?? []).map((r) => (
            <option key={r.nombre} value={`${r.nombre} (por teléfono)`} />
          ))}
          <option value="Interfón" />
        </datalist>
      </label>
      {mensaje && (
        <p role="alert" className="rounded-xl bg-naranja px-4 py-2">
          {mensaje}
        </p>
      )}
      <button type="submit" disabled={enviando} className={`${BOTON} bg-menta text-tinta`}>
        {enviando ? "Guardando…" : enLinea ? "Registrar" : "Guardar en el teléfono"}
      </button>
      <p className="text-sm text-white/70">Los registros manuales quedan marcados para que la administración los revise.</p>
    </form>
  );
}

// ─── Visitas dentro ───
function PestanaDentro({ token, datos, revisar }: { token: string; datos: DatosCaseta; revisar: (r: Resultado) => Resultado }) {
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const dentro = datos.entrega.dentro.filter((d) => !busca || `${d.visitante} ${d.vivienda} ${d.placa ?? ""}`.toLowerCase().includes(busca.toLowerCase()));
  return (
    <>
      <h1 className="font-display text-3xl font-bold">Dentro ahora</h1>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nombre, vivienda o placa" className={CAMPO} aria-label="Buscar" />
      {dentro.length ? (
        <ul className="flex flex-col divide-y divide-white/10 rounded-2xl bg-white/5">
          {dentro.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-lg font-semibold">{d.visitante}</span>
                <span className="block text-sm text-white/70">
                  {d.vivienda} · entró {hora(d.ocurrio_at)}
                  {d.placa ? ` · ${d.placa}` : ""}
                  {d.cajon ? ` · cajón ${d.cajon}` : ""}
                </span>
              </span>
              <button
                type="button"
                disabled={ocupado === d.id}
                onClick={async () => {
                  setOcupado(d.id);
                  try {
                    revisar(await registrarSalida(token, d.id));
                  } finally {
                    setOcupado(null);
                  }
                }}
                className="min-h-12 shrink-0 rounded-xl border-2 border-white/25 px-4 font-bold disabled:opacity-50"
              >
                {ocupado === d.id ? "…" : "Salida"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-white/70">No hay visitas registradas dentro.</p>
      )}
      <h2 className="mt-2 text-lg font-bold">Movimientos de hoy</h2>
      <ul className="flex flex-col divide-y divide-white/10 rounded-2xl bg-white/5 text-base">
        {datos.accesos_hoy.slice(0, 30).map((a) => (
          <li key={a.id} className="flex justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0 truncate">
              <b className={a.tipo === "entrada" ? "text-menta" : "text-white/70"}>{a.tipo === "entrada" ? "↘" : "↗"}</b> {a.visitante} · {a.vivienda}
              {a.metodo !== "qr" && <span className="ml-1 text-xs text-white/60">({a.metodo === "manual" ? "manual" : "sin conexión"})</span>}
            </span>
            <span className="shrink-0 text-white/70">{hora(a.ocurrio_at)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// ─── Chat por vivienda ───
function PestanaChat({ token, datos, revisar }: { token: string; datos: DatosCaseta; revisar: (r: Resultado) => Resultado }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<{ lado: string; texto: string; created_at: string; autor: string | null }[]>([]);
  const [texto, setTexto] = useState("");
  const [nueva, setNueva] = useState("");
  const chat = datos.chats.find((c) => c.vivienda_id === abierto);
  const nombre = chat?.vivienda ?? datos.viviendas.find((v) => v.id === abierto)?.numero ?? "";
  const ultimo = chat?.ultimo_at;

  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    verChat(token, abierto).then((r) => {
      if (!vigente) return;
      revisar(r);
      if (r.ok && Array.isArray(r.data)) setMensajes(r.data as typeof mensajes);
    });
    return () => {
      vigente = false;
    };
  }, [abierto, ultimo, version, revisar, token]);
  const cargar = () => setVersion((v) => v + 1);

  const enviar = async (t: string) => {
    if (!abierto || !t.trim()) return;
    revisar(await responder(token, abierto, t));
    setTexto("");
    cargar();
  };

  if (abierto) {
    return (
      <>
        <button type="button" onClick={() => setAbierto(null)} className="flex items-center gap-2 self-start text-lg text-white/80">
          <Icono nombre="atras" /> Conversaciones
        </button>
        <h1 className="font-display text-3xl font-bold">{nombre}</h1>
        <section aria-live="polite" className="flex flex-col gap-2">
          {mensajes.map((m, i) => (
            <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-lg ${m.lado === "caseta" ? "self-end bg-menta text-tinta" : "self-start bg-white/10"}`}>
              <p className="whitespace-pre-line">{m.texto}</p>
              <p className="mt-0.5 text-xs opacity-70">
                {m.autor ?? ""} · {hora(m.created_at)}
              </p>
            </div>
          ))}
          {!mensajes.length && <p className="text-white/70">Sin mensajes todavía.</p>}
        </section>
        <div className="flex flex-wrap gap-2">
          {["Ya puede pasar ✅", "Su paquete está en caseta 📦", "Enterado, gracias", "¿Autoriza la entrada?"].map((r) => (
            <button key={r} type="button" onClick={() => enviar(r)} className="min-h-11 rounded-full bg-white/10 px-4 text-base">
              {r}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto);
          }}
          className="flex gap-2"
        >
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responder…" className={CAMPO} aria-label="Mensaje" />
          <button type="submit" className={`${BOTON} shrink-0 bg-menta text-tinta`}>
            Enviar
          </button>
        </form>
        {chat?.pendiente && (
          <button type="button" onClick={async () => revisar(await marcarAtendido(token, abierto))} className={`${BOTON} border-2 border-white/20`}>
            Marcar como atendido sin responder
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Chat con residentes</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = datos.viviendas.find((x) => x.numero.toLowerCase() === nueva.trim().toLowerCase());
          if (v) setAbierto(v.id);
        }}
        className="flex gap-2"
      >
        <input list="viviendas-chat" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Escribir a una vivienda…" className={CAMPO} aria-label="Vivienda" />
        <datalist id="viviendas-chat">
          {datos.viviendas.map((x) => (
            <option key={x.id} value={x.numero} />
          ))}
        </datalist>
        <button type="submit" className={`${BOTON} shrink-0 border-2 border-white/20`}>
          Abrir
        </button>
      </form>
      <ul className="flex flex-col divide-y divide-white/10 rounded-2xl bg-white/5">
        {datos.chats.map((c) => (
          <li key={c.vivienda_id}>
            <button type="button" onClick={() => setAbierto(c.vivienda_id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              {c.pendiente && <span className="size-3 shrink-0 rounded-full bg-naranja" aria-label="Sin responder" />}
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">{c.vivienda}</span>
                <span className="block truncate text-sm text-white/70">{c.ultimo}</span>
              </span>
              <span className="shrink-0 text-sm text-white/60">{hora(c.ultimo_at)}</span>
            </button>
          </li>
        ))}
        {!datos.chats.length && <li className="p-6 text-center text-white/70">Aún no hay conversaciones.</li>}
      </ul>
    </>
  );
}

// ─── Paquetería ───
function PestanaPaquetes({ token, datos, revisar }: { token: string; datos: DatosCaseta; revisar: (r: Resultado) => Resultado }) {
  const [vivienda, setVivienda] = useState("");
  const [recien, setRecien] = useState<{ vivienda: string; residentes: Residente[]; paqueteria: string } | null>(null);
  const [entregando, setEntregando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [inicio, setInicio] = useState<number | null>(null); // para medir cuánto tarda registrar un paquete
  const porNumero = useMemo(() => new Map(datos.viviendas.map((v) => [v.numero, v])), [datos.viviendas]);

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Paquetería</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const formulario = e.currentTarget;
          const f = new FormData(formulario);
          const v = datos.viviendas.find((x) => x.numero.toLowerCase() === vivienda.trim().toLowerCase());
          if (!v) return;
          setGuardando(true);
          f.set("segundos", String(inicio ? Math.round((Date.now() - inicio) / 1000) : ""));
          const foto = f.get("foto");
          if (foto instanceof File && foto.size) f.set("foto", await comprimir(foto, 1280, 0.8));
          const r = revisar(await recibirPaquete(token, v.id, String(f.get("paqueteria") ?? ""), String(f.get("descripcion") ?? ""), f));
          setGuardando(false);
          if (r.ok) {
            setRecien({ vivienda: v.numero, residentes: v.residentes ?? [], paqueteria: String(f.get("paqueteria") ?? "") });
            setVivienda("");
            setInicio(null);
            formulario.reset();
          }
        }}
        className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4"
      >
        <input
          list="viviendas-paq"
          value={vivienda}
          onChange={(e) => {
            if (inicio === null) setInicio(Date.now());
            setVivienda(e.target.value);
          }}
          required
          placeholder="Vivienda"
          className={CAMPO}
          aria-label="Vivienda"
        />
        <datalist id="viviendas-paq">
          {datos.viviendas.map((x) => (
            <option key={x.id} value={x.numero} />
          ))}
        </datalist>
        <input name="paqueteria" list="paqueterias" placeholder="Paquetería (Amazon, DHL…)" className={CAMPO} aria-label="Paquetería" />
        <datalist id="paqueterias">
          {["Amazon", "Mercado Libre", "DHL", "FedEx", "Estafeta", "Paquetexpress", "Uber / Rappi", "Correos de México"].map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <input name="descripcion" placeholder="Descripción (caja chica, sobre…)" className={CAMPO} aria-label="Descripción" />
        <input name="ubicacion" list="ubicaciones" placeholder="¿Dónde lo guardaste? (Anaquel A…)" className={CAMPO} aria-label="Ubicación" />
        <datalist id="ubicaciones">
          {["Anaquel A", "Anaquel B", "Refrigerador", "Bodega"].map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/25 text-base has-[input:valid]:border-menta">
          <Icono nombre="camara" className="size-5" /> Foto del paquete (opcional)
          <input type="file" name="foto" accept="image/*" capture="environment" className="sr-only" />
        </label>
        <button type="submit" disabled={guardando} className={`${BOTON} bg-menta text-tinta`}>
          {guardando ? "Guardando…" : "Registrar paquete"}
        </button>
      </form>
      {recien && (
        <div className="flex flex-col gap-2 rounded-2xl bg-menta/15 p-4">
          <p className="font-bold">Registrado para {recien.vivienda}. Ya aparece en su app. Avisar por WhatsApp:</p>
          {recien.residentes.filter((r) => r.telefono).map((r) => (
            <a
              key={r.nombre}
              target="_blank"
              rel="noopener"
              href={`https://wa.me/${telefonoWa(r.telefono)}?text=${encodeURIComponent(`Hola ${r.nombre.split(" ")[0]}, llegó un paquete${recien.paqueteria ? ` de ${recien.paqueteria}` : ""} para ${recien.vivienda}. Está en caseta.`)}`}
              className="flex min-h-12 items-center rounded-xl bg-white/10 px-4"
            >
              💬 {r.nombre}
            </a>
          ))}
          <button type="button" onClick={() => setRecien(null)} className="self-start text-sm underline">
            Cerrar
          </button>
        </div>
      )}
      <FormPinEntrega token={token} revisar={revisar} />
      <FormTercero token={token} revisar={revisar} />
      <h2 className="text-lg font-bold">En caseta ({datos.entrega.paquetes.length})</h2>
      <ul className="flex flex-col divide-y divide-white/10 rounded-2xl bg-white/5">
        {datos.entrega.paquetes.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-lg font-semibold">{p.vivienda}</span>
                <span className="block text-sm text-white/70">
                  {[p.paqueteria, p.descripcion].filter(Boolean).join(" · ") || "Paquete"} · {hora(p.recibido_at)}
                  {p.ubicacion ? ` · ${p.ubicacion}` : ""}
                  {p.avisado_at ? " · avisado" : ""}
                </span>
              </span>
              {!p.avisado_at && (
                <button type="button" onClick={async () => revisar(await paqueteAvisado(token, p.id))} className="min-h-10 shrink-0 rounded-lg bg-white/10 px-3 text-sm">
                  Ya avisé
                </button>
              )}
            </div>
            {entregando === p.id ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const foto = f.get("foto");
                  if (foto instanceof File && foto.size) f.set("foto", await comprimir(foto, 1280, 0.8));
                  const r = revisar(await entregarPaquete(token, p.id, String(f.get("quien") ?? ""), f));
                  if (r.ok) setEntregando(null);
                  else if (r.error) alert(r.error);
                }}
                className="flex flex-wrap gap-2"
              >
                <input name="quien" required minLength={2} list={`res-${p.id}`} placeholder="¿Quién lo recogió?" className={CAMPO} aria-label="Quién lo recogió" />
                <datalist id={`res-${p.id}`}>
                  {(porNumero.get(p.vivienda)?.residentes ?? []).map((r) => (
                    <option key={r.nombre} value={r.nombre} />
                  ))}
                </datalist>
                <label className="flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-white/25 px-3 text-sm">
                  <Icono nombre="camara" className="size-5" /> Evidencia
                  <input type="file" name="foto" accept="image/*" capture="environment" className="sr-only" />
                </label>
                <button type="submit" className={`${BOTON} shrink-0 bg-menta text-tinta`}>
                  Entregar
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setEntregando(p.id)} className="min-h-12 rounded-xl border-2 border-white/20 font-bold">
                Entregar
              </button>
            )}
          </li>
        ))}
        {!datos.entrega.paquetes.length && <li className="p-6 text-center text-white/70">No hay paquetes en caseta.</li>}
      </ul>
    </>
  );
}

// ─── Turno y entrega ───
function Bloque({ titulo, n, children }: { titulo: string; n: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4">
      <h2 className="flex items-center justify-between text-lg font-bold">
        {titulo} <span className="rounded-full bg-white/10 px-2.5 text-base">{n}</span>
      </h2>
      {n ? <ul className="flex flex-col gap-1 text-base text-white/85">{children}</ul> : <p className="text-sm text-white/60">Nada pendiente.</p>}
    </section>
  );
}

function PestanaTurno({ token, datos, agenda, extra, cajones }: { token: string; datos: DatosCaseta; agenda: AgendaCaseta; extra: ExtraCaseta; cajones: CajonesCaseta }) {
  const e = datos.entrega;
  const incidencias = e.incidencias ?? [];
  return (
    <>
      <h1 className="font-display text-3xl font-bold">Entrega de turno</h1>
      {e.turno_anterior && (
        <section className="rounded-2xl border-2 border-menta/40 p-4">
          <p className="text-sm text-white/70">
            Turno anterior: {e.turno_anterior.guardia} · {hora(e.turno_anterior.inicio)}–{hora(e.turno_anterior.fin)}
          </p>
          <p className="mt-1 text-lg">{e.turno_anterior.notas || "Sin notas."}</p>
          <FormRecepcion token={token} confirmada={cajones.recepcion_at} />
        </section>
      )}
      <Bloque titulo="Incidencias abiertas" n={incidencias.length}>
        {incidencias.map((x, i) => (
          <li key={i}>
            {x.tipo === "incidente" ? "⚠️ " : ""}
            {x.titulo}
            {x.zona ? ` · ${x.zona}` : ""}
            {x.reportes > 1 ? ` · ${x.reportes} reportes` : ""} · {x.estado.replace("_", " ")}
          </li>
        ))}
      </Bloque>
      <Bloque titulo="Cajones de visitas" n={cajones.cajones.filter((c) => c.ocupado_por || c.apartado_para).length}>
        {cajones.cajones
          .filter((c) => c.ocupado_por || c.apartado_para)
          .map((c) => (
            <li key={c.nombre}>
              <b>{c.nombre}</b> · {c.ocupado_por ? `ocupado: ${c.ocupado_por}` : `apartado: ${c.apartado_para}`}
            </li>
          ))}
      </Bloque>
      <Bloque titulo="Visitas dentro" n={e.dentro.length}>
        {e.dentro.map((d) => (
          <li key={d.id}>
            {d.visitante} · {d.vivienda} · desde {hora(d.ocurrio_at)}
          </li>
        ))}
      </Bloque>
      <Bloque titulo="Mensajes sin responder" n={e.chats_pendientes.length}>
        {e.chats_pendientes.map((c) => (
          <li key={c.vivienda_id}>
            {c.vivienda}: “{c.ultimo}”
          </li>
        ))}
      </Bloque>
      <Bloque titulo="Paquetes por entregar" n={e.paquetes.length}>
        {e.paquetes.map((p) => (
          <li key={p.id}>
            {p.vivienda} · {p.paqueteria ?? "Paquete"}
            {p.ubicacion ? ` · ${p.ubicacion}` : ""}
          </li>
        ))}
      </Bloque>
      <Bloque titulo="Visitas y proveedores esperados" n={e.esperados.length}>
        {e.esperados.map((x, i) => (
          <li key={i}>
            {x.visitante} · {x.vivienda} · {hora(x.desde)}–{hora(x.hasta)}
            {x.placa ? ` · ${x.placa}` : ""}
            {x.cajon ? ` · cajón ${x.cajon}` : ""}
          </li>
        ))}
      </Bloque>
      <Bloque titulo="Mudanzas próximas 24 h" n={agenda.mudanzas.length}>
        {agenda.mudanzas.map((m, i) => (
          <li key={i}>
            {m.tipo === "entrada" ? "Entrada" : "Salida"} · {m.vivienda} · {m.empresa} · {hora(m.inicio)}–{hora(m.fin)}
            {m.placa ? ` · ${m.placa}` : ""}
            {m.recursos.length ? ` · ${m.recursos.map((r) => (r === "elevador" ? "elevador" : "zona de carga")).join(" y ")}` : ""}
          </li>
        ))}
      </Bloque>
      <Bloque titulo="Eventos en amenidades" n={agenda.eventos.length}>
        {agenda.eventos.map((x, i) => (
          <li key={i}>
            {x.amenidad} · {x.vivienda} · {hora(x.inicio)}–{hora(x.fin)} · {x.personas} personas
          </li>
        ))}
      </Bloque>
      <Bloque titulo="Rondín (escanea el QR de cada punto)" n={extra.rondin.length}>
        {extra.rondin.map((p) => (
          <li key={p.id} className="flex justify-between gap-3">
            <span>
              {p.en_mi_turno > 0 ? "✅" : "⬜"} {p.nombre}
            </span>
            <span className="text-white/60">{p.ultima ? `último ${hora(p.ultima)}` : "sin marcar"}</span>
          </li>
        ))}
      </Bloque>
      <Bloque titulo="Lista de vetados" n={extra.vetados.length}>
        {extra.vetados.map((v, i) => (
          <li key={i}>
            <b>{[v.nombre, v.placa].filter(Boolean).join(" · ")}</b> — {v.motivo}
          </li>
        ))}
      </Bloque>
      {e.manuales_pendientes > 0 && <p className="text-sm text-white/70">{e.manuales_pendientes} registros manuales esperan revisión de la administración.</p>}
      <form action={cerrarTurno} className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4">
        <input type="hidden" name="token" value={token} />
        <label className="flex flex-col gap-1 text-base font-semibold">
          Notas para el siguiente turno
          <textarea name="notas" rows={3} maxLength={1000} placeholder="Portón 2 se atora, la Casa 18 espera un técnico…" className={`${CAMPO} py-3`} />
        </label>
        <button type="submit" className={`${BOTON} bg-menta text-tinta`}>
          Cerrar mi turno y entregar
        </button>
      </form>
      <form action={salirSinCerrar}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="text-sm text-white/60 underline">
          Salir de este dispositivo sin cerrar el turno
        </button>
      </form>
    </>
  );
}

// Abre la pluma por el relevador del condominio (o simulación si no está configurado).
function BotonPluma({ token, configurada, deshabilitado }: { token: string; configurada: boolean; deshabilitado: boolean }) {
  const [estado, setEstado] = useState<string | null>(null);
  return (
    <button
      type="button"
      disabled={deshabilitado || estado === "…"}
      onClick={async () => {
        setEstado("…");
        const r = await abrirPluma(token, "Apertura manual desde caseta");
        setEstado(r.ok ? (r.resultado === "simulado" ? "Simulado" : "Abierta") : "Error");
        setTimeout(() => setEstado(null), 3000);
      }}
      title={configurada ? "Abrir la pluma" : "Sin relevador configurado: se registra como simulación"}
      className="min-h-10 rounded-full border-2 border-menta px-3 text-sm font-bold text-menta disabled:opacity-50"
    >
      {estado ?? "Abrir pluma"}
    </button>
  );
}

// Foto de quien entra (opcional), ligada al registro de acceso.
function FotoAcceso({ token, accesoId }: { token: string; accesoId: string }) {
  const [estado, setEstado] = useState<"listo" | "subiendo" | "ok" | "error">("listo");
  if (estado === "ok") return <p className="text-lg font-bold">📸 Foto guardada</p>;
  return (
    <label className={`flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-current text-lg font-bold ${estado === "subiendo" ? "opacity-60" : ""}`}>
      <Icono nombre="camara" />
      {estado === "subiendo" ? "Subiendo…" : estado === "error" ? "No se pudo, intenta otra vez" : "Tomar foto de la entrada"}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setEstado("subiendo");
          const datos = new FormData();
          datos.set("foto", await comprimir(f, 1280, 0.75));
          const r = await subirFotoAcceso(token, accesoId, datos);
          setEstado(r.ok ? "ok" : "error");
        }}
      />
    </label>
  );
}

function FormPinEntrega({ token, revisar }: { token: string; revisar: (r: Resultado) => Resultado }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const formulario = e.currentTarget;
        const f = new FormData(formulario);
        setOcupado(true);
        const r = revisar(await usarPin(token, String(f.get("pin") ?? ""), String(f.get("paqueteria") ?? "")));
        setOcupado(false);
        const info = RESULTADO_ESCANEO[String(r.motivo ?? "")];
        setMsg({ ok: !!r.ok, texto: r.ok ? `Paquete registrado para ${String(r.vivienda)}. Ya se le avisó.` : (info?.detalle ?? r.error ?? "No se pudo.") });
        if (r.ok) formulario.reset();
      }}
      className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4"
    >
      <p className="font-bold">Entrega con código del residente</p>
      <div className="flex gap-2">
        <input name="pin" inputMode="numeric" pattern="[0-9]{6}" required placeholder="6 números" className={`${CAMPO} font-mono tracking-[0.3em]`} aria-label="Código de entrega" />
        <button disabled={ocupado} className={`${BOTON} shrink-0 bg-menta text-tinta`}>
          Validar
        </button>
      </div>
      <input name="paqueteria" placeholder="Paquetería (opcional)" className={CAMPO} aria-label="Paquetería" />
      {msg && <p className={`rounded-xl px-3 py-2 ${msg.ok ? "bg-menta/20 text-menta" : "bg-naranja"}`}>{msg.texto}</p>}
    </form>
  );
}

// ─── Llegadas de hoy: buscar por nombre, vivienda o folio cuando la cámara falla ───
function PestanaLlegadas({ token, datos, enLinea, revisar }: { token: string; datos: DatosCaseta; enLinea: boolean; revisar: (r: Resultado) => Resultado }) {
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const q = busca.trim().toLowerCase().replace(/^#/, "");
  const lista = datos.entrega.esperados.filter((x) => !q || `${x.visitante} ${x.vivienda} ${x.folio ?? ""} ${x.placa ?? ""} ${x.evento ?? ""}`.toLowerCase().includes(q));
  const TIPO: Record<string, string> = { fiesta: "Fiesta", mudanza: "Mudanza", servicio: "Servicio", proveedor: "Proveedor", visita: "Visita", taxi: "Taxi", paqueteria: "Paquetería" };
  return (
    <>
      <h1 className="font-display text-3xl font-bold">Llegadas de hoy</h1>
      {resultado && (
        <p role="status" className={`rounded-xl px-4 py-3 text-lg font-semibold ${resultado.ok ? "bg-menta text-tinta" : "bg-naranja"}`}>
          {resultado.ok
            ? `Entrada registrada: ${String(resultado.visitante ?? "")}${resultado.cajon ? ` · cajón ${String(resultado.cajon)}` : ""}`
            : (RESULTADO_ESCANEO[String(resultado.motivo ?? "")]?.titulo ?? String(resultado.error ?? "No se pudo validar"))}
        </p>
      )}
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nombre, vivienda o folio" className={CAMPO} aria-label="Buscar llegada" />
      <ul className="flex flex-col divide-y divide-white/10 rounded-2xl bg-white/5">
        {lista.slice(0, 80).map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-lg font-semibold">{x.visitante}</span>
              <span className="block text-sm text-white/70">
                #{x.folio} · {TIPO[x.tipo_visita] ?? x.tipo_visita}
                {x.evento ? ` (${x.evento})` : ""} · {x.vivienda} · {hora(x.desde)}–{hora(x.hasta)}
                {x.cajon ? ` · cajón ${x.cajon}` : ""}
                {x.acceso ? ` · ${x.acceso}` : ""}
              </span>
              {x.trabajo && <span className="block text-sm text-menta">Trabajo: {x.trabajo}</span>}
            </span>
            <button
              type="button"
              disabled={!enLinea || ocupado === x.id}
              onClick={async () => {
                setOcupado(x.id);
                try {
                  setResultado(revisar(await entradaDeLista(token, x.id)));
                } finally {
                  setOcupado(null);
                }
              }}
              className="min-h-12 shrink-0 rounded-xl bg-menta px-4 font-bold text-tinta disabled:opacity-50"
            >
              {ocupado === x.id ? "…" : "Entrada"}
            </button>
          </li>
        ))}
        {!lista.length && <li className="p-6 text-center text-white/70">{busca ? "Sin coincidencias. Usa el registro manual." : "No hay llegadas esperadas."}</li>}
      </ul>
    </>
  );
}

// Llamada para aclarar una visita (se mide para saber si los pases traen la información suficiente).
function FormAclaracion({ token, datos, enLinea, revisar }: { token: string; datos: DatosCaseta; enLinea: boolean; revisar: (r: Resultado) => Resultado }) {
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState(false);
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-left text-base text-white/80 underline">
        {listo ? "✓ Aclaración registrada. ¿Otra?" : "Tuve que llamar para aclarar una visita"}
      </button>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = datos.viviendas.find((x) => x.numero.toLowerCase() === String(f.get("vivienda") ?? "").trim().toLowerCase());
        const r = revisar(await registrarAclaracion(token, v?.id ?? "", String(f.get("motivo") ?? "")));
        if (r.ok) {
          setAbierto(false);
          setListo(true);
        }
      }}
      className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4"
    >
      <input name="vivienda" list="viviendas-caseta-acl" placeholder="Vivienda (opcional)" className={CAMPO} aria-label="Vivienda" />
      <datalist id="viviendas-caseta-acl">
        {datos.viviendas.map((x) => (
          <option key={x.id} value={x.numero} />
        ))}
      </datalist>
      <select name="motivo" className={CAMPO} aria-label="Motivo" defaultValue="Visita sin pase">
        {["Visita sin pase", "El pase no decía por dónde entrar", "No sabía a qué venía (servicio)", "No había cajón", "Nombre o placa no coincidía", "Otro"].map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <div className="flex gap-2">
        <button type="submit" disabled={!enLinea} className={`${BOTON} flex-1 bg-menta text-tinta`}>
          Registrar aclaración
        </button>
        <button type="button" onClick={() => setAbierto(false)} className={`${BOTON} border-2 border-white/20`}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// La persona que el residente autorizó recoge con su PIN.
function FormTercero({ token, revisar }: { token: string; revisar: (r: Resultado) => Resultado }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const formulario = e.currentTarget;
        const f = new FormData(formulario);
        const foto = f.get("foto");
        if (foto instanceof File && foto.size) f.set("foto", await comprimir(foto, 1280, 0.8));
        setEnviando(true);
        try {
          const r = revisar(await entregarATercero(token, f));
          setMsg(
            r.ok
              ? { ok: true, texto: `Entrega a ${String(r.nombre)} (${String(r.vivienda)}): ${String(r.paquetes)} paquete(s). Pide identificación.` }
              : { ok: false, texto: r.motivo === "bloqueado" ? "Demasiados intentos. Espera 10 minutos." : r.motivo === "sin_paquetes" ? "Esa vivienda no tiene paquetes en caseta." : "PIN no válido, usado o vencido." },
          );
          if (r.ok) formulario.reset();
        } finally {
          setEnviando(false);
        }
      }}
      className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4"
    >
      <h2 className="text-lg font-bold">Recoge otra persona (PIN del residente)</h2>
      <div className="flex gap-2">
        <input name="pin" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="PIN de 6 dígitos" className={`${CAMPO} font-mono tracking-widest`} aria-label="PIN de recogida" />
        <label className="flex min-h-14 shrink-0 cursor-pointer items-center gap-1 rounded-xl border-2 border-dashed border-white/25 px-3 text-sm">
          <Icono nombre="camara" className="size-5" /> Foto
          <input type="file" name="foto" accept="image/*" capture="environment" className="sr-only" />
        </label>
      </div>
      <button type="submit" disabled={enviando} className={`${BOTON} bg-menta text-tinta`}>
        {enviando ? "Validando…" : "Validar y entregar"}
      </button>
      {msg && (
        <p role="status" className={`rounded-xl px-4 py-2 ${msg.ok ? "bg-menta text-tinta" : "bg-naranja"}`}>
          {msg.texto}
        </p>
      )}
    </form>
  );
}

// El guardia que entra confirma que recibió el turno (con observaciones).
function FormRecepcion({ token, confirmada }: { token: string; confirmada: string | null }) {
  const [hecha, setHecha] = useState(confirmada);
  if (hecha) return <p className="mt-3 rounded-xl bg-menta/15 px-3 py-2 text-base">✓ Recibiste el turno a las {hora(hecha)}.</p>;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await confirmarRecepcion(token, String(new FormData(e.currentTarget).get("notas") ?? ""));
        if (r.ok) setHecha(new Date().toISOString());
      }}
      className="mt-3 flex flex-col gap-2"
    >
      <textarea name="notas" rows={2} maxLength={1000} placeholder="Observaciones al recibir (opcional)" className={`${CAMPO} py-3`} aria-label="Observaciones al recibir" />
      <button type="submit" className={`${BOTON} bg-menta text-tinta`}>
        Confirmo que recibí el turno
      </button>
    </form>
  );
}
