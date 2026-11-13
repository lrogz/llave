import "server-only";
import { createAdminClient } from "./supabase/admin";

// Abre una puerta (pluma del portón o cuarto de paquetes) llamando al relevador del condominio por HTTPS.
// Funciona con relevadores con API en la nube (p. ej. Shelly Cloud, controladores de acceso con API) o un
// puente propio. Sin liga configurada, queda como simulación y se registra igual.
export async function abrirPuerta(o: { condominioId: string; url: string | null; auth: string | null; puerta: "pluma" | "paquetes"; motivo: string; actor: string }) {
  let resultado: "ok" | "error" | "simulado" = "simulado";
  if (o.url && /^https:\/\//.test(o.url)) {
    try {
      const r = await fetch(o.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(o.auth ? { authorization: o.auth } : {}) },
        body: JSON.stringify({ accion: "abrir", puerta: o.puerta, motivo: o.motivo.slice(0, 120) }),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
        cache: "no-store",
      });
      resultado = r.ok ? "ok" : "error";
    } catch {
      resultado = "error";
    }
  }
  await createAdminClient().rpc("registrar_apertura", { p_condominio: o.condominioId, p_puerta: o.puerta, p_motivo: o.motivo, p_actor: o.actor, p_resultado: resultado });
  return resultado;
}
