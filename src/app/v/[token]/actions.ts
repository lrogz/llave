"use server";

import { valido } from "@/lib/avisos";
import { correoConfigurado, enviarCorreos, plantilla } from "@/lib/correo";
import { formatoFecha } from "@/lib/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { origen } from "@/lib/util";
import { anuncioPorToken } from "./datos";
import { avisarEquipo } from "@/lib/push";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

// "Me interesa": guarda al prospecto y avisa a la administradora por correo.
export async function meInteresa(_: unknown, f: FormData): Promise<{ ok: boolean; mensaje: string; valores?: Record<string, string> }> {
  if (txt(f, "empresa")) return { ok: true, mensaje: "¡Gracias!" }; // campo trampa para bots
  const p = await anuncioPorToken(txt(f, "token", 40));
  if (!p) return { ok: false, mensaje: "Este anuncio ya no está disponible." };
  const nombre = txt(f, "nombre", 120);
  const telefono = txt(f, "telefono", 30);
  const email = txt(f, "email", 160).toLowerCase();
  const mudanza = txt(f, "mudanza", 10);
  // Si algo falta, regresamos lo escrito para no hacerle escribir todo otra vez.
  const valores = { nombre, telefono, email, mudanza, mensaje: txt(f, "mensaje", 1000) };
  if (!nombre || telefono.replace(/\D/g, "").length < 10) return { ok: false, mensaje: "Escribe tu nombre y un celular de 10 dígitos.", valores };
  if (email && !valido(email)) return { ok: false, mensaje: "Revisa tu correo.", valores };

  const admin = createAdminClient();
  // Freno simple: máximo 3 solicitudes del mismo teléfono por anuncio al día.
  const { count } = await admin
    .from("prospectos")
    .select("id", { count: "exact", head: true })
    .eq("propiedad_id", p.id)
    .eq("telefono", telefono)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= 3) return { ok: true, mensaje: "Ya tenemos tus datos; te contactaremos pronto." };

  const { error } = await admin.from("prospectos").insert({
    organizacion_id: p.organizacion_id,
    propiedad_id: p.id,
    nombre,
    telefono,
    email: email || null,
    mensaje: txt(f, "mensaje", 1000) || null,
    mudanza: /^\d{4}-\d{2}-\d{2}$/.test(mudanza) ? mudanza : null,
  });
  if (error) return { ok: false, mensaje: "No pudimos enviar tus datos. Intenta de nuevo." };

  if (correoConfigurado()) {
    const { data: o } = await admin.from("organizaciones").select("nombre, avisos, miembros(email, rol)").eq("id", p.organizacion_id).single();
    const config = (o?.avisos ?? {}) as { correo?: string };
    const para = valido(config.correo)
      ? [config.correo]
      : ((o?.miembros ?? []) as { email: string | null; rol: string }[]).filter((m) => (m.rol === "propietario" || m.rol === "admin") && valido(m.email)).map((m) => m.email!);
    const base = await origen();
    await enviarCorreos(
      para.map((correo) => ({
        para: correo,
        asunto: `Nuevo interesado en ${p.nombre}: ${nombre}`,
        responderA: email || null,
        html: plantilla({
          org: o?.nombre ?? "",
          titulo: `${nombre} quiere informes de ${p.nombre}`,
          parrafos: [`Celular: ${telefono}${email ? ` · Correo: ${email}` : ""}`, mudanza ? `Se quiere mudar el ${formatoFecha(mudanza)}.` : "", txt(f, "mensaje", 1000) ? `“${txt(f, "mensaje", 1000)}”` : ""].filter(Boolean),
          boton: { texto: "Ver prospectos", url: `${base}/propiedades/${p.id}/anuncio` },
        }),
      })),
    ).catch(() => {});
  }
  avisarEquipo(p.organizacion_id, { titulo: `Nuevo interesado en ${p.nombre}`, cuerpo: `${nombre} quiere rentar. Contáctalo pronto.`, url: `/propiedades/${p.id}/anuncio`, tag: `prospecto-${p.id}` });
  return { ok: true, mensaje: "¡Listo! Recibimos tus datos y te contactaremos pronto." };
}
