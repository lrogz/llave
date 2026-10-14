// Contrato de arrendamiento habitacional: borrador que la administradora revisa y puede editar antes de mandar a firmar.
// IMPORTANTE: es un modelo general; cada administradora debe validarlo con su abogado.

const UNIDADES = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function hasta999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const r = n % 100;
  let t = "";
  if (r < 30) t = UNIDADES[r];
  else t = DECENAS[Math.floor(r / 10)] + (r % 10 ? ` y ${UNIDADES[r % 10]}` : "");
  return [CENTENAS[c], t].filter(Boolean).join(" ");
}

export function numeroALetras(n: number): string {
  const entero = Math.floor(n);
  if (entero === 0) return "cero";
  const millones = Math.floor(entero / 1_000_000);
  const miles = Math.floor((entero % 1_000_000) / 1000);
  const resto = entero % 1000;
  return [
    millones ? (millones === 1 ? "un millón" : `${hasta999(millones)} millones`) : "",
    miles ? (miles === 1 ? "mil" : `${hasta999(miles)} mil`) : "",
    hasta999(resto),
  ]
    .filter(Boolean)
    .join(" ");
}

export const pesosConLetra = (n: number) => {
  const centavos = Math.round((n - Math.floor(n)) * 100);
  const num = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
  return `${num} (${numeroALetras(n).toUpperCase()} PESOS ${String(centavos).padStart(2, "0")}/100 M.N.)`;
};

