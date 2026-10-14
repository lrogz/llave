import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyMX } from "./crm";
import { inicioDeMes, mesAnterior, siguienteMes } from "./reporte";

// Indicadores de los últimos 12 meses (incluye el mes actual), calculados en vivo.

const DIA = 86_400_000;
const t = (f: string) => Date.parse(`${f}T00:00:00Z`);
const dias = (a: string, b: string) => Math.round((t(b) - t(a)) / DIA) + 1; // inclusivo
const max = (a: string, b: string) => (a > b ? a : b);
const min = (a: string, b: string) => (a < b ? a : b);

export type FilaPropiedad = {
  id: string;
  nombre: string;
  dueno: string | null;
  rentada: boolean;
  renta: number | null;
  diasPeriodo: number;
  diasOcupada: number;
  ocupacion: number; // 0-1
  vaciaDesde: string | null; // si hoy está vacía
  diasVaciaHoy: number | null;
  ingresos: number;
  mantenimiento: number;
  cargos: number;
  neto: number;
  perdidoVacancia: number;
  tickets: number;
};
export type Mes = { periodo: string; esperado: number; cobrado: number };
export type Indicadores = {
  desde: string;
  hasta: string;
  propiedades: FilaPropiedad[];
  meses: Mes[];
  ocupacionHoy: number;
  ocupacion12m: number;
  vencido: number;
  inquilinosAtrasados: number;
  pagoPuntual: number | null; // 0-1
  atrasoPromedio: number | null; // días
  ingresos: number;
  neto: number;
  perdidoVacancia: number;
};

type Contrato = { propiedad_id: string; inquilino_id: string; inicio: string; fin: string; activo: boolean };

