import type { Metadata } from "next";
import { Acceso } from "../login/Acceso";

export const metadata: Metadata = { title: "Crear cuenta · Black Key" };

export default function Registro() {
  return <Acceso modoInicial="crear" />;
}
