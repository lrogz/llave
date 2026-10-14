"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const CLAVE = "bk-banner-app";
const nada = () => () => {};
function mostrar() {
  const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (instalada) return false;
  try {
    return localStorage.getItem(CLAVE) !== "1";
  } catch {
    return true;
  }
}

// Invitación a instalar la app (solo si no está instalada y no la cerró antes).
export function BannerApp() {
  const ver = useSyncExternalStore(nada, mostrar, () => false);
  if (!ver) return null;
  return (
    <aside aria-label="Instala la app" className="flex flex-wrap items-center gap-3 rounded-2xl bg-tinta p-4 text-white">
      <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-black text-xl">🔑</span>
      <span className="min-w-0 flex-1 text-sm">
        <strong className="block">Lleva Black Key en tu celular</strong>
        <span className="text-[#B9C8C1]">Instálala sin tienda de apps y recibe avisos de reportes y pagos al instante.</span>
      </span>
      <Link href="/ajustes#app" className="flex min-h-10 items-center rounded-xl bg-menta px-4 text-sm font-bold text-tinta">
        Instalar
      </Link>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={(e) => {
          try {
            localStorage.setItem(CLAVE, "1");
          } catch {}
          (e.currentTarget.parentElement as HTMLElement).hidden = true;
        }}
        className="flex size-10 items-center justify-center rounded-xl text-lg text-[#B9C8C1] hover:bg-white/10"
      >
        ×
      </button>
    </aside>
  );
}
