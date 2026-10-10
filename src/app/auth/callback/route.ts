import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Recibe el link mágico del correo y abre la sesión.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Regresa a la invitación si de ahí venía (solo rutas propias conocidas).
      const siguiente = request.cookies.get("bk_siguiente")?.value ?? "";
      const destino = /^\/unirme\/[0-9a-f]{32}$/.test(siguiente) ? siguiente : "/";
      const res = NextResponse.redirect(`${origin}${destino}`);
      res.cookies.delete("bk_siguiente");
      return res;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
