import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaCita } from "./agenda";
import { primerNombre } from "./crm";
import { avisarProveedorPush, enviarAProveedor, pushConfigurado } from "./push";
import { enviarPlantilla, telefonoValido, whatsappConfigurado } from "./whatsapp";

type CitaAviso = {
  id: string;
  inicio: string;
  proveedor_id: string;
  organizaciones: { nombre: string } | null;
  proveedores: { nombre: string; telefono: string | null } | null;
  propiedades: { nombre: string; colonia: string | null } | null;
  tickets: { titulo: string } | null;
};

// Le avisa al proveedor de una cita nueva: notificación en su portal instalado y WhatsApp con el link.
// `db` es el cliente admin: el link del portal es privado del proveedor.
export async function avisarProveedor(db: SupabaseClient, citaId: string, base: string): Promise<{ wa: boolean; push: boolean }> {
  const { data } = await db
    .from("citas")
    .select("id, inicio, proveedor_id, organizaciones(nombre), proveedores(nombre, telefono), propiedades(nombre, colonia), tickets(titulo)")
    .eq("id", citaId)
    .maybeSingle();
  const c = data as unknown as CitaAviso | null;
  if (!c?.inicio) return { wa: false, push: false };
  const { data: portal } = await db.from("proveedor_portal").select("token").eq("proveedor_id", c.proveedor_id).maybeSingle();
  const lugar = [c.propiedades?.nombre, c.propiedades?.colonia].filter(Boolean).join(", ");
  const push =
    (await enviarAProveedor(c.proveedor_id, {
      titulo: "Nueva visita agendada",
      cuerpo: `${fechaCita(c.inicio)} · ${c.tickets?.titulo ?? "visita"} en ${lugar} (${c.organizaciones?.nombre ?? ""})`,
      url: portal ? `/pro/${portal.token}` : "/",
      tag: `cita-${c.id}`,
    })) > 0;
  let wa = false;
  if (whatsappConfigurado() && telefonoValido(c.proveedores?.telefono)) {
    try {
      await enviarPlantilla({
        telefono: c.proveedores!.telefono!,
        plantilla: "bk_cita_proveedor",
        variables: [primerNombre(c.proveedores!.nombre), c.organizaciones?.nombre ?? "Black Key", c.tickets?.titulo ?? "visita", lugar, fechaCita(c.inicio), portal ? `${base}/pro/${portal.token}` : base],
      });
      wa = true;
    } catch {
      wa = false;
    }
  }
  return { wa, push };
}

// Evento de calendario (.ics) para que el inquilino o el proveedor lo guarden.
export function ics({ id, inicio, fin, titulo, lugar, detalle }: { id: string; inicio: string; fin: string; titulo: string; lugar: string; detalle: string }) {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Black Key//Agenda//ES",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${id}@blackkey`,
    `DTSTAMP:${f(new Date().toISOString())}`,
    `DTSTART:${f(inicio)}`,
    `DTEND:${f(fin)}`,
    `SUMMARY:${esc(titulo)}`,
    `LOCATION:${esc(lugar)}`,
    `DESCRIPTION:${esc(detalle)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(titulo)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

// Al proveedor: le aprobaron su cotización (desde el dueño o la administradora).
export async function avisarAprobado(db: SupabaseClient, cotizacionId: string) {
  if (!pushConfigurado()) return;
  const { data } = await db.from("cotizaciones").select("proveedor_id, monto, tickets(titulo), organizaciones(nombre)").eq("id", cotizacionId).maybeSingle();
  const c = data as unknown as { proveedor_id: string; monto: number | null; tickets: { titulo: string } | null; organizaciones: { nombre: string } | null } | null;
  if (!c) return;
  const { data: portal } = await db.from("proveedor_portal").select("token").eq("proveedor_id", c.proveedor_id).maybeSingle();
  avisarProveedorPush(c.proveedor_id, {
    titulo: "¡Te aprobaron el trabajo! ✓",
    cuerpo: `${c.organizaciones?.nombre ?? "La administradora"}: ${c.tickets?.titulo ?? "trabajo"}${c.monto != null ? ` por $${Number(c.monto).toLocaleString("es-MX")}` : ""}. Te contactarán para agendar.`,
    url: portal ? `/pro/${portal.token}` : "/",
  });
}
