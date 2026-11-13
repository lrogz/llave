import { createAdminClient } from "@/lib/supabase/admin";
import { abrirPuerta } from "@/lib/relevador";
import { avisarEquipo, avisarVivienda } from "@/lib/push";

// Cámara de placas (LPR) → Black Key. La cámara o su software manda cada lectura:
//   POST /api/condominios/lpr   encabezado x-bk-token: <token del condominio>   cuerpo {"placa":"UAB123C","camara":"Entrada 1"}
// Respuesta {abrir, resultado}. Si abrir es true y hay relevador configurado, la pluma se abre desde aquí.
export async function POST(req: Request) {
  const token = req.headers.get("x-bk-token") ?? new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[A-Z0-9]{32}$/.test(token)) return Response.json({ error: "token" }, { status: 401 });
  let cuerpo: { placa?: string; plate?: string; camara?: string; camera?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ error: "json" }, { status: 400 });
  }
  const placa = String(cuerpo.placa ?? cuerpo.plate ?? "").slice(0, 20);
  const camara = String(cuerpo.camara ?? cuerpo.camera ?? "").slice(0, 60) || null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("lpr_evento", { p_token: token, p_placa: placa, p_camara: camara });
  if (error) return Response.json({ error: "token" }, { status: 401 });
  const r = data as { abrir: boolean; resultado: string; vivienda?: string; vivienda_id?: string; visitante?: string; motivo?: string };
  const { data: rel } = await admin.rpc("relevador_por_lpr", { p_token: token });
  const c = rel as { condominio_id: string; organizacion_id: string; url: string | null; auth: string | null };
  let apertura: string | null = null;
  if (r.abrir && r.resultado !== "repetido") {
    apertura = await abrirPuerta({ condominioId: c.condominio_id, url: c.url, auth: c.auth, puerta: "pluma", motivo: `Placa ${placa} (${r.resultado})`, actor: camara ?? "cámara de placas" });
    if (r.resultado === "visita" && r.vivienda_id) avisarVivienda(r.vivienda_id, (t) => ({ titulo: "Tu visita llegó", cuerpo: `${r.visitante ?? "Tu visita"} entró en auto.`, url: `/vecino/${t}/visitas`, tag: `visita-${placa}` }));
  }
  if (r.resultado === "vetado") avisarEquipo(c.organizacion_id, { titulo: "🚫 Placa vetada en la entrada", cuerpo: `${placa}: ${r.motivo ?? ""}`, url: `/condominios/${c.condominio_id}?vista=seguridad`, tag: `lpr-${placa}` });
  return Response.json({ ...r, apertura });
}
