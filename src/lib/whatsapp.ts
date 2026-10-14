import "server-only";
import crypto from "node:crypto";
import { telefonoWhatsApp } from "./datos";

// WhatsApp Business (Cloud API de Meta), sin SDK: solo fetch.
// Variables: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET.
const API = () => process.env.WHATSAPP_URL || `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v21.0"}`;

export const whatsappConfigurado = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

// Plantillas que hay que dar de alta en Meta (categoría "Utilidad", idioma Español (MEX) = es_MX).
// El texto debe quedar idéntico; {{n}} son las variables en ese orden.
export const PLANTILLAS = {
  bk_aviso_renta: "Hola {{1}}, te escribimos de {{2}}. La renta de {{3}} por {{4}} vence el {{5}}. Aquí ves los datos para depositar y puedes subir tu comprobante: {{6}} ¡Gracias!",
  bk_renta_vencida: "Hola {{1}}, te escribimos de {{2}}. La renta de {{3}} por {{4}} venció el {{5}}. Si ya pagaste, sube tu comprobante aquí: {{6}} ¡Gracias!",
  bk_reporte_dueno: "Hola {{1}}, te escribimos de {{2}}. Ya está tu reporte de {{3}}: rentas, trabajos con fotos y tu saldo. Puedes verlo aquí: {{4}} Saludos.",
  bk_renovacion: "Hola {{1}}, te escribimos de {{2}}. Tu contrato de {{3}} termina el {{4}}. ¿Te gustaría renovar? Responde este mensaje y te compartimos las condiciones.",
  bk_cita: "Hola {{1}}, te escribimos de {{2}}. {{3}} irá a {{4}} el {{5}} para atender: {{6}}. Si no puedes recibirlo, responde este mensaje.",
  bk_cita_proveedor: "Hola {{1}}, tienes una visita de {{2}}: {{3}} en {{4}}, el {{5}}. Detalles, cómo llegar y botón de Llegué/Terminé: {{6}}",
  bk_servicio: "Hola {{1}}, te escribimos de {{2}}. El recibo de {{3}} de {{4}} vence el {{5}}. Te lo recordamos para que no se generen recargos.",
} as const;
export type NombrePlantilla = keyof typeof PLANTILLAS;
export type MensajeWA = { telefono: string; plantilla: NombrePlantilla; variables: string[] };

// Meta no acepta saltos de línea ni espacios repetidos dentro de una variable.
const limpia = (v: string) => v.replace(/\s+/g, " ").trim().slice(0, 500) || "-";

async function llamar(ruta: string, cuerpo: unknown) {
  const r = await fetch(`${API()}/${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const json = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!r.ok) throw new Error(json.error?.message ?? `WhatsApp respondió ${r.status}`);
  return json.messages?.[0]?.id ?? null;
}

export async function enviarPlantilla(m: MensajeWA) {
  return llamar(`${process.env.WHATSAPP_PHONE_ID}/messages`, {
    messaging_product: "whatsapp",
    to: telefonoWhatsApp(m.telefono),
    type: "template",
    template: {
      name: m.plantilla,
      language: { code: process.env.WHATSAPP_IDIOMA || "es_MX" },
      components: [{ type: "body", parameters: m.variables.map((v) => ({ type: "text", text: limpia(v) })) }],
    },
  });
}

// Texto libre: solo se puede dentro de las 24 h siguientes a que la persona nos escribió.
export async function enviarTexto(telefono: string, texto: string) {
  return llamar(`${process.env.WHATSAPP_PHONE_ID}/messages`, {
    messaging_product: "whatsapp",
    to: telefonoWhatsApp(telefono),
    type: "text",
    text: { body: texto.slice(0, 4000), preview_url: false },
  });
}

// Descarga una foto/video/audio que nos mandaron (Meta da primero una URL temporal).
export async function descargarMedia(id: string) {
  const auth = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  const info = (await (await fetch(`${API()}/${id}`, { headers: auth })).json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url) throw new Error("Meta no dio la URL del archivo");
  if ((info.file_size ?? 0) > 50 * 1024 * 1024) throw new Error("Archivo demasiado grande");
  const r = await fetch(info.url, { headers: auth });
  if (!r.ok) throw new Error(`No se pudo descargar (${r.status})`);
  return { datos: new Uint8Array(await r.arrayBuffer()), tipo: (info.mime_type ?? r.headers.get("content-type") ?? "application/octet-stream").split(";")[0] };
}

// Meta firma cada aviso con el App Secret (encabezado x-hub-signature-256).
export function firmaWhatsAppValida(cuerpo: string, firma: string | null) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto || !firma?.startsWith("sha256=")) return false;
  const esperada = crypto.createHmac("sha256", secreto).update(cuerpo).digest("hex");
  const a = Buffer.from(firma.slice(7), "hex");
  const b = Buffer.from(esperada, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Últimos 10 dígitos: así se comparan los teléfonos mexicanos sin importar el formato (+52, 521, espacios…).
export const diezDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-10);
export const telefonoValido = (t: string | null | undefined) => diezDigitos(t).length === 10;
