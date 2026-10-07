"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfigurado } from "@/lib/supabase/config";

export default function Login() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"inicio" | "enviando" | "enviado" | "error">("inicio");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setEstado(error ? "error" : "enviado");
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
              <p className="text-sm text-naranja-oscuro">No pudimos mandar el correo. Intenta de nuevo.</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-menta">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14201C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="15" r="4" />
          <path d="M11 12l9-9M17 6l3 3" />
        </svg>
      </span>
      <span className="font-display text-2xl font-bold">Llave</span>
    </div>
  );
}
