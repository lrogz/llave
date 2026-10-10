// Acepta la URL de Supabase aunque venga con "/" al final, con /rest/v1 o copiada del dashboard,
// y la deja como https://<proyecto>.supabase.co
export function normalizarUrl(cruda: string) {
  const s = cruda.trim().replace(/^["']|["']$/g, "");
  if (!s) return "";
  const panel = s.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (panel) return `https://${panel[1]}.supabase.co`;
  try {
    return new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).origin;
  } catch {
    return s.replace(/\/+$/, "");
  }
}

export const supabaseUrl = normalizarUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
export const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

export const supabaseConfigurado = Boolean(supabaseUrl && supabaseKey);
