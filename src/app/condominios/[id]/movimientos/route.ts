import { createClient } from "@/lib/supabase/server";
import { csvMovimientos } from "@/lib/csv";
import { esUuid, hoyCDMX } from "@/lib/condominios";

// Exporta cargos, pagos confirmados, ajustes y gastos del mes. La base valida que seas de la administradora.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mes = new URL(req.url).searchParams.get("mes") ?? hoyCDMX().slice(0, 7);
  if (!esUuid(id) || !/^\d{4}-\d{2}$/.test(mes)) return new Response("No encontrado", { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("exportar_movimientos", { p_condominio: id, p_mes: `${mes}-01` });
  if (error) return new Response("Sin permiso", { status: 403 });
  return new Response(csvMovimientos(data ?? []), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="movimientos-${mes}.csv"`, "cache-control": "no-store" },
  });
}
