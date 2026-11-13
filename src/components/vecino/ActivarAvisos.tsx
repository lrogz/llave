"use client";

import { useEffect, useState } from "react";
import { desuscribirVecino, probarAvisoVecino, suscribirVecino } from "@/app/vecino/actions";
import { Icono } from "./Iconos";

const CLAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const aBytes = (b: string) => {
  const crudo = atob((b + "=".repeat((4 - (b.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
};

// Activa notificaciones en el celular del residente: paquetes, visitas que llegan, timbre y avisos urgentes.
export function ActivarAvisos({ token }: { token: string }) {
  const [estado, setEstado] = useState<"cargando" | "sin_soporte" | "ios" | "activos" | "inactivos" | "bloqueados">("cargando");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const soporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!CLAVE;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const instalada = window.matchMedia("(display-mode: standalone)").matches;
    navigator.serviceWorker?.register("/sw.js", { scope: "/" }).catch(() => {});
    if (!soporta) {
      queueMicrotask(() => setEstado(ios && !instalada ? "ios" : "sin_soporte"));
      return;
    }
    if (Notification.permission === "denied") {
      queueMicrotask(() => setEstado("bloqueados"));
      return;
    }
    navigator.serviceWorker.ready
      .then((r) => r.pushManager.getSubscription())
      .then((s) => setEstado(s ? "activos" : "inactivos"))
      .catch(() => setEstado("inactivos"));
  }, []);

  async function activar() {
    setOcupado(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setEstado("bloqueados");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(CLAVE) }));
      const r = await suscribirVecino(token, sub.toJSON());
      if (r.ok) {
        setEstado("activos");
        probarAvisoVecino(token);
      }
    } finally {
      setOcupado(false);
    }
  }
  async function desactivar() {
    setOcupado(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await desuscribirVecino(token, sub.endpoint);
      await sub.unsubscribe();
    }
    setEstado("inactivos");
    setOcupado(false);
  }

  if (estado === "cargando" || estado === "sin_soporte") return null;
  if (estado === "activos")
    return (
      <button type="button" onClick={desactivar} disabled={ocupado} className="self-center text-sm text-[#5A5547] underline">
        Avisos activados en este celular · desactivar
      </button>
    );
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#E1DCD0] bg-[#FBF9F4] p-4">
      <Icono nombre="campana" className="size-8 shrink-0 text-[#17583A]" grueso={1.5} />
      <div className="flex-1 text-base">
        {estado === "ios" ? (
          <>Para recibir avisos en iPhone: <b>Compartir › Agregar a inicio</b> y abre la app desde ahí.</>
        ) : estado === "bloqueados" ? (
          <>Los avisos están bloqueados en tu navegador. Actívalos en la configuración del sitio.</>
        ) : (
          <>Recibe un aviso cuando llegue tu paquete, tu visita o alguien toque el timbre.</>
        )}
      </div>
      {estado === "inactivos" && (
        <button type="button" onClick={activar} disabled={ocupado} className="min-h-12 shrink-0 rounded-xl bg-[#17583A] px-4 font-semibold text-white disabled:opacity-60">
          Activar
        </button>
      )}
    </div>
  );
}