const fechaLarga = (f: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${f}T00:00:00Z`));
// Meses completos del plazo: del 1 de agosto al 31 de julio son 12.
const meses = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const siguiente = new Date(Date.parse(`${b}T00:00:00Z`) + 86_400_000);
  const [y2, m2, d2] = [siguiente.getUTCFullYear(), siguiente.getUTCMonth() + 1, siguiente.getUTCDate()];
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + (d2 >= d1 ? 0 : -1));
};

export type DatosContrato = {
  ciudad: string;
  hoy: string;
  administradora: string;
  arrendador: string | null;
  arrendatario: string;
  fiador: string | null;
  inmueble: string;
  inicio: string;
  fin: string;
  renta: number;
  diaPago: number;
  deposito: number | null;
  recargoPct: number | null;
  datosPago: string | null;
  referencia: string | null;
  mascotas: boolean;
  poliza: { proveedor: string; numero: string | null } | null;
};

export function generarContrato(d: DatosContrato) {
  const arrendador = d.arrendador || "[NOMBRE DEL ARRENDADOR]";
  const plazo = meses(d.inicio, d.fin);
  const c: string[] = [];
  let n = 0;
  const clausula = (titulo: string, texto: string) => c.push(`${["PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA", "SEXTA", "SÉPTIMA", "OCTAVA", "NOVENA", "DÉCIMA", "DÉCIMA PRIMERA", "DÉCIMA SEGUNDA", "DÉCIMA TERCERA", "DÉCIMA CUARTA", "DÉCIMA QUINTA", "DÉCIMA SEXTA"][n++]}. ${titulo}. ${texto}`);

  clausula("OBJETO", `EL ARRENDADOR da en arrendamiento a EL ARRENDATARIO el inmueble ubicado en ${d.inmueble} (en adelante, "EL INMUEBLE"), que se destinará exclusivamente a casa habitación. EL ARRENDATARIO no podrá darle un uso distinto sin autorización por escrito.`);
  clausula("PLAZO", `El arrendamiento será por ${plazo} ${plazo === 1 ? "mes" : "meses"} forzosos para ambas partes, del ${fechaLarga(d.inicio)} al ${fechaLarga(d.fin)}. Al término, EL ARRENDATARIO entregará EL INMUEBLE desocupado, salvo que las partes firmen una renovación.`);
  clausula(
    "RENTA",
    `EL ARRENDATARIO pagará una renta mensual de ${pesosConLetra(d.renta)}, a más tardar el día ${d.diaPago} de cada mes, por adelantado.${d.datosPago ? ` El pago se hará mediante transferencia o depósito a los siguientes datos: ${d.datosPago.replace(/\s*\n\s*/g, "; ")}.` : ""}${d.referencia ? ` En cada transferencia se indicará la referencia numérica ${d.referencia}.` : ""} EL ARRENDATARIO podrá consultar sus pagos y subir sus comprobantes en el link que le proporcione LA ADMINISTRADORA.`,
  );
  clausula("PAGO TARDÍO", d.recargoPct ? `Si la renta no se paga en la fecha convenida, EL ARRENDATARIO pagará un recargo del ${d.recargoPct}% sobre la renta del mes por cada mes o fracción de atraso.` : "Si la renta no se paga en la fecha convenida, EL ARRENDADOR podrá exigir el pago inmediato y, en su caso, la rescisión del contrato conforme a la ley.");
  clausula(
    "DEPÓSITO EN GARANTÍA",
    d.deposito ? `EL ARRENDATARIO entrega en este acto la cantidad de ${pesosConLetra(d.deposito)} como depósito en garantía, que no generará intereses y que se devolverá al término del contrato, una vez entregado EL INMUEBLE en las condiciones recibidas (salvo el desgaste por el uso normal) y comprobado el pago de rentas y servicios. El depósito no podrá aplicarse al pago de la última renta.` : "Las partes acuerdan que no se entrega depósito en garantía.",
  );
  clausula("SERVICIOS", "Los consumos de luz, agua, gas, internet y demás servicios que se generen durante el arrendamiento serán por cuenta de EL ARRENDATARIO, quien entregará los recibos pagados cuando se le soliciten. El impuesto predial corre a cargo de EL ARRENDADOR.");
  clausula("ENTREGA Y ESTADO DEL INMUEBLE", "EL ARRENDATARIO recibe EL INMUEBLE en el estado que consta en el acta de entrega cuarto por cuarto, con fotografías, que las partes firman por separado y que forma parte de este contrato. Al terminar, la recepción se hará comparando contra dicha acta.");
  clausula("MANTENIMIENTO Y REPARACIONES", "Las reparaciones menores derivadas del uso diario (focos, empaques, contactos, limpieza de drenajes por mal uso, vidrios rotos por EL ARRENDATARIO) corren por cuenta de EL ARRENDATARIO. Las reparaciones estructurales o de instalaciones por desgaste natural corren por cuenta de EL ARRENDADOR. Cualquier desperfecto se reportará por los medios que indique LA ADMINISTRADORA (link o código QR del inmueble).");
  clausula("MEJORAS Y MODIFICACIONES", "EL ARRENDATARIO no podrá hacer modificaciones a EL INMUEBLE sin autorización por escrito de EL ARRENDADOR. Las mejoras autorizadas quedarán en beneficio de EL INMUEBLE sin costo para EL ARRENDADOR, salvo pacto en contrario.");
  clausula("SUBARRENDAMIENTO", "EL ARRENDATARIO no podrá subarrendar, traspasar ni ceder total o parcialmente los derechos de este contrato.");
  clausula("MASCOTAS", d.mascotas ? "Se permiten mascotas domésticas, siendo EL ARRENDATARIO responsable de los daños que causen y de la limpieza del inmueble." : "No se permiten mascotas en EL INMUEBLE sin autorización por escrito de EL ARRENDADOR.");
  clausula("TERMINACIÓN ANTICIPADA", "Si EL ARRENDATARIO desea desocupar antes del plazo pactado, deberá avisar por escrito con 30 días de anticipación y pagar como pena convencional el equivalente a un mes de renta, sin perjuicio de las rentas y servicios adeudados.");
  if (d.fiador || d.poliza) {
    clausula(
      "GARANTÍAS",
      [
        d.fiador ? `${d.fiador} se constituye como FIADOR Y OBLIGADO SOLIDARIO de EL ARRENDATARIO respecto de todas las obligaciones de este contrato, hasta la total desocupación y entrega de EL INMUEBLE.` : "",
        d.poliza ? `Adicionalmente, el arrendamiento cuenta con póliza jurídica / protección de renta contratada con ${d.poliza.proveedor}${d.poliza.numero ? ` (número ${d.poliza.numero})` : ""}, cuyos términos se integran a este contrato.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  clausula("ADMINISTRACIÓN", `EL ARRENDADOR designa a ${d.administradora} (LA ADMINISTRADORA) para cobrar las rentas, atender reportes de mantenimiento y recibir comunicaciones relacionadas con este contrato.`);
  clausula("FIRMA ELECTRÓNICA Y JURISDICCIÓN", `Las partes aceptan firmar este contrato por medios electrónicos y reconocen que dicha firma produce los mismos efectos que la autógrafa, conforme al Código Civil Federal y al Código de Comercio. Para su interpretación y cumplimiento, se someten a las leyes y tribunales de ${d.ciudad}, renunciando a cualquier otro fuero.`);

  return [
    "CONTRATO DE ARRENDAMIENTO DE CASA HABITACIÓN",
    "",
    `Que celebran por una parte ${arrendador}, a quien en lo sucesivo se le denominará "EL ARRENDADOR", representado para efectos de administración por ${d.administradora}; por otra parte ${d.arrendatario}, a quien se le denominará "EL ARRENDATARIO"${d.fiador ? `; y ${d.fiador}, como "EL FIADOR"` : ""}, al tenor de las siguientes:`,
    "",
    "CLÁUSULAS",
    "",
    ...c.flatMap((x) => [x, ""]),
    `Leído que fue el presente contrato y enteradas las partes de su contenido y alcance, lo firman electrónicamente en ${d.ciudad}, el ${fechaLarga(d.hoy)}.`,
  ].join("\n");
}
