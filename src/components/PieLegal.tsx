import Link from "next/link";

// Pie con ligas legales para formularios públicos (inquilinos, dueños, proveedores).
export function PieLegal({ accion = "Al enviar" }: { accion?: string }) {
  return (
    <p className="text-center text-xs text-gris">
      {accion} aceptas el{" "}
      <Link href="/privacidad" className="underline" target="_blank">
        aviso de privacidad
      </Link>
      .
    </p>
  );
}
