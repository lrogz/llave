import { NextResponse, type NextRequest } from "next/server";
import { descargar } from "@/lib/facturapi";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// PDF o XML de una factura. Solo para miembros de la administradora (RLS en `facturas`).
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string; formato: string }> }) {
  const { id, formato } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (formato !== "pdf" && formato !== "xml")) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data: fac } = await supabase.from("facturas").select("facturapi_id, dueno_id, uuid").eq("id", id).maybeSingle();
  if (!fac) return new NextResponse(null, { status: 404 });
  const { data: llave } = await createAdminClient().from("facturacion_duenos").select("api_key").eq("dueno_id", fac.dueno_id).maybeSingle();
  if (!llave?.api_key) return new NextResponse(null, { status: 404 });
  try {
    const archivo = await descargar(llave.api_key, fac.facturapi_id, formato);
    return new NextResponse(archivo, {
      headers: {
        "Content-Type": formato === "pdf" ? "application/pdf" : "application/xml",
        "Content-Disposition": `inline; filename="factura-${fac.uuid ?? id}.${formato}"`,
      },
    });
  } catch {
    return new NextResponse("No se pudo descargar la factura.", { status: 502 });
  }
}
