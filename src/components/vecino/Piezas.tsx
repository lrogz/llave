import Link from "next/link";
import { Icono, type NombreIcono } from "./Iconos";

// Piezas visuales del portal del residente (fondo crema, verde bosque).
export const VERDE = "bg-[#17583A] text-white";

export function Pantalla({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pt-6 pb-8">{children}</main>;
}

export function Titulo({ titulo, sub, atras, accion }: { titulo: string; sub?: string; atras?: string; accion?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-1">
      {atras && (
        <Link href={atras} aria-label="Regresar" className="-ml-2 mb-2 flex size-11 items-center justify-center rounded-full text-[#1F1E1A] hover:bg-black/5">
          <Icono nombre="atras" className="size-7" />
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-tight text-[#1F1E1A]">{titulo}</h1>
          {sub && <p className="mt-1 text-xl text-[#2E2D27]">{sub}</p>}
        </div>
        {accion}
      </div>
    </header>
  );
}

export function BotonGrande({ href, icono, children }: { href: string; icono?: NombreIcono; children: React.ReactNode }) {
  return (
    <Link href={href} className={`flex min-h-16 items-center justify-center gap-3 rounded-2xl ${VERDE} px-5 text-xl font-semibold shadow-sm`}>
      {icono && <Icono nombre={icono} className="size-7" />}
      {children}
    </Link>
  );
}

export function BotonContorno({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-14 items-center justify-center rounded-2xl border border-[#BDB8AC] bg-[#FBF9F4] px-5 text-lg font-medium text-[#1F1E1A]">
      {children}
    </Link>
  );
}

export function Tarjeta({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-[#E1DCD0] bg-[#FBF9F4] ${className}`}>{children}</section>;
}

export function Chip({ texto, clase }: { texto: string; clase: string }) {
  return <span className={`inline-flex w-fit items-center rounded-full px-3.5 py-1 text-base font-semibold ${clase}`}>{texto}</span>;
}

export function Fila({ icono, children }: { icono: NombreIcono; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3 text-lg text-[#2E2D27]">
      <Icono nombre={icono} className="size-7 shrink-0 text-[#2E2D27]" grueso={1.5} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-[#CFC9BB] px-5 py-8 text-center text-base text-[#5A5547]">{children}</p>;
}

export function LinkInvalido() {
  return (
    <Pantalla>
      <Tarjeta className="p-6">
        <h1 className="font-display text-2xl font-bold">Este link ya no es válido</h1>
        <p className="mt-2 text-base text-[#5A5547]">Pide a tu administración que te comparta el link nuevo de tu vivienda.</p>
      </Tarjeta>
    </Pantalla>
  );
}

export function Aviso({ tipo = "ok", children }: { tipo?: "ok" | "error"; children: React.ReactNode }) {
  return (
    <p role={tipo === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-base ${tipo === "error" ? "bg-[#FBE3D6] text-[#7A2E0A]" : "bg-[#D5E6CF] text-[#1E4D2B]"}`}>
      {children}
    </p>
  );
}

export function Cargando() {
  return (
    <Pantalla>
      <p className="py-10 text-center text-base text-[#5A5547]" role="status">
        Cargando…
      </p>
    </Pantalla>
  );
}

// Clases para campos de formulario grandes y legibles.
export const CAMPO = "min-h-13 w-full rounded-xl border border-[#BDB8AC] bg-white px-4 text-lg text-[#1F1E1A] outline-none focus:border-[#17583A] focus:ring-2 focus:ring-[#17583A]/25";
export const ETIQUETA = "flex flex-col gap-1.5 text-base font-semibold text-[#2E2D27]";
