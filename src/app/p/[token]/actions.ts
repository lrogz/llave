"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, extension } from "@/lib/datos";
import { avisarEquipo } from "@/lib/push";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cobroPorToken, sesionDePago, sesionDomiciliar } from "@/lib/cobro";
import { stripe } from "@/lib/stripe";
import { origen } from "@/lib/util";

const MAX = 4 * 1024 * 1024; // límite de envío de Vercel; las fotos llegan ya reducidas
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

// El inquilino sube su comprobante desde el link (sin cuenta); se valida por token.
export async function subirComprobante(token: string, form: FormData): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, error: "Link no válido." };
  const archivo = form.get("comprobante");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elige la foto o PDF de tu comprobante." };
  if (!TIPOS.includes(archivo.type)) return { ok: false, error: "Sube una foto (JPG, PNG) o un PDF." };
  if (archivo.size > MAX) return { ok: false, error: "El archivo pesa más de 4 MB." };

  const admin = createAdminClient();
  const { data: cobro } = await admin.from("cobros_renta").select("id, organizacion_id, estado").eq("token", token).maybeSingle();
  if (!cobro) return { ok: false, error: "Link no válido." };
  if (!["pendiente", "vencido", "por_confirmar"].includes(cobro.estado)) return { ok: false, error: "Esta renta ya está registrada como pagada." };

  const path = `${cobro.organizacion_id}/comprobantes/${cobro.id}/${randomUUID()}.${extension(archivo.name, archivo.type)}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, archivo, { contentType: archivo.type });
  if (error) return { ok: false, error: "No pudimos subir el archivo. Intenta de nuevo." };

  await admin.from("cobros_renta").update({ comprobante_path: path, estado: "por_confirmar", nota: null }).eq("id", cobro.id);
  avisarEquipo(cobro.organizacion_id, { titulo: "Comprobante de pago recibido", cuerpo: "Un inquilino subió su comprobante. Revísalo para confirmar la renta.", url: "/pagos", tag: `cobro-${cobro.id}` });
  return { ok: true };
}

// ── Pago en línea con Stripe (cuenta de la administradora)
async function cobroListo(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) throw new Error("Link no válido.");
  const db = createAdminClient();
  const c = await cobroPorToken(db, token);
  if (!c || !c.organizaciones?.stripe_cuenta_id || !c.organizaciones.stripe_cuenta_lista) throw new Error("El pago en línea no está disponible.");
  return { db, c };
}

export async function pagarEnLinea(f: FormData) {
  const token = String(f.get("token") ?? "");
  const { db, c } = await cobroListo(token);
  if (!["pendiente", "vencido", "por_confirmar"].includes(c.estado)) redirect(`/p/${token}`);
  redirect(await sesionDePago(db, c, await origen()));
}

export async function domiciliarRenta(f: FormData) {
  const token = String(f.get("token") ?? "");
  const { db, c } = await cobroListo(token);
  redirect(await sesionDomiciliar(db, c, await origen()));
}

export async function quitarDomiciliacion(f: FormData) {
  const token = String(f.get("token") ?? "");
  const { db, c } = await cobroListo(token);
  const pm = c.contratos?.stripe_metodo_id;
  await db.from("contratos").update({ domiciliado: false, stripe_metodo_id: null, tarjeta_texto: null }).eq("id", c.contrato_id);
  if (pm) await stripe("POST", `/payment_methods/${pm}/detach`, {}, { cuenta: c.organizaciones!.stripe_cuenta_id }).catch(() => {});
  revalidatePath(`/p/${token}`);
}
