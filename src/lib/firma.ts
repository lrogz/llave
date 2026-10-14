import "server-only";
import crypto from "node:crypto";

// Valida y decodifica la firma dibujada (PNG en base64) que llega del formulario.
export function decodificarFirma(valor: FormDataEntryValue | null) {
  const m = String(valor ?? "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const png = Buffer.from(m[1], "base64");
  return png.length >= 500 && png.length <= 400_000 ? png : null;
}

// Huella del texto firmado: si alguien lo cambiara, ya no coincide.
export const huella = (texto: string) => crypto.createHash("sha256").update(texto, "utf8").digest("hex");
