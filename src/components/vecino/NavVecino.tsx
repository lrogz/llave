"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Icono, type NombreIcono } from "./Iconos";

const TABS: { texto: string; ruta: string; icono: NombreIcono }[] = [
  { texto: "Inicio", ruta: "", icono: "inicio" },
  { texto: "Visitas", ruta: "/visitas", icono: "visitas" },
  { texto: "Cuenta", ruta: "/cuenta", icono: "cuenta" },
  { texto: "Caseta", ruta: "/caseta", icono: "caseta" },
];

// Barra de abajo del portal del residente.
export function NavVecino() {
  const { token } = useParams<{ token: string }>();
  const ruta = usePathname();
  const base = `/vecino/${token}`;
  const activa = TABS.slice(1).find((t) => ruta.startsWith(base + t.ruta))?.ruta ?? "";
  return (
    <nav aria-label="Secciones" data-movil className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E3DED2] bg-[#FBF9F4] pb-[env(safe-area-inset-bottom)] print:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map((t) => {
          const esta = t.ruta === activa;
          return (
            <li key={t.texto}>
              <Link
                href={base + t.ruta}
                aria-current={esta ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[13px] ${esta ? "font-bold text-[#17583A]" : "text-[#3B3A33]"}`}
              >
                <Icono nombre={t.icono} grueso={esta ? 2.2 : 1.6} />
                {t.texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
