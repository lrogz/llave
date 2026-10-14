import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { diasEntre, hoyMX, primerNombre } from "./crm";
import { correoConfigurado, enviarCorreos, plantilla, type Correo } from "./correo";
import { TIPOS_SERVICIO, etiqueta, formatoFecha, pesos } from "./datos";
import { inicioDeMes, mesAnterior, mesTexto } from "./reporte";
import { generarMantenimientos } from "./mantenimiento";
import { enMX, fechaCita } from "./agenda";
import { enviarPlantilla, telefonoValido, whatsappConfigurado, type MensajeWA } from "./whatsapp";

export type TipoAviso = "renta" | "vencida" | "reporte" | "renovacion" | "servicios" | "citas" | "resumen";
export const AVISOS: { clave: TipoAviso; texto: string; detalle: string }[] = [
  { clave: "renta", texto: "Aviso de renta al inquilino", detalle: "3 días antes de que venza, con su link de pago" },
  { clave: "vencida", texto: "Renta vencida", detalle: "Recordatorio al día siguiente y a la semana" },
  { clave: "reporte", texto: "Reporte mensual al dueño", detalle: "Del día 1 al 5, con rentas, trabajos y saldo" },
  { clave: "renovacion", texto: "Renovación de contrato", detalle: "Al inquilino 60 días antes de que termine" },
  { clave: "servicios", texto: "Servicios por vencer", detalle: "A quien paga (inquilino o dueño), 3 días antes" },
  { clave: "citas", texto: "Recordatorio de visitas", detalle: "Al inquilino y al proveedor, un día antes de la visita" },
  { clave: "resumen", texto: "Resumen diario para ti", detalle: "Cada mañana, solo si hay algo pendiente" },
];

type Candidato = { clave: string; tipo: TipoAviso; correo?: Correo; wa?: MensajeWA };
// `avisos.correo`: correo opcional para el resumen y las respuestas (si no, las administradoras del equipo).
// `avisos.whatsapp`: false para no mandar por WhatsApp aunque esté conectado.
export type ConfigAvisos = Partial<Record<TipoAviso, boolean>> & { correo?: string; whatsapp?: boolean };
type Org = { id: string; nombre: string; avisos: ConfigAvisos | null; miembros: { email: string | null; rol: string }[] };
export type ResultadoOrg = { org: string; enviados: number; porTipo: Record<string, number>; error?: string };