export async function calcularIndicadores(db: SupabaseClient, opciones: { duenoId?: string } = {}): Promise<Indicadores> {
  const hoy = hoyMX();
  let desde = inicioDeMes(hoy);
  for (let i = 0; i < 11; i++) desde = mesAnterior(desde);

  let qp = db.from("propiedades").select("id, nombre, renta_mensual, created_at, dueno_id, duenos(nombre)").order("nombre");
  if (opciones.duenoId) qp = qp.eq("dueno_id", opciones.duenoId);
  const { data: ps } = await qp;
  const props = (ps ?? []) as unknown as { id: string; nombre: string; renta_mensual: number | null; created_at: string; dueno_id: string | null; duenos: { nombre: string } | null }[];
  const ids = props.map((p) => p.id);
  const vacio: Indicadores = { desde, hasta: hoy, propiedades: [], meses: [], ocupacionHoy: 0, ocupacion12m: 0, vencido: 0, inquilinosAtrasados: 0, pagoPuntual: null, atrasoPromedio: null, ingresos: 0, neto: 0, perdidoVacancia: 0 };
  if (!ids.length) return vacio;

  const [cQ, cobQ, tkQ, movQ] = await Promise.all([
    db.from("contratos").select("propiedad_id, inquilino_id, inicio, fin, activo").in("propiedad_id", ids),
    db.from("cobros_renta").select("monto, recargo, estado, vence, pagado_at, periodo, contratos!inner(propiedad_id, inquilino_id)").in("contratos.propiedad_id", ids).gte("periodo", desde),
    db.from("tickets").select("propiedad_id, estado, quien_paga, resuelto_at, created_at, cotizaciones(monto, estado)").in("propiedad_id", ids).gte("created_at", `${desde}T06:00:00Z`),
    db.from("movimientos_dueno").select("propiedad_id, tipo, monto").in("propiedad_id", ids).gte("periodo", desde),
  ]);
  const contratos = (cQ.data ?? []) as Contrato[];
  const cobros = (cobQ.data ?? []) as unknown as { monto: number; recargo: number; estado: string; vence: string; pagado_at: string | null; periodo: string; contratos: { propiedad_id: string; inquilino_id: string } }[];
  const tickets = (tkQ.data ?? []) as unknown as { propiedad_id: string; estado: string; quien_paga: string | null; resuelto_at: string | null; cotizaciones: { monto: number | null; estado: string }[] }[];
  const movs = (movQ.error ? [] : (movQ.data ?? [])) as { propiedad_id: string; tipo: string; monto: number }[];

  const monto = (c: { monto: number; recargo: number }) => Number(c.monto) + Number(c.recargo ?? 0);
  const filas: FilaPropiedad[] = props.map((p) => {
    const inicio = max(desde, p.created_at.slice(0, 10));
    const diasPeriodo = Math.max(1, dias(inicio, hoy));
    // Días ocupados = unión de los rangos de contrato dentro del periodo.
    const rangos = contratos
      .filter((c) => c.propiedad_id === p.id)
      .map((c) => [max(c.inicio, inicio), min(c.activo ? max(c.fin, hoy) : c.fin, hoy)] as const)
      .filter(([a, b]) => a <= b)
      .sort((a, b) => a[0].localeCompare(b[0]));
    let ocupados = 0;
    let fin = "";
    for (const [a, b] of rangos) {
      const desdeR = fin && a <= fin ? new Date(t(fin) + DIA).toISOString().slice(0, 10) : a;
      if (desdeR <= b) ocupados += dias(desdeR, b);
      if (b > fin) fin = b;
    }
    const activos = contratos.filter((c) => c.propiedad_id === p.id && c.activo);
    const rentada = activos.length > 0;
    const ultimoFin = contratos.filter((c) => c.propiedad_id === p.id && !c.activo).map((c) => c.fin).sort().pop();
    const vaciaDesde = rentada ? null : max(ultimoFin ?? p.created_at.slice(0, 10), p.created_at.slice(0, 10));
    const propios = cobros.filter((c) => c.contratos.propiedad_id === p.id);
    const ingresos = propios.filter((c) => c.estado === "pagado").reduce((s, c) => s + monto(c), 0);
    const mantenimiento = tickets
      .filter((x) => x.propiedad_id === p.id && x.estado === "resuelto" && x.quien_paga === "dueno")
      .reduce((s, x) => s + Number(x.cotizaciones.find((c) => c.estado === "aprobada")?.monto ?? 0), 0);
    const cargos = movs.filter((m) => m.propiedad_id === p.id).reduce((s, m) => s + (m.tipo === "cargo" ? Number(m.monto) : -Number(m.monto)), 0);
    const diasVacia = diasPeriodo - ocupados;
    return {
      id: p.id,
      nombre: p.nombre,
      dueno: p.duenos?.nombre ?? null,
      rentada,
      renta: p.renta_mensual != null ? Number(p.renta_mensual) : null,
      diasPeriodo,
      diasOcupada: ocupados,
      ocupacion: ocupados / diasPeriodo,
      vaciaDesde,
      diasVaciaHoy: vaciaDesde ? Math.max(0, dias(vaciaDesde, hoy) - 1) : null,
      ingresos,
      mantenimiento,
      cargos,
      neto: ingresos - mantenimiento - cargos,
      perdidoVacancia: p.renta_mensual ? Math.round((diasVacia / 30) * Number(p.renta_mensual)) : 0,
      tickets: tickets.filter((x) => x.propiedad_id === p.id && x.estado !== "cancelado").length,
    };
  });

  const meses: Mes[] = [];
  for (let m = desde; m <= inicioDeMes(hoy); m = siguienteMes(m)) {
    const delMes = cobros.filter((c) => c.periodo === m && c.estado !== "condonado");
    meses.push({ periodo: m, esperado: delMes.reduce((s, c) => s + monto(c), 0), cobrado: delMes.filter((c) => c.estado === "pagado").reduce((s, c) => s + monto(c), 0) });
  }

  // Pago puntual: de las rentas que ya vencieron, cuántas se pagaron a más tardar el día de vencimiento.
  const exigibles = cobros.filter((c) => c.vence < hoy && c.estado !== "condonado");
  const puntuales = exigibles.filter((c) => c.estado === "pagado" && c.pagado_at && c.pagado_at.slice(0, 10) <= c.vence);
  const tarde = exigibles.filter((c) => c.estado === "pagado" && c.pagado_at && c.pagado_at.slice(0, 10) > c.vence);
  const vencidos = cobros.filter((c) => c.estado === "vencido");
  const sum = (k: keyof FilaPropiedad) => filas.reduce((s, f) => s + Number(f[k] ?? 0), 0);

  return {
    desde,
    hasta: hoy,
    propiedades: filas,
    meses,
    ocupacionHoy: filas.filter((f) => f.rentada).length / filas.length,
    ocupacion12m: sum("diasOcupada") / sum("diasPeriodo"),
    vencido: vencidos.reduce((s, c) => s + monto(c), 0),
    inquilinosAtrasados: new Set(vencidos.map((c) => c.contratos.inquilino_id)).size,
    pagoPuntual: exigibles.length ? puntuales.length / exigibles.length : null,
    atrasoPromedio: tarde.length ? Math.round(tarde.reduce((s, c) => s + dias(c.vence, c.pagado_at!.slice(0, 10)) - 1, 0) / tarde.length) : null,
    ingresos: sum("ingresos"),
    neto: sum("neto"),
    perdidoVacancia: sum("perdidoVacancia"),
  };
}
