"use client";

import { useState } from "react";
import { usarPinKiosco } from "@/app/kiosco/actions";

const TEXTO: Record<string, string> = {
  pin_invalido: "Código no válido. Revisa el código con el residente.",
  bloqueado: "Demasiados intentos. Espera unos minutos.",
  link_invalido: "Esta tablet ya no está configurada. Avisa a la administración.",
  error: "No hay conexión. Entrega en caseta.",
};

export function Kiosco({ token, condominio }: { token: string; condominio: string }) {
  const [pin, setPin] = useState("");
  const [paq, setPaq] = useState("");
  const [r, setR] = useState<{ ok: boolean; motivo?: string; vivienda?: string; apertura?: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const tecla = (d: string) => setPin((p) => (p + d).slice(0, 6));

  async function enviar() {
    setOcupado(true);
    try {
      setR(await usarPinKiosco(token, pin, paq));
    } catch {
      setR({ ok: false, motivo: "error" });
    } finally {
      setOcupado(false);
      setPin("");
    }
  }

  if (r) {
    return (
      <main className={`flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center ${r.ok ? "bg-menta text-tinta" : "bg-naranja text-white"}`}>
        <p className="font-display text-5xl font-bold">{r.ok ? "Puerta abierta" : "No se pudo"}</p>
        <p className="text-2xl">{r.ok ? `Deja el paquete de ${r.vivienda} en el anaquel y cierra la puerta.${r.apertura === "simulado" ? " (Puerta en modo simulación)" : ""}` : TEXTO[r.motivo ?? "error"]}</p>
        <button onClick={() => setR(null)} autoFocus className="min-h-16 rounded-2xl bg-tinta px-10 text-xl font-bold text-white">
          Listo
        </button>
      </main>
    );
  }
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-tinta p-6 text-white">
      <div className="text-center">
        <p className="text-lg text-white/70">{condominio}</p>
        <h1 className="font-display text-4xl font-bold">Cuarto de paquetes</h1>
        <p className="mt-2 text-lg text-white/80">Teclea el código de 6 números que te dio el residente.</p>
      </div>
      <p className="font-mono text-6xl tracking-[0.3em]" aria-live="polite">{pin.padEnd(6, "·")}</p>
      <input value={paq} onChange={(e) => setPaq(e.target.value)} placeholder="Paquetería (opcional)" className="min-h-14 w-full max-w-sm rounded-xl border-2 border-white/15 bg-white/5 px-4 text-center text-lg" aria-label="Paquetería" />
      <div className="grid w-full max-w-sm grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "←", "0", "OK"].map((k) => (
          <button
            key={k}
            disabled={ocupado || (k === "OK" && pin.length < 6)}
            onClick={() => (k === "←" ? setPin((p) => p.slice(0, -1)) : k === "OK" ? enviar() : tecla(k))}
            className={`min-h-20 rounded-2xl text-3xl font-bold disabled:opacity-40 ${k === "OK" ? "bg-menta text-tinta" : "bg-white/10"}`}
          >
            {k}
          </button>
        ))}
      </div>
    </main>
  );
}
