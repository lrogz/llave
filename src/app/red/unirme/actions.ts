"use server";

import { redirect } from "next/navigation";
import { valido } from "@/lib/avisos";
import { correoConfigurado, enviarCorreos, plantilla } from "@/lib/correo";
import { CATEGORIAS } from "@/lib/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { origen } from "@/lib/util";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const VALIDAS = new Set<string>(CATEGORIAS.map(([v]) => v));

// Un proveedor pide entrar a la red de Black Key. Queda "en revisión" y lo mandamos a su portal.
export async function solicitarRed(_: unknown, f: FormData): Promise<{ ok: boolean; mensaje: string; valores?: Record<string, string> }> {
  const valores = Object.fromEntries(["nombre", "contacto", "telefono", "email", "zonas", "descripcion", "experiencia", "precio_desde"].map((k) => [k, txt(f, k, 1000)]));
  valores.especialidades = f.getAll("especialidades").map(String).join(",");
  if (txt(f, "empresa")) return { ok: true, mensaje: "¡Gracias!" }; // trampa para bots
  const nombre = txt(f, "nombre", 120);
  const telefono = txt(f, "telefono", 30);
  const email = txt(f, "email", 160).toLowerCase();
  const especialidades = f.getAll("especialidades").map(String).filter((x) => VALIDAS.has(x)).slice(0, 8);
  if (!nombre || telefono.replace(/\D/g, "").length < 10) return { ok: false, mensaje: "Escribe tu nombre o el de tu negocio y un celular de 10 dígitos.", valores };
  if (!especialidades.length) return { ok: false, mensaje: "Elige al menos un servicio.", valores };
  if (email && !valido(email)) return { ok: false, mensaje: "Revisa tu correo.", valores };
  if (f.get("acepto") !== "on") return { ok: false, mensaje: "Acepta los términos y el aviso de privacidad para continuar.", valores };

  const admin = createAdminClient();
  const digitos = telefono.replace(/\D/g, "").slice(-10);
  const { data: previo } = await admin.from("proveedores").select("id, telefono").not("estado_red", "is", null).ilike("telefono", `%${digitos.slice(-4)}%`);
  if ((previo ?? []).some((p) => (p.telefono ?? "").replace(/\D/g, "").endsWith(digitos))) return { ok: false, mensaje: "Ya hay una solicitud con ese celular. Usa el link que te dimos o escríbenos.", valores };

  const experiencia = Number(txt(f, "experiencia", 3));
  const precio = Number(txt(f, "precio_desde", 20).replace(/[^0-9.]/g, ""));
  const { data, error } = await admin
    .from("proveedores")
    .insert({
      organizacion_id: null,
      es_red: false,
      estado_red: "solicitud",
      nombre,
      contacto: txt(f, "contacto", 120) || null,
      telefono,
      email: email || null,
      especialidades,
      zonas: txt(f, "zonas", 300).split(",").map((z) => z.trim()).filter(Boolean).slice(0, 15),
      descripcion: txt(f, "descripcion", 1000) || null,
      experiencia_anios: experiencia >= 0 && experiencia <= 80 ? experiencia : null,
      precio_desde: precio > 0 ? precio : null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, mensaje: "No pudimos guardar tu solicitud. Intenta de nuevo.", valores };
  const { data: portal } = await admin.from("proveedor_portal").select("token").eq("proveedor_id", data.id).single();

  const revisoras = (process.env.PLATAFORMA_ADMINS ?? "").split(",").map((x) => x.trim()).filter(valido);
  if (correoConfigurado() && revisoras.length) {
    const base = await origen();
    await enviarCorreos(
      revisoras.map((para) => ({
        para,
        asunto: `Nueva solicitud a la red: ${nombre}`,
        html: plantilla({ org: "Black Key", titulo: `${nombre} quiere entrar a la red`, parrafos: [`Servicios: ${especialidades.join(", ")}`, `Celular: ${telefono}`], boton: { texto: "Revisar solicitudes", url: `${base}/red/admin` } }),
      })),
    ).catch(() => {});
  }
  redirect(`/pro/${portal!.token}?nuevo=1`);
}
