import Link from "next/link";
import { salir } from "@/app/actions";
import { Logo } from "./Logo";

const ITEMS = [
  { texto: "Hoy", href: "/hoy" },
  { texto: "Propiedades", href: "/" },
  { texto: "Personas", href: "/personas" },
  { texto: "Tickets", href: "/tickets" },
  { texto: "Bandeja", href: null },
  { texto: "Proveedores", href: null },
  { texto: "Pagos", href: "/pagos" },
  { texto: "Documentos", href: null },
] as const;

export function Menu({ activo, nombreOrg }: { activo: "Hoy" | "Propiedades" | "Personas" | "Tickets" | "Pagos"; nombreOrg: string }) {
  return (
    <nav
      aria-label="Secciones"
      className="flex min-w-52 flex-[1_1_220px] flex-col gap-7 bg-tinta px-4 py-7 text-[#C9D6D0] sm:max-w-64"
    >
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
                className={
                  item.texto === activo
                    ? "block rounded-xl bg-menta px-3 py-3 font-bold text-tinta"
                    : "block rounded-xl px-3 py-3 hover:bg-white/5"
                }
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
  );
}

export function Cargando() {
  return (
    <div className="flex flex-1 items-center justify-center bg-fondo p-10 text-sm text-gris" role="status">
      Cargando…
    </div>
  );
}
