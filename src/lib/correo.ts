import "server-only";

// Envío de correos con Resend (https://resend.com). Variables:
//   RESEND_API_KEY  llave de Resend (secreta)
//   AVISOS_REMITENTE  p. ej. "Black Key <avisos@tudominio.mx>" (dominio verificado en Resend)
export type Correo = { para: string; asunto: string; html: string; responderA?: string | null };

export const correoConfigurado = () => Boolean(process.env.RESEND_API_KEY && process.env.AVISOS_REMITENTE);

// Manda hasta 100 por llamada (lote). Devuelve cuántos salieron.
export async function enviarCorreos(correos: Correo[]): Promise<{ enviados: number; error?: string }> {
  if (!correos.length) return { enviados: 0 };
  if (!correoConfigurado()) return { enviados: 0, error: "Falta RESEND_API_KEY o AVISOS_REMITENTE" };
  const url = (process.env.RESEND_URL ?? "https://api.resend.com") + "/emails/batch";
  let enviados = 0;
  for (let i = 0; i < correos.length; i += 100) {
    const lote = correos.slice(i, i + 100).map((c) => ({
      from: process.env.AVISOS_REMITENTE,
      to: [c.para],
      subject: c.asunto,
      html: c.html,
      ...(c.responderA ? { reply_to: c.responderA } : {}),
    }));
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(lote),
    });
    if (!r.ok) return { enviados, error: `Resend respondió ${r.status}: ${(await r.text()).slice(0, 200)}` };
    enviados += lote.length;
  }
  return { enviados };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Plantilla sencilla que se ve bien en Gmail, Outlook y el celular.
export function plantilla({ org, titulo, parrafos, boton, pie }: { org: string; titulo: string; parrafos: string[]; boton?: { texto: string; url: string }; pie?: string }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F1F3F1;font-family:Arial,Helvetica,sans-serif;color:#14201C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F3F1;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td style="font-size:13px;color:#5B6B65;padding-bottom:6px">${esc(org)}</td></tr>
<tr><td style="font-size:22px;font-weight:bold;line-height:1.3;padding-bottom:14px">${esc(titulo)}</td></tr>
${parrafos.map((p) => `<tr><td style="font-size:15px;line-height:1.55;padding-bottom:10px">${esc(p)}</td></tr>`).join("")}
${boton ? `<tr><td style="padding:12px 0 6px"><a href="${esc(boton.url)}" style="display:inline-block;background:#0E6B55;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 20px;border-radius:12px">${esc(boton.texto)}</a></td></tr>` : ""}
<tr><td style="font-size:12px;color:#8A9993;padding-top:18px;border-top:1px solid #E6EAE8">${esc(pie ?? "Si tienes dudas, responde a este correo.")} · Enviado con Black Key</td></tr>
</table></td></tr></table></body></html>`;
}
