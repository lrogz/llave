import Link from "next/link";
import { salir } from "@/app/actions";
import { Logo } from "./Logo";

type Seccion = "Hoy" | "Propiedades" | "Personas" | "Tickets" | "Pagos" | "Proveedores" | "Documentos" | "Equipo" | "Ajustes" | "Plan";

const ITEMS: { texto: Seccion | "Bandeja"; href: string | null; corto?: string }[] = [
  { texto: "Hoy", href: "/hoy" },
  { texto: "Propiedades", href: "/", corto: "Casas" },
  { texto: "Personas", href: "/personas" },
  { texto: "Tickets", href: "/tickets" },
  { texto: "Bandeja", href: null },
  { texto: "Proveedores", href: "/proveedores" },
  { texto: "Pagos", href: "/pagos" },
  { texto: "Documentos", href: "/documentos" },
  { texto: "Equipo", href: "/equipo" },
  { texto: "Ajustes", href: "/ajustes" },
  { texto: "Plan", href: "/plan" },
];

// En el celular: barra abajo con lo más usado y "Más" para lo demás.
const PRINCIPALES: Seccion[] = ["Hoy", "Propiedades", "Tickets", "Pagos"];

const ICONO: Record<string, string> = {
  Hoy: "M4 7h16M4 12h10M4 17h7",
  Propiedades: "M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z",
  Tickets: "M5 5h14v4a2 2 0 0 0 0 4v4H5v-4a2 2 0 0 0 0-4z",
  Pagos: "M4 7h16v10H4zM4 11h16M8 15h3",
  Más: "M5 12h.01M12 12h.01M19 12h.01",
};

function Icono({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function Menu({ activo, nombreOrg }: { activo: Seccion; nombreOrg: string }) {
  const enMas = !PRINCIPALES.includes(activo);
  return (
    <>
      {/* Computadora y tableta: menú lateral */}
      <nav aria-label="Secciones" className="hidden min-w-52 flex-[1_1_220px] flex-col gap-7 bg-tinta px-4 py-7 text-[#C9D6D0] md:flex md:max-w-64">
        <Link href="/" className="px-2.5">
          <Logo claro />
        </Link>
        <ul className="flex flex-col gap-1 text-sm">
          {ITEMS.map((item) => (
            <li key={item.texto}>
              {item.href ? (
                <Link
                  href={item.href}
                  aria-current={item.texto === activo ? "page" : undefined}
                  className={item.texto === activo ? "block rounded-xl bg-menta px-3 py-3 font-bold text-tinta" : "block rounded-xl px-3 py-3 hover:bg-white/5"}
                >
                  {item.texto}
                </Link>
              ) : (
                <span className="block px-3 py-3 text-[#7F918A]">
                  {item.texto} <span className="ml-1 text-xs">pronto</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-2 px-2.5 text-sm">
          <span className="font-semibold text-white">{nombreOrg}</span>
          <form action={salir}>
            <button type="submit" className="text-[#A9BAB2] underline">
              Salir
            </button>
          </form>
        </div>
      </nav>

      {/* Celular: barra de arriba con el nombre y barra de abajo con las secciones */}
      <header className="flex w-full basis-full items-center justify-between gap-3 bg-tinta px-4 py-3 print:hidden md:hidden">
        <Link href="/hoy" aria-label="Inicio">
          <Logo claro />
        </Link>
        <span className="truncate text-sm font-semibold text-[#C9D6D0]">{nombreOrg}</span>
      </header>
      <nav aria-label="Secciones (celular)" data-movil className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-tinta pb-[env(safe-area-inset-bottom)] print:hidden md:hidden">
        <ul className="grid grid-cols-5">
          {PRINCIPALES.map((s) => {
            const item = ITEMS.find((i) => i.texto === s)!;
            return (
              <li key={s}>
                <Link
                  href={item.href!}
                  aria-current={s === activo ? "page" : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${s === activo ? "text-menta" : "text-[#A9BAB2]"}`}
                >
                  <Icono d={ICONO[s]} />
                  {item.corto ?? s}
                </Link>
              </li>
            );
          })}
          <li className="relative">
            <details className="group">
              <summary className={`flex min-h-16 cursor-pointer list-none flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${enMas ? "text-menta" : "text-[#A9BAB2]"}`}>
                <Icono d={ICONO.Más} />
                Más
              </summary>
              <div className="absolute right-2 bottom-[4.5rem] w-56 rounded-2xl bg-white p-2 text-tinta shadow-xl">
                <ul className="flex flex-col">
                  {ITEMS.filter((i) => i.href && !PRINCIPALES.includes(i.texto as Seccion)).map((i) => (
                    <li key={i.texto}>
                      <Link
                        href={i.href!}
                        aria-current={i.texto === activo ? "page" : undefined}
                        className={`flex min-h-12 items-center rounded-xl px-3 text-sm font-semibold ${i.texto === activo ? "bg-menta" : "hover:bg-fondo"}`}
                      >
                        {i.texto}
                      </Link>
                    </li>
                  ))}
                  <li className="border-t border-borde-suave">
                    <form action={salir}>
                      <button type="submit" className="flex min-h-12 w-full items-center px-3 text-sm text-gris">
                        Salir
                      </button>
                    </form>
                  </li>
                </ul>
              </div>
            </details>
          </li>
        </ul>
      </nav>
    </>
  );
}

export function Cargando() {
  return (
    <div className="flex flex-1 items-center justify-center bg-fondo p-10 text-sm text-gris" role="status">
      Cargando…
    </div>
  );
}
