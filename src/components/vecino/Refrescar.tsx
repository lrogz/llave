"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Vuelve a pedir los datos cada cierto tiempo mientras la pestaña está visible (chat, caseta).
export function Refrescar({ cada = 15000 }: { cada?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    }, cada);
    return () => clearInterval(id);
  }, [router, cada]);
  return null;
}
