"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import {
  cerrarTurno,
  entradaDeLista,
  entregarPaquete,
  escanear,
  marcarAtendido,
  paqueteAvisado,
  recibirPaquete,
  registrarSalida,
  registroManual,
  responder,
  salirSinCerrar,
  verChat,
  type RegistroManual,
  type Resultado,
} from "@/app/caseta/actions";
import { RESULTADO_ESCANEO } from "@/lib/condominios-datos";
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
    dentro: { id: string; visitante: string; placa: string | null; ocurrio_at: string; vivienda: string; metodo: string }[];
    chats_pendientes: { vivienda_id: string; vivienda: string; ultimo: string | null; ultimo_at: string }[];
    paquetes: { id: string; vivienda: string; paqueteria: string | null; descripcion: string | null; recibido_at: string; avisado_at: string | null }[];
    esperados: { visitante: string; tipo_visita: string; vivienda: string; desde: string; hasta: string; placa: string | null }[];
    manuales_pendientes: number;
    turno_anterior: { guardia: string; inicio: string; fin: string; notas: string | null } | null;
  };
};
export type AgendaCaseta = {
  mudanzas: { tipo: string; vivienda: string; empresa: string; placa: string | null; inicio: string; fin: string; recursos: string[] }[];
  eventos: { amenidad: string; vivienda: string; inicio: string; fin: string; personas: number }[];
};

const horaFmt = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" });
const hora = (iso: string) => horaFmt.format(new Date(iso));
const TABS: { id: string; texto: string; icono: NombreIcono }[] = [
  { id: "escanear", texto: "Escanear", icono: "qr" },
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

export function CasetaApp({ token, datos, agenda }: { token: string; datos: DatosCaseta; agenda: AgendaCaseta }) {
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
        <span role="status" className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${enLinea ? "bg-menta/20 text-menta" : "bg-naranja text-white"}`}>
          {enLinea ? "En línea" : "Sin conexión"}
        </span>
      </header>

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
        {tab === "escanear" && <PestanaEscanear token={token} datos={datos} enLinea={enLinea} revisar={revisar} cola={cola} guardarCola={guardar} />}
        {tab === "dentro" && <PestanaDentro token={token} datos={datos} revisar={revisar} />}
        {tab === "chat" && <PestanaChat token={token} datos={datos} revisar={revisar} />}
        {tab === "paquetes" && <PestanaPaquetes token={token} datos={datos} revisar={revisar} />}
        {tab === "turno" && <PestanaTurno token={token} datos={datos} agenda={agenda} />}
      </main>

      <nav aria-label="Secciones de caseta" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0D1714] pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map((t) => {
            const n = t.id === "chat" ? pendientesChat : t.id === "paquetes" ? paquetes : t.id === "dentro" ? datos.entrega.dentro.length : 0;
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
  enLinea,
  revisar,
  cola,
  guardarCola,
}: {
  token: string;
  datos: DatosCaseta;
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
          </dl>
        )}
        <p className="text-lg">{info.detalle || (r.error as string)}</p>
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
              if (codigo.trim()) validar(codigo);
              setCodigo("");
            }}
            className="flex gap-2"
          >
            <label htmlFor="codigo" className="sr-only">
              Código del pase
            </label>
            <input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código del pase" autoCapitalize="characters" autoComplete="off" className={`${CAMPO} font-mono tracking-widest`} />
            <button type="submit" disabled={ocupado || !enLinea} className={`${BOTON} shrink-0 bg-menta text-tinta`}>
              Validar
            </button>
          </form>
        </>
      )}
      <button type="button" onClick={() => setManual(!manual)} className={`${BOTON} border-2 border-white/20`}>
        {manual ? "Volver al escáner" : "Registro manual (sin QR o sin internet)"}
      </button>
      {manual && <FormManual token={token} datos={datos} enLinea={enLinea} revisar={revisar} cola={cola} guardarCola={guardarCola} onListo={() => setManual(false)} />}

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
  onListo: () => void;
}) {
  const [vivienda, setVivienda] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
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
        };
        setEnviando(true);
        try {
          if (!enLinea) throw new Error("offline");
          const res = revisar(await registroManual(token, r));
          if (!res.ok) return setMensaje(res.error ?? "No se pudo registrar.");
        } catch {
          guardarCola([...cola, { ...r, metodo: "sin_conexion" }]);
        } finally {
          setEnviando(false);
        }
        onListo();
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
        <input name="visitante" required minLength={2} className={CAMPO} />
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
          const r = revisar(await recibirPaquete(token, v.id, String(f.get("paqueteria") ?? ""), String(f.get("descripcion") ?? "")));
          setGuardando(false);
          if (r.ok) {
            setRecien({ vivienda: v.numero, residentes: v.residentes ?? [], paqueteria: String(f.get("paqueteria") ?? "") });
            setVivienda("");
            formulario.reset();
          }
        }}
        className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4"
      >
        <input list="viviendas-paq" value={vivienda} onChange={(e) => setVivienda(e.target.value)} required placeholder="Vivienda" className={CAMPO} aria-label="Vivienda" />
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
      <h2 className="text-lg font-bold">En caseta ({datos.entrega.paquetes.length})</h2>
      <ul className="flex flex-col divide-y divide-white/10 rounded-2xl bg-white/5">
        {datos.entrega.paquetes.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-lg font-semibold">{p.vivienda}</span>
                <span className="block text-sm text-white/70">
                  {[p.paqueteria, p.descripcion].filter(Boolean).join(" · ") || "Paquete"} · {hora(p.recibido_at)}
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
                  const n = String(new FormData(e.currentTarget).get("quien") ?? "");
                  const r = revisar(await entregarPaquete(token, p.id, n));
                  if (r.ok) setEntregando(null);
                }}
                className="flex gap-2"
              >
                <input name="quien" required minLength={2} list={`res-${p.id}`} placeholder="¿Quién lo recogió?" className={CAMPO} aria-label="Quién lo recogió" />
                <datalist id={`res-${p.id}`}>
                  {(porNumero.get(p.vivienda)?.residentes ?? []).map((r) => (
                    <option key={r.nombre} value={r.nombre} />
                  ))}
                </datalist>
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

function PestanaTurno({ token, datos, agenda }: { token: string; datos: DatosCaseta; agenda: AgendaCaseta }) {
  const e = datos.entrega;
  return (
    <>
      <h1 className="font-display text-3xl font-bold">Entrega de turno</h1>
      {e.turno_anterior && (
        <section className="rounded-2xl border-2 border-menta/40 p-4">
          <p className="text-sm text-white/70">
            Turno anterior: {e.turno_anterior.guardia} · {hora(e.turno_anterior.inicio)}–{hora(e.turno_anterior.fin)}
          </p>
          <p className="mt-1 text-lg">{e.turno_anterior.notas || "Sin notas."}</p>
        </section>
      )}
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
          </li>
        ))}
      </Bloque>
      <Bloque titulo="Visitas y proveedores esperados" n={e.esperados.length}>
        {e.esperados.map((x, i) => (
          <li key={i}>
            {x.visitante} · {x.vivienda} · {hora(x.desde)}–{hora(x.hasta)}
            {x.placa ? ` · ${x.placa}` : ""}
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
