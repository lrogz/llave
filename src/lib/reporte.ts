import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Reporte mensual del dueño: se arma en vivo con los datos del mes.

const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
export const mesTexto = (periodo: string) => nombreMes.format(new Date(`${periodo}T00:00:00Z`));

export function siguienteMes(periodo: string) {
  const [y, m] = periodo.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
export function mesAnterior(periodo: string) {
  const [y, m] = periodo.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
}
export const inicioDeMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

export type Foto = { path: string; tipo: string; momento: string };
export type Trabajo = {
  id: string;
  folio: number;
  titulo: string;
  estado: string;
  propiedad: string;
  resuelto_at: string | null;
  quien_paga: string | null;
  monto: number | null;
  proveedor: string | null;
  antes: Foto[];
  despues: Foto[];
};
export type Cobro = { propiedad: string; inquilino: string | null; monto: number; estado: string; vence: string; pagado_at: string | null };
export type Reporte = {
  dueno: { id: string; nombre: string; comision_pct: number | null };
  periodo: string;
  propiedades: { id: string; nombre: string; estado: string; renta_mensual: number | null }[];
  cobros: Cobro[];
  resueltos: Trabajo[];
  enCurso: Trabajo[];
  aprobacionesPendientes: { token: string; titulo: string; monto: number | null }[];
  totales: { rentaEsperada: number; rentaCobrada: number; comision: number; gastos: number; saldo: number };
};

type TicketFila = {
  id: string;
  folio: number;
  titulo: string;
  estado: string;
  resuelto_at: string | null;
  quien_paga: string | null;
  propiedad_id: string;
  ticket_media: { storage_path: string; tipo: string; momento: string }[];
  cotizaciones: { monto: number | null; estado: string; proveedores: { nombre: string } | null }[];
};

export async function armarReporte(db: SupabaseClient, duenoId: string, periodo: string): Promise<Reporte | null> {
  const { data: dueno } = await db.from("duenos").select("id, nombre, comision_pct").eq("id", duenoId).maybeSingle();
  if (!dueno) return null;
  const fin = siguienteMes(periodo);

  const { data: props } = await db.from("propiedades").select("id, nombre, estado, renta_mensual").eq("dueno_id", duenoId).order("nombre");
  const propiedades = props ?? [];
  const ids = propiedades.map((p) => p.id as string);
  const nombre = new Map(propiedades.map((p) => [p.id as string, p.nombre as string]));

  if (!ids.length) {
    return {
      dueno,
      periodo,
      propiedades: [],
      cobros: [],
      resueltos: [],
      enCurso: [],
      aprobacionesPendientes: [],
      totales: { rentaEsperada: 0, rentaCobrada: 0, comision: 0, gastos: 0, saldo: 0 },
    };
  }

  const [cobrosQ, resueltosQ, abiertosQ, aprobQ] = await Promise.all([
    db
      .from("cobros_renta")
      .select("monto, recargo, estado, vence, pagado_at, contratos!inner(propiedad_id, inquilinos(nombre))")
      .in("contratos.propiedad_id", ids)
      .gte("periodo", periodo)
      .lt("periodo", fin),
    db
      .from("tickets")
      .select("id, folio, titulo, estado, resuelto_at, quien_paga, propiedad_id, ticket_media(storage_path, tipo, momento), cotizaciones(monto, estado, proveedores(nombre))")
      .in("propiedad_id", ids)
      .eq("estado", "resuelto")
      .gte("resuelto_at", `${periodo}T06:00:00Z`)
      .lt("resuelto_at", `${fin}T06:00:00Z`)
      .order("resuelto_at"),
    db
      .from("tickets")
      .select("id, folio, titulo, estado, resuelto_at, quien_paga, propiedad_id, ticket_media(storage_path, tipo, momento), cotizaciones(monto, estado, proveedores(nombre))")
      .in("propiedad_id", ids)
      .not("estado", "in", "(resuelto,cancelado)")
      .order("created_at"),
    db.from("aprobaciones").select("token, cotizaciones(monto, tickets(titulo))").eq("dueno_id", duenoId).is("decision", null),
  ]);

  const trabajo = (t: TicketFila): Trabajo => {
    const elegida = t.cotizaciones.find((c) => c.estado === "aprobada");
    return {
      id: t.id,
      folio: t.folio,
      titulo: t.titulo,
      estado: t.estado,
      propiedad: nombre.get(t.propiedad_id) ?? "",
      resuelto_at: t.resuelto_at,
      quien_paga: t.quien_paga,
      monto: elegida?.monto ?? null,
      proveedor: elegida?.proveedores?.nombre ?? null,
      antes: t.ticket_media.filter((m) => m.momento !== "despues" && m.tipo === "foto").slice(0, 2).map((m) => ({ path: m.storage_path, tipo: m.tipo, momento: m.momento })),
      despues: t.ticket_media.filter((m) => m.momento === "despues").slice(0, 2).map((m) => ({ path: m.storage_path, tipo: m.tipo, momento: m.momento })),
    };
  };

  const cobros: Cobro[] = ((cobrosQ.data ?? []) as unknown as {
    monto: number;
    recargo: number;
    estado: string;
    vence: string;
    pagado_at: string | null;
    contratos: { propiedad_id: string; inquilinos: { nombre: string } | null };
  }[]).map((c) => ({
    propiedad: nombre.get(c.contratos.propiedad_id) ?? "",
    inquilino: c.contratos.inquilinos?.nombre ?? null,
    monto: Number(c.monto) + Number(c.recargo ?? 0),
    estado: c.estado,
    vence: c.vence,
    pagado_at: c.pagado_at,
  }));

  const resueltos = ((resueltosQ.data ?? []) as unknown as TicketFila[]).map(trabajo);
  const enCurso = ((abiertosQ.data ?? []) as unknown as TicketFila[]).map(trabajo);
  const rentaEsperada = cobros.reduce((s, c) => s + c.monto, 0);
  const rentaCobrada = cobros.filter((c) => c.estado === "pagado").reduce((s, c) => s + c.monto, 0);
  const comision = Math.round(rentaCobrada * Number(dueno.comision_pct ?? 0)) / 100;
  const gastos = resueltos.filter((t) => t.quien_paga === "dueno").reduce((s, t) => s + Number(t.monto ?? 0), 0);

  return {
    dueno,
    periodo,
    propiedades: propiedades as Reporte["propiedades"],
    cobros,
    resueltos,
    enCurso,
    aprobacionesPendientes: ((aprobQ.data ?? []) as unknown as { token: string; cotizaciones: { monto: number | null; tickets: { titulo: string } | null } | null }[]).map((a) => ({
      token: a.token,
      titulo: a.cotizaciones?.tickets?.titulo ?? "Cotización",
      monto: a.cotizaciones?.monto ?? null,
    })),
    totales: { rentaEsperada, rentaCobrada, comision, gastos, saldo: rentaCobrada - comision - gastos },
  };
}
