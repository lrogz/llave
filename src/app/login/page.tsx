"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { Logo } from "@/components/Logo";

type Modo = "contrasena" | "link" | "crear";

export default function Login() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("contrasena");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [estado, setEstado] = useState<"inicio" | "enviando" | "enviado" | "error">("inicio");
  const [detalle, setDetalle] = useState("");

  // Si venía de una invitación, al entrar regresa ahí.
  function siguiente() {
    const s = new URLSearchParams(window.location.search).get("siguiente") ?? "";
    return /^\/unirme\/[0-9a-f]{32}$/.test(s) ? s : "";
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    setDetalle("");
    const supabase = createClient();
    const correo = email.trim();
    try {
      if (modo === "link") {
        const s = siguiente();
        guardarSiguiente(s);
        const { error } = await supabase.auth.signInWithOtp({ email: correo, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (error) return falla(error.message, error.status);
        return setEstado("enviado");
      }
      if (contrasena.length < 8) return falla("La contraseña debe tener al menos 8 caracteres.");
      if (modo === "crear") {
        const { data, error } = await supabase.auth.signUp({ email: correo, password: contrasena, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (error) return falla(error.message, error.status);
        if (!data.session) return falla("Tu cuenta se creó, pero Supabase pide confirmar el correo. Desactiva 'Confirm email' en Supabase › Authentication › Sign In / Providers › Email, o espera el correo.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena });
        if (error) return falla(error.message, error.status);
      }
      router.replace(siguiente() || "/hoy");
      router.refresh();
    } catch (e) {
      falla(e instanceof Error ? e.message : String(e));
    }
  }

  function falla(mensaje: string, status?: number) {
    setDetalle(explicar(mensaje, status));
    setEstado("error");
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-tinta px-4 py-16">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8">
        <Logo />
        <h1 className="mt-8 font-display text-3xl font-bold tracking-tight">{modo === "crear" ? "Crea tu cuenta" : "Entra a tu cuenta"}</h1>

        {!supabaseConfigurado ? (
          <p className="mt-6 rounded-xl bg-naranja-claro p-4 text-sm text-naranja-oscuro">Falta configurar Supabase. Revisa el README.</p>
        ) : estado === "enviado" ? (
          <p className="mt-6 rounded-xl bg-verde-claro p-4 text-sm text-verde-oscuro">
            Listo. Revisa <strong>{email}</strong> y abre el link desde este mismo navegador.
          </p>
        ) : (
          <>
            <div role="tablist" aria-label="Forma de entrar" className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-fondo p-1 text-sm font-bold">
              {(
                [
                  ["contrasena", "Con contraseña"],
                  ["link", "Con link al correo"],
                ] as const
              ).map(([m, t]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={modo === m || (m === "contrasena" && modo === "crear")}
                  onClick={() => {
                    setModo(m);
                    setEstado("inicio");
                  }}
                  className={`min-h-10 rounded-lg ${modo === m || (m === "contrasena" && modo === "crear") ? "bg-white shadow-sm" : "text-gris"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <form onSubmit={enviar} className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Correo
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@administradora.mx"
                  className="min-h-12 rounded-xl border border-borde px-4 text-base font-normal outline-none focus:border-verde"
                />
              </label>
              {modo !== "link" && (
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Contraseña
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete={modo === "crear" ? "new-password" : "current-password"}
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                    className="min-h-12 rounded-xl border border-borde px-4 text-base font-normal outline-none focus:border-verde"
                  />
                </label>
              )}
              <button type="submit" disabled={estado === "enviando"} className="min-h-12 rounded-xl bg-verde font-bold text-white disabled:opacity-60">
                {estado === "enviando" ? "Un momento…" : modo === "link" ? "Mandarme el link" : modo === "crear" ? "Crear cuenta" : "Entrar"}
              </button>
              {estado === "error" && (
                <p role="alert" className="text-sm text-naranja-oscuro">
                  {detalle}
                </p>
              )}
            </form>
            <p className="mt-4 text-center text-sm text-gris">
              {modo === "crear" ? (
                <button type="button" onClick={() => setModo("contrasena")} className="font-semibold text-verde underline">
                  Ya tengo cuenta
                </button>
              ) : (
                <>
                  ¿Primera vez?{" "}
                  <button type="button" onClick={() => setModo("crear")} className="font-semibold text-verde underline">
                    Crear cuenta con contraseña
                  </button>
                </>
              )}
            </p>
            {modo === "contrasena" && (
              <p className="mt-2 text-center text-xs text-gris">¿Ya tenías cuenta con link? Entra una vez con el link y ponle contraseña en Ajustes.</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// Recuerda a dónde volver después del link del correo (lo lee /auth/callback).
function guardarSiguiente(ruta: string) {
  document.cookie = ruta ? `bk_siguiente=${ruta}; path=/; max-age=3600; samesite=lax` : "bk_siguiente=; path=/; max-age=0";
}

// Traduce los errores más comunes de Supabase Auth a algo accionable.
function explicar(mensaje: string, status?: number) {
  const m = mensaje.toLowerCase();
  if (m.includes("rate limit") || status === 429) {
    return "Supabase llegó a su límite de correos por hora (el correo gratuito manda muy pocos). Entra con contraseña o espera unos minutos.";
  }
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("already registered")) return "Ese correo ya tiene cuenta. Entra con tu contraseña o con link.";
  if (m.includes("email not confirmed")) return "Falta confirmar tu correo. En Supabase › Authentication › Sign In / Providers › Email desactiva 'Confirm email'.";
  if (m.includes("signups not allowed") || m.includes("signup")) {
    return "En tu Supabase están desactivados los registros nuevos. Actívalos en Authentication › Sign In / Providers › Allow new users to sign up.";
  }
  if (m.includes("password")) return mensaje.includes("8") ? "La contraseña debe tener al menos 8 caracteres." : `Contraseña no válida: ${mensaje}`;
  if (m.includes("invalid") && m.includes("email")) return "Ese correo no es válido. Revisa que esté completo.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("invalid url") || m.includes("api key")) {
    return "No pudimos conectar con Supabase. Revisa la URL y la llave publicable en las variables de entorno.";
  }
  return mensaje;
}
