import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaCita } from "./agenda";
import { primerNombre } from "./crm";
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

// Le avisa por WhatsApp al proveedor de una cita nueva, con el link a su portal.
// `db` es el cliente admin: el link del portal es privado del proveedor.
export async function avisarProveedor(db: SupabaseClient, citaId: string, base: string) {
  if (!whatsappConfigurado()) return false;
  const { data } = await db
    .from("citas")
    .select("id, inicio, proveedor_id, organizaciones(nombre), proveedores(nombre, telefono), propiedades(nombre, colonia), tickets(titulo)")
    .eq("id", citaId)
    .maybeSingle();
  const c = data as unknown as CitaAviso | null;
  if (!c?.inicio || !telefonoValido(c.proveedores?.telefono)) return false;
  const { data: portal } = await db.from("proveedor_portal").select("token").eq("proveedor_id", c.proveedor_id).maybeSingle();
  try {
    await enviarPlantilla({
      telefono: c.proveedores!.telefono!,
      plantilla: "bk_cita_proveedor",
      variables: [
        primerNombre(c.proveedores!.nombre),
        c.organizaciones?.nombre ?? "Black Key",
        c.tickets?.titulo ?? "visita",
        [c.propiedades?.nombre, c.propiedades?.colonia].filter(Boolean).join(", "),
        fechaCita(c.inicio),
        portal ? `${base}/pro/${portal.token}` : base,
      ],
    });
    return true;
  } catch {
    return false;
  }
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
