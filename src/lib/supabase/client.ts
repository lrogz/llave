import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "./config";

// Cliente de Supabase para componentes del navegador.
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseKey);
}
