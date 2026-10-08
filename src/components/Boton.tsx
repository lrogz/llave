"use client";

import { useFormStatus } from "react-dom";

const ESTILOS = {
  primario: "bg-verde text-white",
  oscuro: "bg-tinta text-white",
  menta: "bg-menta text-tinta",
  claro: "border border-borde bg-white text-tinta",
  peligro: "border border-naranja/40 bg-white text-naranja-oscuro",
} as const;

// Botón de envío que se desactiva y cambia el texto mientras corre la acción.
export function Boton({
  children,
  enviando = "Guardando…",
  estilo = "primario",
  className = "",
  name,
  value,
  formAction,
}: {
  children: React.ReactNode;
  enviando?: string;
  estilo?: keyof typeof ESTILOS;
  className?: string;
  name?: string;
  value?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      formAction={formAction}
      disabled={pending}
      className={`min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-60 ${ESTILOS[estilo]} ${className}`}
    >
      {pending ? enviando : children}
    </button>
  );
}
