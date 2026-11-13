"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarVivienda } from "@/lib/push";
import { BUCKET } from "@/lib/datos";
import { esUuid, mensajeError } from "@/lib/condominios";

export type EstadoTimbre = { error?: string } | null;
const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

// La visita toca el timbre: se avisa a la vivienda y la visita espera la respuesta en su pantalla.
export async function tocarTimbre(_: EstadoTimbre, f: FormData): Promise<EstadoTimbre> {
  const token = txt(f, "token", 40);
  const vivienda = txt(f, "vivienda_id", 40);
  if (!/^[A-Z0-9]{12,40}$/.test(token)) return { error: "Link no válido." };
  if (!esUuid(vivienda)) return { error: "Elige la vivienda." };
  const admin = createAdminClient();
  const { data: c, error: e1 } = await admin.rpc("timbre_datos", { p_token: token });
  if (e1 || !c) return { error: mensajeError(e1) };
  const cond = c as { condominio_id: string; organizacion_id: string; condominio: string };
  let foto: string | null = null;
  const archivo = f.get("foto");
  if (archivo instanceof File && archivo.size > 0 && archivo.type.startsWith("image/") && archivo.size < 2 * 1024 * 1024) {
    foto = `${cond.organizacion_id}/condominios/${cond.condominio_id}/timbre/${randomUUID()}.jpg`;
    if ((await admin.storage.from(BUCKET).upload(foto, archivo, { contentType: archivo.type })).error) foto = null;
  }
  const visitante = txt(f, "visitante", 120);
  const { data, error } = await admin.rpc("timbre_llamar", { p_token: token, p_vivienda: vivienda, p_visitante: visitante, p_motivo: txt(f, "motivo", 120), p_foto: foto });
  if (error || !data) return { error: mensajeError(error, "No pudimos avisar. Habla con caseta.") };
  avisarVivienda(vivienda, (t) => ({ titulo: "🔔 Tocan el timbre", cuerpo: `${visitante} está en la entrada de ${cond.condominio}. ¿Lo dejas pasar?`, url: `/vecino/${t}`, tag: `timbre-${vivienda}` }));
  redirect(`/timbre/estado/${(data as { token: string }).token}`);
}
