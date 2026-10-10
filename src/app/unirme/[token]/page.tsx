import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Aceptar } from "./Aceptar";

export const metadata: Metadata = { title: "Invitación · Black Key", robots: { index: false } };

export default function Unirme({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-tinta px-4 py-16">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8">
        <Logo />
        <Suspense fallback={<p className="mt-6 text-sm text-gris">Cargando…</p>}>
          <Contenido params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) return <Invalida />;

  // Solo mostramos a qué administradora es y para qué correo; el token es el secreto.
  const { data } = await createAdminClient().from("invitaciones").select("email, rol, aceptada_at, organizaciones(nombre)").eq("token", token).maybeSingle();
  if (!data || data.aceptada_at) return <Invalida />;
  const org = (data.organizaciones as unknown as { nombre: string } | null)?.nombre ?? "una administradora";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const mismoCorreo = user?.email?.toLowerCase() === data.email.toLowerCase();

  return (
    <>
      <h1 className="mt-8 font-display text-3xl font-bold tracking-tight">Te invitaron a {org}</h1>
      <p className="mt-2 text-sm text-gris">
        Entrarás como <strong>{data.rol === "admin" ? "administradora" : "asistente"}</strong> con el correo <strong>{data.email}</strong>.
      </p>
      {!user ? (
        <Link href={`/login?siguiente=/unirme/${token}`} className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-verde font-bold text-white">
          Entrar con {data.email}
        </Link>
      ) : mismoCorreo ? (
        <Aceptar token={token} />
      ) : (
        <p className="mt-6 rounded-xl bg-naranja-claro p-4 text-sm text-naranja-oscuro">
          Entraste como {user.email}. Esta invitación es para {data.email}: sal y entra con ese correo.
        </p>
      )}
    </>
  );
}

function Invalida() {
  return <p className="mt-6 text-sm">Esta invitación ya no es válida. Pide que te manden una nueva.</p>;
}
