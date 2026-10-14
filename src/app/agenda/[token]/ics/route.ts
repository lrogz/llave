import { ics } from "@/lib/citas";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) return new Response("No encontrado", { status: 404 });
  const { data } = await createAdminClient()
    .from("citas")
    .select("id, inicio, fin, estado, proveedores(nombre), propiedades(nombre, direccion, colonia), tickets(titulo), organizaciones(nombre)")
    .eq("token", token)
    .maybeSingle();
  const c = data as unknown as {
    id: string;
    inicio: string | null;
    fin: string | null;
    estado: string;
    proveedores: { nombre: string } | null;
    propiedades: { nombre: string; direccion: string | null; colonia: string | null } | null;
    tickets: { titulo: string } | null;
    organizaciones: { nombre: string } | null;
  } | null;
  if (!c?.inicio || !c.fin || c.estado !== "confirmada") return new Response("No encontrado", { status: 404 });
  const cuerpo = ics({
    id: c.id,
    inicio: c.inicio,
    fin: c.fin,
    titulo: `Visita: ${c.proveedores?.nombre ?? "proveedor"} (${c.tickets?.titulo ?? "reparación"})`,
    lugar: [c.propiedades?.direccion, c.propiedades?.colonia, "Querétaro"].filter(Boolean).join(", "),
    detalle: `${c.propiedades?.nombre ?? ""} · ${c.organizaciones?.nombre ?? ""}`,
  });
  return new Response(cuerpo, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="visita.ics"', "Cache-Control": "no-store" } });
}
