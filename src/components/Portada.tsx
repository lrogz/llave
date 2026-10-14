import type { ReactNode } from "react";
import { BUCKET } from "@/lib/datos";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

// Fondos suaves de la marca; cada propiedad toma uno fijo según su id para que la cartera no se vea igual.
const PALETAS = [
  { fondo: "#D8E3DE", acento: "#9DB8AC" }, // salvia
  { fondo: "#EDE3D3", acento: "#C9B48F" }, // arena
  { fondo: "#F1DCD0", acento: "#D49C80" }, // cantera
  { fondo: "#DCE3EC", acento: "#9DAFC6" }, // cielo
];

function paleta(semilla: string) {
  let h = 0;
  for (const c of semilla) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETAS[h % PALETAS.length];
}

// Fachadas sencillas por tipo de propiedad (viewBox 200×100, apoyadas en el piso).
function Fachada({ tipo, acento }: { tipo: string; acento: string }) {
  const b = "#FFFFFF";
  switch (tipo) {
    case "departamento":
      return (
        <g>
          <rect x="112" y="14" width="58" height="86" rx="2" fill={b} />
          {[0, 1, 2, 3].map((f) => [0, 1, 2].map((c) => <rect key={`${f}${c}`} x={120 + c * 16} y={22 + f * 17} width="10" height="10" rx="1" fill={acento} />))}
          <rect x="135" y="88" width="12" height="12" fill={acento} />
          <rect x="172" y="50" width="20" height="50" rx="2" fill={b} opacity="0.7" />
        </g>
      );
    case "local":
      return (
        <g>
          <rect x="104" y="38" width="84" height="62" rx="2" fill={b} />
          <path d="M100 38h92l-6 14H106z" fill={acento} />
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={108 + i * 14} y="38" width="7" height="14" fill={b} opacity="0.55" />)}
          <rect x="112" y="60" width="44" height="30" rx="1" fill={acento} opacity="0.55" />
          <rect x="164" y="62" width="16" height="38" rx="1" fill={acento} />
        </g>
      );
    case "oficina":
      return (
        <g>
          <rect x="118" y="6" width="42" height="94" rx="2" fill={b} />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x="124" y={13 + i * 12} width="30" height="5" rx="1" fill={acento} />)}
          <rect x="162" y="38" width="26" height="62" rx="2" fill={b} opacity="0.75" />
          {[0, 1, 2, 3].map((i) => <rect key={i} x="167" y={45 + i * 12} width="16" height="4" rx="1" fill={acento} opacity="0.8" />)}
        </g>
      );
    case "unidad_condominio":
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${96 + i * 32} ${i === 1 ? -6 : 0})`}>
              <rect x="0" y="52" width="30" height="48" fill={b} />
              <path d="M-3 54L15 36l18 18z" fill={acento} />
              <rect x="10" y="80" width="10" height="20" fill={acento} />
              <rect x="6" y="62" width="8" height="8" fill={acento} opacity="0.6" />
            </g>
          ))}
        </g>
      );
    default: // casa y otro
      return (
        <g>
          <circle cx="182" cy="70" r="13" fill={acento} opacity="0.6" />
          <rect x="180.5" y="78" width="3" height="22" fill={acento} />
          <rect x="110" y="48" width="60" height="52" fill={b} />
          <path d="M103 51L140 22l37 29z" fill={acento} />
          <rect x="133" y="74" width="14" height="26" rx="1" fill={acento} />
          <rect x="117" y="60" width="11" height="11" rx="1" fill={acento} opacity="0.6" />
          <rect x="152" y="60" width="11" height="11" rx="1" fill={acento} opacity="0.6" />
        </g>
      );
  }
}

// Portada de una propiedad: la foto si la subieron; si no, una ilustración según su tipo.
export function Portada({ tipo, url, semilla, className = "h-28", children }: { tipo: string; url?: string | null; semilla: string; className?: string; children?: ReactNode }) {
  const { fondo, acento } = paleta(semilla);
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ backgroundColor: fondo }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Supabase, cambia cada hora
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <svg viewBox="0 0 200 100" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" className="absolute inset-0 size-full">
          <Fachada tipo={tipo} acento={acento} />
        </svg>
      )}
      {url && <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent to-60%" />}
      <div className="relative flex h-full items-end justify-between gap-2 px-3 py-2.5">{children}</div>
    </div>
  );
}

// URLs firmadas (1 hora) de las portadas, en una sola llamada.
export async function urlsPortada(db: Db, paths: (string | null)[]) {
  const validos = paths.filter((p): p is string => !!p);
  if (!validos.length) return new Map<string, string>();
  const { data } = await db.storage.from(BUCKET).createSignedUrls(validos, 3600);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl]));
}
