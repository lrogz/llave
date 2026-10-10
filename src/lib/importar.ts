// Importar cartera desde Excel/CSV: detección de columnas y normalización (sirve en cliente y servidor).

export const CAMPOS = [
  { clave: "nombre", texto: "Nombre", requerido: true, sinonimos: ["nombre", "propiedad", "inmueble", "nombre de la propiedad", "alias", "identificador", "unidad"] },
  { clave: "direccion", texto: "Calle y número", sinonimos: ["direccion", "calle", "domicilio", "calle y numero", "ubicacion"] },
  { clave: "colonia", texto: "Colonia", sinonimos: ["colonia", "fraccionamiento", "fracc", "barrio", "zona"] },
  { clave: "ciudad", texto: "Ciudad", sinonimos: ["ciudad", "municipio", "localidad"] },
  { clave: "tipo", texto: "Tipo", sinonimos: ["tipo", "tipo de propiedad", "tipo de inmueble", "clase"] },
  { clave: "estado", texto: "Estado", sinonimos: ["estado", "estatus", "status", "situacion", "ocupacion"] },
  { clave: "renta", texto: "Renta mensual", sinonimos: ["renta", "renta mensual", "precio", "mensualidad", "monto", "precio renta"] },
  { clave: "dueno", texto: "Dueño", sinonimos: ["dueno", "propietario", "nombre del dueno", "nombre propietario", "arrendador"] },
  { clave: "dueno_telefono", texto: "Teléfono del dueño", sinonimos: ["telefono dueno", "telefono propietario", "celular dueno", "whatsapp dueno", "telefono", "celular", "whatsapp", "tel"] },
  { clave: "dueno_email", texto: "Correo del dueño", sinonimos: ["correo dueno", "email dueno", "correo propietario", "email propietario", "correo", "email", "mail"] },
  { clave: "notas", texto: "Notas", sinonimos: ["notas", "comentarios", "observaciones", "nota"] },
] as const;

export type Clave = (typeof CAMPOS)[number]["clave"];
export type Mapeo = Partial<Record<Clave, number>>;
export type Celda = string | number | boolean | Date | null | undefined;

export type FilaImportada = {
  nombre: string;
  direccion: string | null;
  colonia: string | null;
  ciudad: string | null;
  tipo: "casa" | "departamento" | "local" | "oficina" | "unidad_condominio" | "otro";
  estado: "rentada" | "vacia" | "en_mantenimiento";
  renta: number | null;
  dueno: string | null;
  dueno_telefono: string | null;
  dueno_email: string | null;
  notas: string | null;
};

export const MAX_FILAS = 500;

export const simplificar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Asigna cada columna del archivo al campo que mejor le queda (coincidencia exacta primero).
export function detectarColumnas(encabezados: string[]): Mapeo {
  const simples = encabezados.map((e) => simplificar(String(e ?? "")));
  const usadas = new Set<number>();
  const mapeo: Mapeo = {};
  for (const exacto of [true, false]) {
    for (const campo of CAMPOS) {
      if (mapeo[campo.clave] !== undefined) continue;
      const i = simples.findIndex(
        (s, idx) =>
          !usadas.has(idx) &&
          s !== "" &&
          campo.sinonimos.some((sin) => (exacto ? s === sin : s.startsWith(sin) || s.includes(` ${sin}`))),
      );
      if (i >= 0) {
        mapeo[campo.clave] = i;
        usadas.add(i);
      }
    }
  }
  return mapeo;
}

const texto = (v: Celda, max = 200) => {
  if (v == null) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim().slice(0, max);
  return s || null;
};

export function tipoDe(v: Celda): FilaImportada["tipo"] {
  const s = simplificar(String(v ?? ""));
  if (!s) return "casa";
  if (/depa|depto|dpto|departamento|loft|studio|estudio/.test(s)) return "departamento";
  if (/condominio|condo|privada|unidad|torre/.test(s)) return "unidad_condominio";
  if (/local|comercial|bodega|nave/.test(s)) return "local";
  if (/oficina|consultorio|despacho/.test(s)) return "oficina";
  if (/casa|residencia/.test(s)) return "casa";
  return "otro";
}

export function estadoDe(v: Celda): FilaImportada["estado"] {
  const s = simplificar(String(v ?? ""));
  if (/manten|repar|obra|remodel/.test(s)) return "en_mantenimiento";
  if (/^(rentad|ocupad|arrendad|habitad|si$)/.test(s)) return "rentada";
  return "vacia";
}

export function montoDe(v: Celda): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
  const s = String(v ?? "").replace(/[^0-9.]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n < 10_000_000 ? n : null;
}

export function convertir(fila: Celda[], mapeo: Mapeo): FilaImportada | null {
  const de = (c: Clave) => (mapeo[c] === undefined ? null : fila[mapeo[c]!]);
  const nombre = texto(de("nombre"), 120);
  if (!nombre) return null;
  const email = texto(de("dueno_email"), 160);
  return {
    nombre,
    direccion: texto(de("direccion")),
    colonia: texto(de("colonia"), 120),
    ciudad: texto(de("ciudad"), 120),
    tipo: tipoDe(de("tipo")),
    estado: estadoDe(de("estado")),
    renta: montoDe(de("renta")),
    dueno: texto(de("dueno"), 120),
    dueno_telefono: texto(de("dueno_telefono"), 30),
    dueno_email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    notas: texto(de("notas"), 500),
  };
}

// Lector CSV sencillo: comillas, comas o punto y coma (Excel en español usa ";").
export function leerCSV(contenido: string): string[][] {
  const limpio = contenido.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : primera.includes("\t") && !primera.includes(",") ? "\t" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}
