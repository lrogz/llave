import { createClient } from "@/lib/supabase/server";
import { csvIndicadores, type Indicadores } from "@/lib/csv";
import { esUuid } from "@/lib/condominios";
import { rangoIndicadores } from "@/lib/condominios-datos";

// Indicadores del piloto en CSV. La base valida que seas de la administradora.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) return new Response("No encontrado", { status: 404 });
  const u = new URL(req.url).searchParams;
  const r = rangoIndicadores(u.get("desde"), u.get("hasta"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("indicadores_piloto", { p_condominio: id, p_desde: r.desde, p_hasta: r.hasta });
  if (error || !data) return new Response("Sin permiso", { status: 403 });
  const d = data as { actual: Indicadores; anterior: Indicadores };
  return new Response(csvIndicadores(d.actual, d.anterior), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="indicadores-${r.dia_desde}-a-${r.dia_hasta}.csv"`, "cache-control": "no-store" },
  });
}
