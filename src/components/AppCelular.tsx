"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const CLAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function aBytes(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
}

type Entorno = { ios: boolean; instalada: boolean; soportaPush: boolean; permiso: NotificationPermission | "no" };
const SIN: Entorno = { ios: false, instalada: false, soportaPush: false, permiso: "no" };
let cache: Entorno | null = null;
function leerEntorno(): Entorno {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const soportaPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const permiso = "Notification" in window ? Notification.permission : "no";
  if (!cache || cache.ios !== ios || cache.instalada !== instalada || cache.soportaPush !== soportaPush || cache.permiso !== permiso) cache = { ios, instalada, soportaPush, permiso };
  return cache;
}
const suscribirse = (cb: () => void) => {
  window.addEventListener("bk-instalable", cb);
  window.addEventListener("focus", cb);
  return () => {
    window.removeEventListener("bk-instalable", cb);
    window.removeEventListener("focus", cb);
  };
};

function nombreDispositivo() {
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Navegador";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [so, nav].filter(Boolean).join(" · ");
}

type Acciones = {
  suscribir: (sub: unknown, dispositivo: string) => Promise<{ ok: boolean }>;
  desuscribir: (endpoint: string) => Promise<unknown>;
  probar: () => Promise<{ ok: boolean }>;
};

// Instalar la app y activar las notificaciones en este dispositivo (administradoras y proveedores).
export function AppCelular({
  configurado,
  avisos,
  nombre = "Black Key",
  suscribir,
  desuscribir,
  probar: probarNotificacion,
}: Acciones & { configurado: boolean; avisos: string; nombre?: string }) {
  const entorno = useSyncExternalStore(suscribirse, leerEntorno, () => SIN);
  const [puedeInstalar, setPuedeInstalar] = useState(false);
  const [activa, setActiva] = useState<boolean | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const revisar = () => setPuedeInstalar(!!window.__instalarBK);
    revisar();
    window.addEventListener("bk-instalable", revisar);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.ready
        .then((r) => r.pushManager?.getSubscription())
        .then((s) => setActiva(!!s))
        .catch(() => setActiva(false));
    return () => window.removeEventListener("bk-instalable", revisar);
  }, []);

  async function instalar() {
    const e = window.__instalarBK;
    if (!e) return;
    await e.prompt();
    await e.userChoice.catch(() => null);
    window.__instalarBK = null;
    setPuedeInstalar(false);
  }

  async function activar() {
    setOcupado(true);
    setMensaje("");
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setMensaje("No diste permiso. Puedes activarlo en la configuración del navegador (ícono del candado › Notificaciones).");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(CLAVE) }));
      const r = await suscribir(JSON.parse(JSON.stringify(sub)), nombreDispositivo());
      setActiva(r.ok);
      setMensaje(r.ok ? "Listo: te avisaremos aquí." : "No pudimos activarlas. Intenta de nuevo.");
    } catch {
      setMensaje("Este navegador no permitió activarlas. Intenta desde Chrome o Safari actualizados.");
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await desuscribir(sub.endpoint);
        await sub.unsubscribe();
      }
      setActiva(false);
      setMensaje("Desactivadas en este dispositivo.");
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    const r = await probarNotificacion().catch(() => ({ ok: false }));
    setMensaje(r.ok ? "Te mandamos una de prueba. Debe llegar en unos segundos." : "No se pudo mandar. Desactívalas y vuelve a activarlas.");
    setOcupado(false);
  }

  const boton = "flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-bold disabled:opacity-60";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold">1. Instalar en este dispositivo</h3>
        {entorno.instalada ? (
          <p className="text-sm text-verde-oscuro">✓ Ya la estás usando como app.</p>
        ) : puedeInstalar ? (
          <button type="button" onClick={instalar} className={`${boton} self-start bg-verde text-white`}>
            Instalar {nombre}
          </button>
        ) : entorno.ios ? (
          <ol className="list-decimal pl-5 text-sm text-gris">
            <li>Abre esta página en Safari.</li>
            <li>
              Toca <strong>Compartir</strong> (el cuadro con flecha hacia arriba).
            </li>
            <li>
              Elige <strong>Agregar a inicio</strong> y luego <strong>Agregar</strong>.
            </li>
            <li>Abre {nombre} desde el ícono nuevo y activa los avisos ahí.</li>
          </ol>
        ) : (
          <p className="text-sm text-gris">En Android abre el menú ⋮ de Chrome › &quot;Instalar app&quot;. En la compu, el ícono de instalar a la derecha de la barra de direcciones.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold">2. Notificaciones</h3>
        <p className="text-sm text-gris">{avisos}</p>
        {!configurado ? (
          <p className="text-sm text-gris">Falta configurar las llaves de notificaciones en el servidor (ver README).</p>
        ) : !entorno.soportaPush ? (
          <p className="text-sm text-gris">{entorno.ios && !entorno.instalada ? "En iPhone primero instala la app (paso 1) y ábrela desde su ícono." : "Este navegador no permite notificaciones."}</p>
        ) : entorno.permiso === "denied" ? (
          <p className="text-sm text-naranja-oscuro">Bloqueaste las notificaciones para Black Key. Actívalas en la configuración del navegador o del celular y vuelve aquí.</p>
        ) : activa ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-verde-oscuro">✓ Activadas en este dispositivo</span>
            <button type="button" onClick={probar} disabled={ocupado} className={`${boton} border border-borde bg-white`}>
              Mandar una de prueba
            </button>
            <button type="button" onClick={desactivar} disabled={ocupado} className={`${boton} text-gris underline`}>
              Desactivar
            </button>
          </div>
        ) : (
          <button type="button" onClick={activar} disabled={ocupado || activa === null} className={`${boton} self-start bg-tinta text-white`}>
            {ocupado ? "Activando…" : "Activar notificaciones"}
          </button>
        )}
        {mensaje && (
          <p role="status" className="text-sm">
            {mensaje}
          </p>
        )}
      </div>
    </div>
  );
}
