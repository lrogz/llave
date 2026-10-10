import type { Metadata } from "next";
import { Acceso } from "./Acceso";

export const metadata: Metadata = { title: "Entrar · Black Key" };

export default function Login() {
  return <Acceso />;
}
