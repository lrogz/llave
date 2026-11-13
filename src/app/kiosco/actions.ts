"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { abrirPuerta } from "@/lib/relevador";
import { avisarVivienda } from "@/lib/push";

// Tablet del cuarto de paquetes: el repartidor teclea el PIN que le dio el residente.
export async function usarPinKiosco(token: string, pin: string, paqueteria: string) {
  if (!/^[A-Z0-9]{24}$/.test(token) || !/^\d{6}$/.test(pin)) return { ok: false, motivo: "pin_invalido" };
  const admin = createAdminClient();
  const { data: k } = await admin.rpc("kiosco_datos", { p_token: token });
  if (!k) return { ok: false, motivo: "link_invalido" };
  const c = k as { condominio_id: string; condominio: string; url: string | null; auth: string | null };
  const { data, error } = await admin.rpc("usar_pin_entrega", { p_condominio: c.condominio_id, p_pin: pin, p_guardia: null, p_paqueteria: paqueteria.slice(0, 60) });
  if (error || !data) return { ok: false, motivo: "error" };
  const r = data as { ok: boolean; motivo: string; vivienda?: string; vivienda_id?: string };
  if (!r.ok) return r;
  const apertura = await abrirPuerta({ condominioId: c.condominio_id, url: c.url, auth: c.auth, puerta: "paquetes", motivo: `Entrega con PIN para ${r.vivienda}`, actor: "cuarto de paquetes" });
  avisarVivienda(r.vivienda_id!, (t) => ({ titulo: "📦 Llegó tu paquete", cuerpo: `Quedó en el cuarto de paquetes de ${c.condominio}.`, url: `/vecino/${t}/paquetes`, tag: `paq-${pin}` }));
  return { ...r, apertura };
}
