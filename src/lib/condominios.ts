import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "./supabase/admin";
import { BUCKET } from "./datos";

export * from "./condominios-datos";

export const esUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
export const esToken = (v: unknown): v is string => typeof v === "string" && /^[A-Z0-9]{12,40}$/.test(v);
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Datos que el residente ve por su link. Toda la autorización ocurre en la base (vecino_datos).
export type DatosVecino = {
  residente: { id: string; nombre: string; tipo: "propietario" | "inquilino" };
  permisos: { pases: boolean; reportes: boolean; ver_cuenta: boolean; registrar_pagos: boolean };
  vivienda: { numero: string; zona: string | null };
  condominio: { nombre: string; foto_path: string | null; administradora: string };
  pases: {
    id: string; codigo: string; visitante: string; tipo_visita: string; modalidad: "unico" | "recurrente";
    desde: string; hasta: string; dias: number[] | null; hora_desde: string | null; hora_hasta: string | null;
    max_usos: number | null; usos: number; placa: string | null; servicio: string | null; metodo_acceso: "qr" | "lista";
    estado: "activo" | "cancelado"; created_at: string;
  }[];
  accesos: { tipo: "entrada" | "salida"; visitante: string; metodo: string; ocurrio_at: string }[];
  paquetes: { id: string; paqueteria: string | null; descripcion: string | null; recibido_at: string; entregado_a: string | null; entregado_at: string | null }[];
  avisos: { titulo: string; cuerpo: string; created_at: string; zona: string | null }[];
  chat: { lado: "residente" | "caseta"; texto: string; created_at: string }[];
  reportes: {
    id: string; folio: number; titulo: string; categoria: string | null; estado: string; sensible: boolean;
    responsable: string | null; fecha_compromiso: string | null; resolucion: string | null; created_at: string;
    token_publico: string; foto: string | null; historial: { a: string | null; nota: string | null; fecha: string }[] | null;
  }[];
  comunidad: { mes: string; cobranza_pct: number | null; cobrado_centavos: number; gastos_centavos: number; reportes_abiertos: number };
  cuenta?: {
    saldo_centavos: number;
    datos_pago: string | null;
    cargos: { concepto: string; descripcion: string; periodo: string; monto_centavos: number; vence: string | null }[];
    pagos: { id: string; monto_centavos: number; pagado_el: string; referencia: string | null; estado: string; nota: string | null; recibo: string | null; recibo_at: string | null }[];
    ajustes: { monto_centavos: number; tipo: string; motivo: string; created_at: string }[];
  };
};

export async function datosVecino(token: string): Promise<DatosVecino | null> {
  if (!esToken(token)) return null;
  const { data, error } = await createAdminClient().rpc("vecino_datos", { p_token: token });
  if (error || !data) return null;
  return data as DatosVecino;
}

// URLs firmadas (1 h) de archivos privados del bucket.
export async function urlsFirmadas(rutas: (string | null | undefined)[]) {
  const limpias = [...new Set(rutas.filter((r): r is string => !!r))];
  if (!limpias.length) return new Map<string, string>();
  const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrls(limpias, 3600);
  return new Map((data ?? []).filter((f) => f.signedUrl && f.path).map((f) => [f.path as string, f.signedUrl as string]));
}

// ─── Sesión del dispositivo de caseta ───
// La cookie guarda "turno.secreto"; la base solo conoce sha256(secreto) y valida en cada operación.
const nombreCookie = (tk: string) => `caseta_${tk.slice(0, 8)}`;

export async function sesionCaseta(casetaToken: string) {
  const c = (await cookies()).get(nombreCookie(casetaToken))?.value ?? "";
  const [turno, secreto] = c.split(".");
  if (!esUuid(turno) || !secreto) return null;
  return { turno, hash: sha256(secreto) };
}

export async function abrirSesionCaseta(casetaToken: string, turno: string, secreto: string) {
  (await cookies()).set(nombreCookie(casetaToken), `${turno}.${secreto}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: `/caseta/${casetaToken}`,
    maxAge: 60 * 60 * 16, // un turno largo
  });
}

export async function cerrarSesionCaseta(casetaToken: string) {
  (await cookies()).delete({ name: nombreCookie(casetaToken), path: `/caseta/${casetaToken}` });
}

export const nuevoSecreto = () => randomBytes(32).toString("base64url");

// Mensaje de error que se puede mostrar (las excepciones de la base vienen en español).
export function mensajeError(e: { message?: string } | null | undefined, porDefecto = "No se pudo guardar. Intenta de nuevo.") {
  const m = e?.message ?? "";
  if (!m) return porDefecto;
  if (/link_invalido/.test(m)) return "Este link ya no es válido. Pide uno nuevo a tu administración.";
  if (/turno_invalido/.test(m)) return "Tu turno se cerró. Vuelve a entrar con tu PIN.";
  if (/sin_permiso/.test(m)) return "Tu cuenta no tiene permiso para esto. Pídelo a tu administración.";
  if (/duplicate key|violates|syntax|permission denied|function/i.test(m)) return porDefecto;
  return m.slice(0, 200);
}

export type Amenidad = {
  id: string; nombre: string; tipo: string; descripcion: string | null; reglas: string | null; foto_path: string | null;
  modo: "turnos" | "solicitud"; capacidad: number; hora_abre: string; hora_cierra: string; duraciones: number[];
  renta_centavos: number; deposito_centavos: number; ocupacion: { inicio: string; fin: string; personas: number; estado: string }[];
};
export type DatosAmenidades = {
  amenidades: Amenidad[];
  reservas: { id: string; amenidad: string; inicio: string; fin: string; personas: number; estado: string; renta_centavos: number; deposito_centavos: number; deposito_estado: string | null; nota: string | null }[];
  mudanzas: { id: string; tipo: "entrada" | "salida"; inicio: string; fin: string; empresa: string; placa: string | null; recursos: string[]; estado: string; nota: string | null; pase_codigo: string | null }[];
};

export async function amenidadesVecino(token: string): Promise<DatosAmenidades | null> {
  if (!esToken(token)) return null;
  const { data, error } = await createAdminClient().rpc("vecino_amenidades", { p_token: token });
  return error || !data ? null : (data as DatosAmenidades);
}
