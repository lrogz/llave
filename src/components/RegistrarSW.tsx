"use client";

import { useEffect } from "react";

// Registra el service worker y guarda el aviso de "instalar" de Chrome/Android para usarlo después.
export type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global {
  interface Window {
    __instalarBK?: EventoInstalar | null;
  }
}

export function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    const guardar = (e: Event) => {
      e.preventDefault();
      window.__instalarBK = e as EventoInstalar;
      window.dispatchEvent(new Event("bk-instalable"));
    };
    window.addEventListener("beforeinstallprompt", guardar);
    if ("clearAppBadge" in navigator) (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {});
    return () => window.removeEventListener("beforeinstallprompt", guardar);
  }, []);
  return null;
}
