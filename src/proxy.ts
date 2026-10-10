import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigurado, supabaseKey, supabaseUrl } from "@/lib/supabase/config";

// Páginas sin cuenta: reporte por QR (/r), seguimiento del inquilino (/t),
// link del proveedor (/c), aprobación del dueño (/a) y su reporte mensual (/e). Se validan por token en el servidor.
const PREFIJOS_PUBLICOS = ["/login", "/auth/", "/r/", "/t/", "/c/", "/a/", "/e/"];

// Refresca la sesión en cada request y manda a /login a quien no la tenga.
export async function proxy(request: NextRequest) {
  if (!supabaseConfigurado) return NextResponse.next();
  const ruta = request.nextUrl.pathname;
  if (PREFIJOS_PUBLICOS.some((p) => ruta === p || ruta.startsWith(p))) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
