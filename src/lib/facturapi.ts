import "server-only";

// Facturapi (PAC) sin SDK. FACTURAPI_KEY = llave secreta de usuario (sk_user_…), con la que se crean
// las organizaciones (una por dueño). Cada organización tiene su propia llave para timbrar.
const API = () => process.env.FACTURAPI_URL || "https://www.facturapi.io/v2";
export const facturapiConfigurado = () => !!process.env.FACTURAPI_KEY;
export const modoPruebas = () => process.env.FACTURAPI_MODO === "test";

const auth = (llave: string) => `Basic ${Buffer.from(`${llave}:`).toString("base64")}`;

async function llamar<T>(llave: string, metodo: string, ruta: string, cuerpo?: unknown, formData?: FormData): Promise<T> {
  const r = await fetch(`${API()}${ruta}`, {
    method: metodo,
    headers: { Authorization: auth(llave), ...(formData ? {} : cuerpo ? { "Content-Type": "application/json" } : {}) },
    body: formData ?? (cuerpo ? JSON.stringify(cuerpo) : undefined),
  });
  const tipo = r.headers.get("content-type") ?? "";
  const datos = tipo.includes("json") ? await r.json().catch(() => ({})) : await r.text();
  if (!r.ok) throw new Error((datos as { message?: string })?.message ?? `Facturapi respondió ${r.status}`);
  return datos as T;
}

const usuario = () => process.env.FACTURAPI_KEY!;

export const crearOrganizacion = (nombre: string) => llamar<{ id: string }>(usuario(), "POST", "/organizations", { name: nombre.slice(0, 100) });

export const datosFiscales = (orgId: string, d: { razon_social: string; regimen: string; cp: string; nombre: string }) =>
  llamar(usuario(), "PUT", `/organizations/${orgId}/legal`, { name: d.nombre, legal_name: d.razon_social, tax_system: d.regimen, address: { zip: d.cp } });

export async function subirCertificado(orgId: string, cer: File, key: File, contrasena: string) {
  const f = new FormData();
  f.append("cer", cer, "cer.cer");
  f.append("key", key, "key.key");
  f.append("password", contrasena);
  return llamar<{ certificate?: { expires_at?: string; has_certificate?: boolean } }>(usuario(), "PUT", `/organizations/${orgId}/certificate`, undefined, f);
}

// Llave para timbrar a nombre del dueño (de pruebas o productiva).
export async function llaveOrganizacion(orgId: string) {
  if (modoPruebas()) {
    const r = await llamar<string | { key?: string }>(usuario(), "GET", `/organizations/${orgId}/apikeys/test`);
    return typeof r === "string" ? r.replace(/"/g, "") : (r.key ?? "");
  }
  const r = await llamar<string | { key?: string }>(usuario(), "PUT", `/organizations/${orgId}/apikeys/live`);
  return typeof r === "string" ? r.replace(/"/g, "") : (r.key ?? "");
}

export type FacturaCreada = { id: string; uuid: string; folio_number: number | string; series?: string; total: number };
export const timbrar = (llave: string, factura: unknown) => llamar<FacturaCreada>(llave, "POST", "/invoices", factura);
export const cancelar = (llave: string, id: string, motivo = "02") => llamar<{ status: string }>(llave, "DELETE", `/invoices/${id}?motive=${motivo}`);
export const enviarPorCorreo = (llave: string, id: string, email: string) => llamar(llave, "POST", `/invoices/${id}/email`, { email });

export async function descargar(llave: string, id: string, formato: "pdf" | "xml") {
  const r = await fetch(`${API()}/invoices/${id}/${formato}`, { headers: { Authorization: auth(llave) } });
  if (!r.ok) throw new Error(`No se pudo descargar (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}
