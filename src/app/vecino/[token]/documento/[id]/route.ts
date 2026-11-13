import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/datos";
import { esToken, esUuid } from "@/lib/condominios";

// Abre un documento visible para residentes con una liga firmada de 10 minutos.
export async function GET(_: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!esToken(token) || !esUuid(id)) return new Response("No encontrado", { status: 404 });
  const admin = createAdminClient();
  const { data: ruta } = await admin.rpc("vecino_documento", { p_token: token, p_documento: id });
  if (!ruta) return new Response("No encontrado", { status: 404 });
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(ruta as string, 600);
  if (!data?.signedUrl) return new Response("No disponible", { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