export const valido = (e?: string | null): e is string => !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// Corre los avisos del día. Con `soloOrg` lo hace para una administradora (botón "mandar ahora").
export async function correrAvisos(db: SupabaseClient, opciones: { soloOrg?: string; base?: string } = {}) {
  const base = opciones.base ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  let q = db.from("organizaciones").select("id, nombre, avisos, miembros(email, rol)");
  if (opciones.soloOrg) q = q.eq("id", opciones.soloOrg);
  const { data: orgs, error } = await q;
  if (error) return { ok: false, error: error.message, resultados: [] as ResultadoOrg[] };
  const resultados: ResultadoOrg[] = [];
  for (const org of (orgs ?? []) as Org[]) {
    try {
      resultados.push(await avisosDeOrg(db, org, base));
    } catch (e) {
      resultados.push({ org: org.nombre, enviados: 0, porTipo: {}, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ok: true, correo: correoConfigurado(), whatsapp: whatsappConfigurado(), resultados };
}

async function avisosDeOrg(db: SupabaseClient, org: Org, base: string): Promise<ResultadoOrg> {
  await db.rpc("generar_cobros", { org: org.id });
  const mantenimientos = await generarMantenimientos(db, org.id);
  const activo = (t: TipoAviso) => org.avisos?.[t] !== false;
  const hoy = hoyMX();
  const responsables = valido(org.avisos?.correo)
    ? [org.avisos.correo.toLowerCase()]
    : org.miembros.filter((m) => (m.rol === "propietario" || m.rol === "admin") && valido(m.email)).map((m) => m.email!);
  const responderA = responsables[0] ?? null;
  const c: Candidato[] = [];
  const correo = (para: string, asunto: string, html: string): Correo => ({ para, asunto, html, responderA });
  const conWA = whatsappConfigurado() && org.avisos?.whatsapp !== false;
  const conCorreo = correoConfigurado();
  // Cada aviso sale por correo y/o WhatsApp según los datos que tenga la persona.
  const agregar = (clave: string, tipo: TipoAviso, email: string | null | undefined, armarCorreo: () => Correo, telefono: string | null | undefined, wa: () => Omit<MensajeWA, "telefono">) => {
    if (conCorreo && valido(email)) c.push({ clave, tipo, correo: armarCorreo() });
    if (conWA && telefonoValido(telefono)) c.push({ clave: `${clave}:wa`, tipo, wa: { telefono: telefono!, ...wa() } });
  };

  // Rentas: aviso 3 días antes y recordatorio de vencida
  const { data: cobros } = await db
    .from("cobros_renta")
    .select("id, monto, recargo, vence, estado, token, contratos(inquilinos(nombre, email, telefono), propiedades(nombre))")
    .eq("organizacion_id", org.id)
    .in("estado", ["pendiente", "vencido"])
    .gte("vence", hoyMX(-7))
    .lte("vence", hoyMX(3));
  for (const r of (cobros ?? []) as unknown as {
    id: string;
    monto: number;
    recargo: number;
    vence: string;
    estado: string;
    token: string;
    contratos: { inquilinos: { nombre: string; email: string | null; telefono: string | null } | null; propiedades: { nombre: string } | null } | null;
  }[]) {
    const inq = r.contratos?.inquilinos;
    if (!inq || (!valido(inq.email) && !telefonoValido(inq.telefono))) continue;
    const casa = r.contratos?.propiedades?.nombre ?? "tu casa";
    const total = pesos.format(Number(r.monto) + Number(r.recargo ?? 0));
    const link = { texto: "Ver datos y subir comprobante", url: `${base}/p/${r.token}` };
    const d = diasEntre(hoy, r.vence);
    if (activo("renta") && r.estado === "pendiente" && d === 3) {
      agregar(`renta:${r.id}`, "renta", inq.email, () =>
        correo(inq.email!, `Tu renta de ${casa} vence el ${formatoFecha(r.vence)}`, plantilla({
          org: org.nombre,
          titulo: `${primerNombre(inq.nombre)}, tu renta vence en 3 días`,
          parrafos: [`La renta de ${casa} por ${total} vence el ${formatoFecha(r.vence)}.`, "En el link están los datos para depositar. Cuando pagues, sube ahí tu comprobante."],
          boton: link,
        })), inq.telefono, () => ({ plantilla: "bk_aviso_renta", variables: [primerNombre(inq.nombre), org.nombre, casa, total, formatoFecha(r.vence), link.url] }));
    }
    if (activo("vencida") && r.estado === "vencido" && (d === -1 || d === -7)) {
      agregar(`vencida:${r.id}:${d}`, "vencida", inq.email, () =>
        correo(inq.email!, `Renta pendiente de ${casa}`, plantilla({
          org: org.nombre,
          titulo: `${primerNombre(inq.nombre)}, tu renta está pendiente`,
          parrafos: [`La renta de ${casa} por ${total} venció el ${formatoFecha(r.vence)}.`, "Si ya pagaste, sube tu comprobante en el link para que lo registremos. ¡Gracias!"],
          boton: link,
        })), inq.telefono, () => ({ plantilla: "bk_renta_vencida", variables: [primerNombre(inq.nombre), org.nombre, casa, total, formatoFecha(r.vence), link.url] }));
    }
  }

  // Reporte del mes pasado al dueño (días 1 a 5)
  const diaMes = Number(hoy.slice(8, 10));
  if (activo("reporte") && diaMes <= 5) {
    const mesPasado = mesAnterior(inicioDeMes(hoy));
    const { data: duenos } = await db.from("duenos").select("id, nombre, email, telefono, frecuencia_reporte, propiedades(id)").eq("organizacion_id", org.id).neq("frecuencia_reporte", "solo_cambios");
    for (const d of (duenos ?? []) as { id: string; nombre: string; email: string | null; telefono: string | null; propiedades: { id: string }[] }[]) {
      if ((!valido(d.email) && !telefonoValido(d.telefono)) || !d.propiedades.length) continue;
      await db.from("reportes_dueno").upsert({ organizacion_id: org.id, dueno_id: d.id, periodo: mesPasado }, { onConflict: "dueno_id,periodo", ignoreDuplicates: true });
      const { data: rep } = await db.from("reportes_dueno").select("token").eq("dueno_id", d.id).eq("periodo", mesPasado).single();
      if (!rep) continue;
      const mes = mesTexto(mesPasado);
      agregar(`reporte:${d.id}:${mesPasado}`, "reporte", d.email, () =>
        correo(d.email!, `Reporte de ${mes} de tus propiedades`, plantilla({
          org: org.nombre,
          titulo: `${primerNombre(d.nombre)}, aquí está tu reporte de ${mes}`,
          parrafos: ["Rentas cobradas, trabajos realizados con fotos, gastos y tu saldo del mes, todo en un solo lugar."],
          boton: { texto: "Ver mi reporte", url: `${base}/e/${rep.token}` },
        })), d.telefono, () => ({ plantilla: "bk_reporte_dueno", variables: [primerNombre(d.nombre), org.nombre, mes, `${base}/e/${rep.token}`] }));
    }
  }

  // Renovación: 60 días antes (ventana de 5 días por si un día no corrió)
  if (activo("renovacion")) {
    const { data: contratos } = await db
      .from("contratos")
      .select("id, fin, inquilinos(nombre, email, telefono), propiedades(nombre)")
      .eq("organizacion_id", org.id)
      .eq("activo", true)
      .gte("fin", hoyMX(55))
      .lte("fin", hoyMX(60));
    for (const k of (contratos ?? []) as unknown as { id: string; fin: string; inquilinos: { nombre: string; email: string | null; telefono: string | null } | null; propiedades: { nombre: string } | null }[]) {
      const inq = k.inquilinos;
      if (!inq) continue;
      const casa = k.propiedades?.nombre ?? "tu casa";
      agregar(`renovacion:${k.id}`, "renovacion", inq.email, () =>
        correo(inq.email!, `Tu contrato de ${casa} termina pronto`, plantilla({
          org: org.nombre,
          titulo: `${primerNombre(inq.nombre)}, ¿quieres renovar?`,
          parrafos: [`Tu contrato de ${casa} termina el ${formatoFecha(k.fin)}.`, "Responde a este correo para decirnos si te gustaría renovar y te compartimos las condiciones."],
        })), inq.telefono, () => ({ plantilla: "bk_renovacion", variables: [primerNombre(inq.nombre), org.nombre, casa, formatoFecha(k.fin)] }));
    }
  }

  // Servicios por vencer: a quien le toca pagar
  if (activo("servicios")) {
    const { data: recibos } = await db
      .from("recibos_servicio")
      .select("id, vence, monto, servicios(tipo, compania, numero_servicio, quien_paga, propiedades(id, nombre, duenos(nombre, email, telefono), contratos(activo, inquilinos(nombre, email, telefono))))")
      .eq("organizacion_id", org.id)
      .eq("estado", "pendiente")
      .eq("vence", hoyMX(3));
    for (const r of (recibos ?? []) as unknown as {
      id: string;
      vence: string;
      monto: number | null;
      servicios: {
        tipo: string;
        compania: string | null;
        numero_servicio: string | null;
        quien_paga: string;
        propiedades: { nombre: string; duenos: { nombre: string; email: string | null; telefono: string | null } | null; contratos: { activo: boolean; inquilinos: { nombre: string; email: string | null; telefono: string | null } | null }[] } | null;
      } | null;
    }[]) {
      const s = r.servicios;
      const p = s?.propiedades;
      const quien = s?.quien_paga === "dueno" ? p?.duenos : s?.quien_paga === "inquilino" ? p?.contratos.find((x) => x.activo)?.inquilinos : null;
      if (!s || !p || !quien) continue;
      const servicio = etiqueta(TIPOS_SERVICIO, s.tipo);
      agregar(`servicio:${r.id}`, "servicios", quien.email, () =>
        correo(quien.email!, `${servicio} de ${p.nombre} vence el ${formatoFecha(r.vence)}`, plantilla({
          org: org.nombre,
          titulo: `${primerNombre(quien.nombre)}, recuerda pagar ${servicio.toLowerCase()}`,
          parrafos: [
            `${servicio}${s.compania ? ` (${s.compania})` : ""} de ${p.nombre} vence el ${formatoFecha(r.vence)}${r.monto != null ? ` por ${pesos.format(r.monto)}` : ""}.`,
            s.numero_servicio ? `Número de servicio: ${s.numero_servicio}.` : "",
            "Cuando lo pagues, responde a este correo con tu comprobante.",
          ].filter(Boolean),
        })), quien.telefono, () => ({ plantilla: "bk_servicio", variables: [primerNombre(quien.nombre), org.nombre, `${servicio}${s.compania ? ` (${s.compania})` : ""}`, p.nombre, formatoFecha(r.vence)] }));
    }
  }

  // Visitas de mañana: recordatorio al inquilino (correo y WhatsApp) y al proveedor (WhatsApp)
  let visitasManana = 0;
  if (activo("citas")) {
    const desde = enMX(hoyMX(1), "00:00").toISOString();
    const hasta = enMX(hoyMX(2), "00:00").toISOString();
    const { data: cs } = await db
      .from("citas")
      .select("id, inicio, proveedor_id, proveedores(nombre, telefono), propiedades(nombre, colonia, contratos(activo, inquilinos(nombre, email, telefono))), tickets(titulo, inquilinos(nombre, email, telefono))")
      .eq("organizacion_id", org.id)
      .eq("estado", "confirmada")
      .gte("inicio", desde)
      .lt("inicio", hasta);
    const lista = (cs ?? []) as unknown as {
      id: string;
      inicio: string;
      proveedor_id: string;
      proveedores: { nombre: string; telefono: string | null } | null;
      propiedades: { nombre: string; colonia: string | null; contratos: { activo: boolean; inquilinos: { nombre: string; email: string | null; telefono: string | null } | null }[] } | null;
      tickets: { titulo: string; inquilinos: { nombre: string; email: string | null; telefono: string | null } | null } | null;
    }[];
    visitasManana = lista.length;
    const { data: pts } = lista.length ? await db.from("proveedor_portal").select("proveedor_id, token").in("proveedor_id", [...new Set(lista.map((x) => x.proveedor_id))]) : { data: [] };
    const portal = new Map((pts ?? []).map((x) => [x.proveedor_id as string, x.token as string]));
    for (const v of lista) {
      const casa = v.propiedades?.nombre ?? "tu casa";
      const trabajo = v.tickets?.titulo ?? "una visita";
      const prov = v.proveedores?.nombre ?? "El proveedor";
      const cuando = fechaCita(v.inicio);
      const inq = v.tickets?.inquilinos ?? v.propiedades?.contratos.find((k) => k.activo)?.inquilinos;
      if (inq)
        agregar(`cita:${v.id}`, "citas", inq.email, () =>
          correo(inq.email!, `Mañana: visita en ${casa}`, plantilla({
            org: org.nombre,
            titulo: `${primerNombre(inq.nombre)}, mañana va ${prov}`,
            parrafos: [`${prov} irá a ${casa} el ${cuando} para atender: ${trabajo}.`, "Si ya no puedes recibirlo, responde a este correo."],
          })), inq.telefono, () => ({ plantilla: "bk_cita", variables: [primerNombre(inq.nombre), org.nombre, prov, casa, cuando, trabajo] }));
      const tel = v.proveedores?.telefono;
      if (conWA && telefonoValido(tel))
        c.push({
          clave: `cita-prov:${v.id}`,
          tipo: "citas",
          wa: { telefono: tel!, plantilla: "bk_cita_proveedor", variables: [primerNombre(prov), org.nombre, trabajo, [casa, v.propiedades?.colonia].filter(Boolean).join(", "), cuando, portal.has(v.proveedor_id) ? `${base}/pro/${portal.get(v.proveedor_id)}` : base] },
        });
    }
    if (lista.length) await db.from("citas").update({ recordatorio_at: new Date().toISOString() }).in("id", lista.map((x) => x.id)).is("recordatorio_at", null);
  }

  // Quita los que ya se mandaron
  const claves = c.map((x) => x.clave);
  const ya = new Set<string>();
  if (claves.length) {
    const { data } = await db.from("avisos_enviados").select("clave").eq("organizacion_id", org.id).in("clave", claves);
    for (const x of data ?? []) ya.add(x.clave);
  }
  let nuevos = c.filter((x) => !ya.has(x.clave));

  // Resumen para la administradora (solo si hay algo)
  if (activo("resumen") && conCorreo && responsables.length) {
    const [venc, compr, aprob, parados, porVencer, serv, polizas] = await Promise.all([
      db.from("cobros_renta").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).eq("estado", "vencido"),
      db.from("cobros_renta").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).eq("estado", "por_confirmar"),
      db.from("aprobaciones").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).is("decision", null).lt("created_at", new Date(Date.now() - 48 * 3600_000).toISOString()),
      db.from("tickets").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).not("estado", "in", "(resuelto,cancelado)").lt("updated_at", new Date(Date.now() - 72 * 3600_000).toISOString()),
      db.from("contratos").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).eq("activo", true).lte("fin", hoyMX(30)),
      db.from("recibos_servicio").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).in("estado", ["pendiente", "vencido"]).lte("vence", hoyMX(3)),
      db.from("contratos").select("id", { count: "exact", head: true }).eq("organizacion_id", org.id).eq("activo", true).gte("poliza_vence", hoy).lte("poliza_vence", hoyMX(30)),
    ]);
    const lineas = [
      [venc.count, "rentas atrasadas"],
      [compr.count, "comprobantes de pago por revisar"],
      [aprob.count, "aprobaciones de dueños sin respuesta"],
      [parados.count, "tickets sin movimiento en 3 días"],
      [porVencer.count, "contratos que terminan en 30 días"],
      [serv.count, "servicios vencidos o por vencer"],
      [polizas.error ? 0 : polizas.count, "pólizas jurídicas que vencen en 30 días"],
    ]
      .filter(([n]) => (n as number) > 0)
      .map(([n, t]) => `• ${n} ${t}`);
    if (visitasManana) lineas.push(`• Mañana hay ${visitasManana} ${visitasManana === 1 ? "visita de proveedor" : "visitas de proveedores"} agendada${visitasManana === 1 ? "" : "s"}.`);
    if (mantenimientos) lineas.push(`• Creamos ${mantenimientos} ${mantenimientos === 1 ? "ticket" : "tickets"} de mantenimiento preventivo para esta semana.`);
    if (nuevos.length) lineas.push(`• Hoy mandamos ${nuevos.length} ${nuevos.length === 1 ? "aviso" : "avisos"} por ti a inquilinos y dueños.`);
    if (lineas.length) {
      for (const email of responsables) {
        const clave = `resumen:${hoy}:${email}`;
        if (ya.has(clave)) continue;
        nuevos.push({
          clave,
          tipo: "resumen",
          correo: { para: email, asunto: `Hoy en ${org.nombre}: ${lineas.length} ${lineas.length === 1 ? "tema" : "temas"}`, html: plantilla({ org: org.nombre, titulo: "Lo que necesita tu atención hoy", parrafos: lineas, boton: { texto: "Abrir Black Key", url: `${base}/hoy` }, pie: "Puedes apagar este resumen en Ajustes" }) },
        });
      }
      const { data } = await db.from("avisos_enviados").select("clave").eq("organizacion_id", org.id).in("clave", responsables.map((e) => `resumen:${hoy}:${e}`));
      const yaRes = new Set((data ?? []).map((x) => x.clave));
      nuevos = nuevos.filter((x) => !yaRes.has(x.clave));
    }
  }

  const porTipo: Record<string, number> = {};
  if (!nuevos.length) return { org: org.nombre, enviados: 0, porTipo };
  const correos = nuevos.filter((x) => x.correo);
  const r = correos.length ? await enviarCorreos(correos.map((x) => x.correo!)) : { enviados: 0, error: undefined };
  const salieron = correos.slice(0, r.enviados).map((x) => ({ x, para: x.correo!.para, asunto: x.correo!.asunto }));
  // WhatsApp: uno por uno; si uno falla, siguen los demás y se reintenta mañana.
  let errorWA: string | undefined;
  for (const x of nuevos.filter((y) => y.wa)) {
    try {
      await enviarPlantilla(x.wa!);
      salieron.push({ x, para: x.wa!.telefono, asunto: `WhatsApp · ${AVISOS.find((a) => a.clave === x.tipo)?.texto ?? x.tipo}` });
    } catch (e) {
      errorWA = `WhatsApp: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  if (salieron.length) {
    await db.from("avisos_enviados").upsert(
      salieron.map(({ x, para, asunto }) => ({ organizacion_id: org.id, clave: x.clave, tipo: x.tipo, para, asunto })),
      { onConflict: "organizacion_id,clave", ignoreDuplicates: true },
    );
  }
  for (const { x } of salieron) porTipo[x.tipo] = (porTipo[x.tipo] ?? 0) + 1;
  return { org: org.nombre, enviados: salieron.length, porTipo, error: [r.error, errorWA].filter(Boolean).join(" · ") || undefined };
}
