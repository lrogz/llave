import { NextResponse, type NextRequest } from "next/server";
import { procesarMensaje, type MensajeEntrante } from "@/lib/bot";
import { createAdminClient } from "@/lib/supabase/admin";
import { firmaWhatsAppValida } from "@/lib/whatsapp";

export const maxDuration = 60;

// Meta verifica el webhook una vez (Configuración › Webhooks) con el token que tú elijas.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Token no válido", { status: 403 });
}

type Cuerpo = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: {
          id: string;
          from: string;
          type: string;
          text?: { body?: string };
          image?: { id: string; mime_type?: string; caption?: string };
          video?: { id: string; mime_type?: string; caption?: string };
          audio?: { id: string; mime_type?: string };
          document?: { id: string; mime_type?: string; caption?: string };
        }[];
      };
    }[];
  }[];
};

// Mensajes que llegan al número de WhatsApp: cada uno crea o completa un reporte.
export async function POST(req: NextRequest) {
  const crudo = await req.text();
  if (!firmaWhatsAppValida(crudo, req.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Firma no válida" }, { status: 401 });

  let cuerpo: Cuerpo;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ error: "JSON no válido" }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const db = createAdminClient();
  const resultados: string[] = [];
  for (const entrada of cuerpo.entry ?? []) {
    for (const cambio of entrada.changes ?? []) {
      const v = cambio.value;
      for (const m of v?.messages ?? []) {
        const media = m.image ?? m.video ?? m.audio ?? m.document;
        const mensaje: MensajeEntrante = {
          id: m.id,
          de: m.from,
          nombre: v?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name,
          tipo: m.type,
          texto: m.text?.body ?? m.image?.caption ?? m.video?.caption ?? m.document?.caption,
          media: media ? { id: media.id, mime: media.mime_type } : undefined,
        };
        try {
          resultados.push((await procesarMensaje(db, mensaje, base)).estado);
        } catch (e) {
          console.error("[whatsapp]", e);
          resultados.push("error");
        }
      }
    }
  }
  // Siempre 200 (salvo firma): si no, Meta reintenta y desactiva el webhook.
  return NextResponse.json({ ok: true, resultados });
}
