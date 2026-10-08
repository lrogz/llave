import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

// Cliente con la llave service_role: salta RLS. Solo para las páginas públicas
// (reporte por QR, link del proveedor, link del dueño) y siempre filtrando por token.
export function createAdminClient() {
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !llave) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.");
  }
  return createClient(supabaseUrl, llave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
