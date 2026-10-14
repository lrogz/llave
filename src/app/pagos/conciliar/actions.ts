"use server";

import { revalidatePath } from "next/cache";
import type { Deposito } from "@/lib/conciliacion";
import { sesionConOrg } from "@/lib/sesion";

export type Coincidencia = {
  deposito: Deposito;
  tipo: "referencia" | "sugerida" | "ninguna" | "ya_pagado";
  cobro?: { id: string; periodo: string; total: number; inquilino: string; propiedad: string; referencia: string | null };
  nota?: string;
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type CobroFila = {
  id: string;
  periodo: string;
  monto: number;
  recargo: number;
  estado: string;
  contrato_id: string;
  contratos: { referencia: string | null; inquilinos: { nombre: string } | null; propiedades: { nombre: string } | null } | null;
};

// Empareja cada depósito con un cobro: primero por la referencia numérica; si no trae, por monto exacto + apellido del inquilino.
export async function analizarDepositos(entrada: Deposito[]): Promise<{ resultados: Coincidencia[]; error?: string }> {
  const { supabase, org } = await sesionConOrg();
  if (!Array.isArray(entrada) || !entrada.length) return { resultados: [], error: "El archivo no trae depósitos." };
  const depositos = entrada.slice(0, 2000).map((d) => ({
    fila: Number(d.fila) || 0,
    fecha: typeof d.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? d.fecha : null,
    texto: String(d.texto ?? "").slice(0, 300),
    monto: Math.round(Number(d.monto) * 100) / 100,
  }));
  await supabase.rpc("actualizar_cobros", { org: org.id });
  const { data, error } = await supabase
    .from("cobros_renta")
    .select("id, periodo, monto, recargo, estado, contrato_id, contratos(referencia, inquilinos(nombre), propiedades(nombre))")
    .in("estado", ["pendiente", "vencido", "por_confirmar"])
    .order("periodo");
  if (error) return { resultados: [], error: "No pudimos leer los cobros. ¿Ya corriste la migración de referencias?" };
  const pendientes = (data ?? []) as unknown as CobroFila[];
  const usados = new Set<string>();
  const total = (c: CobroFila) => Number(c.monto) + Number(c.recargo ?? 0);
  const info = (c: CobroFila) => ({
    id: c.id,
    periodo: c.periodo,
    total: total(c),
    inquilino: c.contratos?.inquilinos?.nombre ?? "",
    propiedad: c.contratos?.propiedades?.nombre ?? "",
    referencia: c.contratos?.referencia ?? null,
  });

  const resultados: Coincidencia[] = depositos.map((d) => {
    const numeros: string[] = d.texto.match(/(?<!\d)\d{7}(?!\d)/g) ?? [];
    const porRef = pendientes.filter((c) => !usados.has(c.id) && c.contratos?.referencia && numeros.includes(c.contratos.referencia!));
    if (porRef.length) {
      const exacto = porRef.find((c) => Math.abs(total(c) - d.monto) < 1);
      const elegido = exacto ?? porRef[0];
      usados.add(elegido.id);
      return { deposito: d, tipo: "referencia", cobro: info(elegido), nota: exacto ? undefined : `El depósito (${d.monto}) no es igual a la renta (${total(elegido)}).` };
    }
    const texto = norm(d.texto);
    const porNombre = pendientes.filter((c) => {
      if (usados.has(c.id) || Math.abs(total(c) - d.monto) >= 1) return false;
      const partes = norm(c.contratos?.inquilinos?.nombre ?? "")
        .split(/\s+/)
        .filter((p) => p.length >= 4);
      return partes.some((p) => texto.includes(p));
    });
    if (porNombre.length === 1) {
      usados.add(porNombre[0].id);
      return { deposito: d, tipo: "sugerida", cobro: info(porNombre[0]), nota: "Sin referencia: coincide el monto y el nombre." };
    }
    return { deposito: d, tipo: "ninguna" };
  });
  return { resultados };
}

export async function registrarConciliacion(items: { cobro_id: string; fecha: string | null }[]): Promise<{ registrados: number }> {
  const { supabase } = await sesionConOrg();
  let registrados = 0;
  for (const it of (items ?? []).slice(0, 2000)) {
    if (!/^[0-9a-f-]{36}$/i.test(String(it.cobro_id))) continue;
    const fecha = typeof it.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.fecha) ? `${it.fecha}T12:00:00-06:00` : new Date().toISOString();
    const { data } = await supabase
      .from("cobros_renta")
      .update({ estado: "pagado", metodo: "spei", pagado_at: fecha, nota: "Conciliado con el estado de cuenta" })
      .eq("id", it.cobro_id)
      .in("estado", ["pendiente", "vencido", "por_confirmar"])
      .select("id");
    registrados += data?.length ?? 0;
  }
  revalidatePath("/pagos");
  revalidatePath("/hoy");
  return { registrados };
}
