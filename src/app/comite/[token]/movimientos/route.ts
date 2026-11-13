import { createAdminClient } from "@/lib/supabase/admin";
import { csvMovimientos } from "@/lib/csv";
import { esToken, hoyCDMX } from "@/lib/condominios";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const mes = new URL(req.url).searchParams.get("mes") ?? hoyCDMX().slice(0, 7);
  if (!esToken(token) || !/^\d{4}-\d{2}$/.test(mes)) return new Response("No encontrado", { status: 404 });
  const { data, error } = await createAdminClient().rpc("comite_movimientos", { p_token: token, p_mes: `${mes}-01` });
  if (error) return new Response("Sin permiso", { status: 403 });
  return new Response(csvMovimientos(data ?? []), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="movimientos-${mes}.csv"`, "cache-control": "no-store" },
  });
}
