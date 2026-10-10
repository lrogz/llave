"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { Logo } from "@/components/Logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"inicio" | "enviando" | "enviado" | "error">("inicio");
  const [detalle, setDetalle] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setDetalle(explicar(error.message, error.status));
        setEstado("error");
      } else setEstado("enviado");
    } catch (e) {
      setDetalle(explicar(e instanceof Error ? e.message : String(e)));
      setEstado("error");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-tinta px-4 py-16">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8">
        <Logo />
        <h1 className="mt-8 font-display text-3xl font-bold tracking-tight">Entra a tu cuenta</h1>
        <p className="mt-2 text-sm text-gris">Te mandamos un link a tu correo. Sin contraseñas.</p>

        {!supabaseConfigurado ? (
          <p className="mt-6 rounded-xl bg-naranja-claro p-4 text-sm text-naranja-oscuro">
            Falta configurar Supabase en <code>.env.local</code>. Revisa el README.
          </p>
        ) : estado === "enviado" ? (
          <p className="mt-6 rounded-xl bg-verde-claro p-4 text-sm text-verde-oscuro">
            Listo. Revisa <strong>{email}</strong> y abre el link desde este dispositivo.
          </p>
        ) : (
          <form onSubmit={enviar} className="mt-6 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Correo
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@administradora.mx"
                className="min-h-12 rounded-xl border border-borde px-4 text-base font-normal outline-none focus:border-verde"
              />
            </label>
            <button
              type="submit"
              disabled={estado === "enviando"}
              className="min-h-12 rounded-xl bg-verde font-bold text-white disabled:opacity-60"
            >
              {estado === "enviando" ? "Enviando…" : "Mandarme el link"}
            </button>
            {estado === "error" && (
              <p role="alert" className="text-sm text-naranja-oscuro">{detalle}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

// Traduce los errores más comunes de Supabase Auth a algo accionable.
function explicar(mensaje: string, status?: number) {
  const m = mensaje.toLowerCase();
  if (m.includes("rate limit") || status === 429) {
    return "Supabase llegó a su límite de correos por hora (el correo gratuito manda muy pocos). Espera unos minutos o configura un SMTP propio en Supabase › Authentication › Emails.";
  }
  if (m.includes("signups not allowed") || m.includes("signup")) {
    return "En tu Supabase están desactivados los registros nuevos. Actívalos en Authentication › Sign In / Providers › Allow new users to sign up.";
  }
  if (m.includes("invalid") && m.includes("email")) return "Ese correo no es válido. Revisa que esté completo.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("invalid url") || m.includes("api key")) {
    return "No pudimos conectar con Supabase. Revisa NEXT_PUBLIC_SUPABASE_URL y la llave publicable en .env.local y reinicia con npm run dev.";
  }
  return `No pudimos mandar el correo: ${mensaje}`;
}
