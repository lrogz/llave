import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "./datos";

export type Firmante = { id: string; rol: string; nombre: string; telefono: string | null; token: string; firmada_at: string | null; ip: string | null; dispositivo: string | null; firmaUrl: string | null };
export type DocContrato = {
  id: string;
  contenido: string;
  hash: string | null;
  estado: string;
  enviado_at: string | null;
  created_at: string;
  inquilino: { id: string; nombre: string } | null;
  propiedad: string;
  org: string;
  firmantes: Firmante[];
};

export const ROL: Record<string, string> = { arrendatario: "Arrendatario (inquilino)", arrendador: "Arrendador (dueño)", fiador: "Fiador / obligado solidario", administradora: "Administradora" };

export async function cargarContrato(db: SupabaseClient, id: string): Promise<DocContrato | null> {
  const { data } = await db
    .from("documentos_contrato")
    .select("id, contenido, hash, estado, enviado_at, created_at, organizaciones(nombre), contratos(inquilinos(id, nombre), propiedades(nombre)), firmas_contrato(id, rol, nombre, telefono, token, firmada_at, ip, dispositivo, firma_path, created_at)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const d = data as unknown as {
    id: string;
    contenido: string;
    hash: string | null;
    estado: string;
    enviado_at: string | null;
    created_at: string;
    organizaciones: { nombre: string } | null;
    contratos: { inquilinos: { id: string; nombre: string } | null; propiedades: { nombre: string } | null } | null;
    firmas_contrato: (Omit<Firmante, "firmaUrl"> & { firma_path: string | null; created_at: string })[];
  };
  const rutas = d.firmas_contrato.map((x) => x.firma_path).filter((x): x is string => !!x);
  const { data: firmadas } = rutas.length ? await db.storage.from(BUCKET).createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((x) => [x.path, x.signedUrl]));
  const orden = ["arrendador", "arrendatario", "fiador", "administradora"];
  return {
    id: d.id,
    contenido: d.contenido,
    hash: d.hash,
    estado: d.estado,
    enviado_at: d.enviado_at,
    created_at: d.created_at,
    inquilino: d.contratos?.inquilinos ?? null,
    propiedad: d.contratos?.propiedades?.nombre ?? "",
    org: d.organizaciones?.nombre ?? "",
    firmantes: d.firmas_contrato
      .sort((a, b) => orden.indexOf(a.rol) - orden.indexOf(b.rol))
      .map((x) => ({ id: x.id, rol: x.rol, nombre: x.nombre, telefono: x.telefono, token: x.token, firmada_at: x.firmada_at, ip: x.ip, dispositivo: x.dispositivo, firmaUrl: x.firma_path ? (url.get(x.firma_path) ?? null) : null })),
  };
}
