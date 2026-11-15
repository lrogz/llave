// Pruebas del módulo de condominios contra una base Postgres con todas las migraciones.
// Cómo correrlas: ver pruebas/README.md  →  DATABASE_URL=postgres://… npm run test:condominios
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const URL = process.env.DATABASE_URL;
if (!URL) throw new Error("Falta DATABASE_URL (base de prueba con las migraciones aplicadas).");
const pool = new pg.Pool({ connectionString: URL, max: 6 });

// Corre fn como un usuario de Supabase: 'service_role' (servidor) o 'authenticated' (miembro con sesión).
async function como(rol, usuario, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${rol}`);
    const claims = usuario ? { sub: usuario.id, email: usuario.email, role: rol } : { role: rol };
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const r = await fn((sql, params) => c.query(sql, params));
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
const servidor = (fn) => como("service_role", null, fn);
const uno = async (q, sql, p) => (await q(sql, p)).rows[0];
const sha = (s) => createHash("sha256").update(s).digest("hex");

const yo = { id: randomUUID(), email: `admin-${Date.now()}@prueba.mx` };
const staff = { id: randomUUID(), email: `staff-${Date.now()}@prueba.mx` };
const otra = { id: randomUUID(), email: `otra-${Date.now()}@prueba.mx` };
let orgA, orgB, condA, condA2, condB;

async function abrirTurno(cond) {
  return servidor(async (q) => {
    const c = await uno(q, "select caseta_token from condominios where id = $1", [cond]);
    const g = await uno(q, "select id from guardias where condominio_id = $1 order by created_at limit 1", [cond]);
    const secreto = randomUUID();
    const r = await uno(q, "select iniciar_turno($1, $2, '1234', $3) r", [c.caseta_token, g.id, sha(secreto)]);
    assert.equal(r.r.ok, true, JSON.stringify(r.r));
    return { turno: r.r.turno_id, hash: sha(secreto) };
  });
}
async function residenteDe(cond, tipo = "propietario") {
  return servidor((q) => uno(q, "select id, token, vivienda_id from residentes where condominio_id = $1 and tipo = $2 order by created_at limit 1", [cond, tipo]));
}

before(async () => {
  const c = await pool.connect();
  try {
    for (const u of [yo, staff, otra]) await c.query("insert into auth.users (id, email) values ($1, $2)", [u.id, u.email]);
  } finally {
    c.release();
  }
  orgA = await como("authenticated", yo, async (q) => (await uno(q, "select crear_organizacion('Administradora A') id")).id);
  orgB = await como("authenticated", otra, async (q) => (await uno(q, "select crear_organizacion('Administradora B') id")).id);
  await servidor((q) => q("insert into miembros (organizacion_id, user_id, rol, email) values ($1, $2, 'staff', $3)", [orgA, staff.id, staff.email]));
  const a = await como("authenticated", yo, (q) => uno(q, "select demo_condominios($1) r", [orgA]));
  await como("authenticated", yo, (q) => q("select demo_condominios_extra($1)", [orgA]));
  await como("authenticated", yo, (q) => q("select demo_condominios_piloto($1)", [orgA]));
  [condA, condA2] = a.r.condominios;
  const b = await como("authenticated", otra, (q) => uno(q, "select demo_condominios($1) r", [orgB]));
  [condB] = b.r.condominios;
});
after(() => pool.end());

describe("Pases QR", () => {
  async function pase(token, extra = {}) {
    const d = { modalidad: "unico", desde: new Date(Date.now() - 60_000), hasta: new Date(Date.now() + 3600_000), ...extra };
    return servidor((q) =>
      uno(q, "select vecino_crear_pase($1, $2, 'visita', $3, $4, $5, $6, $7, $8, null) r", [token, "Visita prueba", d.modalidad, d.desde, d.hasta, d.dias ?? null, d.hora_desde ?? null, d.hora_hasta ?? null]),
    ).then((x) => x.r);
  }
  const escanear = (t, codigo) => servidor((q) => uno(q, "select caseta_entrada($1, $2, $3) r", [t.turno, t.hash, codigo])).then((x) => x.r);

  test("válido: entra y queda en la bitácora con guardia y quién autorizó", async () => {
    const res = await residenteDe(condA);
    const t = await abrirTurno(condA);
    const p = await pase(res.token);
    const r = await escanear(t, p.codigo);
    assert.equal(r.ok, true);
    const acc = await servidor((q) => uno(q, "select tipo, metodo, autorizo, guardia_id from accesos where id = $1", [r.acceso_id]));
    assert.equal(acc.tipo, "entrada");
    assert.equal(acc.metodo, "qr");
    assert.match(acc.autorizo, /pase QR/);
    assert.ok(acc.guardia_id);
    // Salida: solo una vez
    const s1 = await servidor((q) => uno(q, "select caseta_salida($1, $2, $3) r", [t.turno, t.hash, r.acceso_id]));
    const s2 = await servidor((q) => uno(q, "select caseta_salida($1, $2, $3) r", [t.turno, t.hash, r.acceso_id]));
    assert.equal(s1.r.ok, true);
    assert.equal(s2.r.motivo, "ya_salio");
  });

  test("expirado y aún no vigente se rechazan", async () => {
    const res = await residenteDe(condA);
    const t = await abrirTurno(condA);
    const p = await pase(res.token, { desde: new Date(Date.now() + 3600_000), hasta: new Date(Date.now() + 7200_000) });
    assert.equal((await escanear(t, p.codigo)).motivo, "aun_no_vigente");
    // Vencido: se crea vigente y se recorre la fecha en la base.
    const p2 = await pase(res.token);
    await servidor((q) => q("update pases set desde = now() - interval '2 hours', hasta = now() - interval '1 hour' where id = $1", [p2.id]));
    assert.equal((await escanear(t, p2.codigo)).motivo, "vencido");
  });

  test("cancelado se rechaza", async () => {
    const res = await residenteDe(condA);
    const t = await abrirTurno(condA);
    const p = await pase(res.token);
    await servidor((q) => q("select vecino_cancelar_pase($1, $2)", [res.token, p.id]));
    assert.equal((await escanear(t, p.codigo)).motivo, "cancelado");
  });

  test("doble escaneo simultáneo de un QR de un solo uso: solo una entrada", async () => {
    const res = await residenteDe(condA);
    const t = await abrirTurno(condA);
    const p = await pase(res.token);
    const resultados = await Promise.all(Array.from({ length: 5 }, () => escanear(t, p.codigo)));
    assert.equal(resultados.filter((r) => r.ok).length, 1, JSON.stringify(resultados));
    assert.ok(resultados.filter((r) => !r.ok).every((r) => r.motivo === "ya_usado"));
    const n = await servidor((q) => uno(q, "select count(*)::int n from accesos where pase_id = $1", [p.id]));
    assert.equal(n.n, 1);
  });

  test("un QR de otro condominio (misma administradora) no sirve en esta caseta", async () => {
    const res = await residenteDe(condA2);
    const t = await abrirTurno(condA);
    const p = await pase(res.token);
    assert.equal((await escanear(t, p.codigo)).motivo, "no_existe");
  });

  test("recurrente fuera de horario se rechaza", async () => {
    const res = await residenteDe(condA);
    const t = await abrirTurno(condA);
    const p = await pase(res.token, { modalidad: "recurrente", hasta: new Date(Date.now() + 30 * 86400_000), dias: [1, 2, 3, 4, 5, 6, 7], hora_desde: "00:00", hora_hasta: "00:01" });
    const hora = await servidor((q) => uno(q, "select (now() at time zone 'America/Mexico_City')::time > '00:01' tarde"));
    if (hora.tarde) assert.equal((await escanear(t, p.codigo)).motivo, "fuera_de_horario");
  });

  test("un dispositivo sin el secreto del turno no puede escanear", async () => {
    const res = await residenteDe(condA);
    const t = await abrirTurno(condA);
    const p = await pase(res.token);
    await assert.rejects(escanear({ turno: t.turno, hash: sha("otro") }, p.codigo), /turno_invalido/);
  });
});

describe("Entrega de turno", () => {
  test("lo pendiente del turno saliente aparece al turno entrante", async () => {
    const res = await residenteDe(condA);
    const t1 = await abrirTurno(condA);
    await servidor((q) => q("select vecino_mensaje($1, 'Va a llegar un técnico de internet')", [res.token]));
    const paquete = await servidor((q) => uno(q, "select caseta_paquete($1, $2, $3, 'DHL', 'Sobre') id", [t1.turno, t1.hash, res.vivienda_id]));
    await servidor((q) => q("select caseta_manual($1, $2, $3, 'entrada', 'Plomero Juan', null, 'Llamada a la casa', 'manual', now(), $4)", [t1.turno, t1.hash, res.vivienda_id, randomUUID()]));
    const e = await servidor((q) => uno(q, "select cerrar_turno($1, $2, 'Portón 2 se atora') e", [t1.turno, t1.hash]));
    assert.ok(e.e.chats_pendientes.some((c) => c.vivienda_id === res.vivienda_id));
    assert.ok(e.e.paquetes.some((k) => k.id === paquete.id));
    assert.ok(e.e.dentro.some((d) => d.visitante === "Plomero Juan"));

    const t2 = await abrirTurno(condA);
    const d = await servidor((q) => uno(q, "select caseta_datos($1, $2) d", [t2.turno, t2.hash]));
    assert.equal(d.d.entrega.turno_anterior.notas, "Portón 2 se atora");
    assert.ok(d.d.entrega.chats_pendientes.some((c) => c.vivienda_id === res.vivienda_id));
    assert.ok(d.d.entrega.paquetes.some((k) => k.id === paquete.id));
    // El turno anterior ya no puede operar
    await assert.rejects(servidor((q) => q("select caseta_datos($1, $2)", [t1.turno, t1.hash])), /turno_invalido/);
  });

  test("registro sin conexión reenviado no se duplica y queda para revisión", async () => {
    const res = await residenteDe(condA);
    const t = await abrirTurno(condA);
    const ref = randomUUID();
    for (let i = 0; i < 3; i++)
      await servidor((q) => q("select caseta_manual($1, $2, $3, 'entrada', 'Sin señal', null, 'Interfón', 'sin_conexion', now() - interval '5 minutes', $4)", [t.turno, t.hash, res.vivienda_id, ref]));
    const n = await servidor((q) => uno(q, "select count(*)::int n, min(revision) rev from accesos where ref_cliente = $1", [ref]));
    assert.equal(n.n, 1);
    assert.equal(n.rev, "pendiente");
  });
});

describe("Reportes y quejas", () => {
  test("queja privada: la ve la admin, no el staff ni el comité; el vecino la reabre con historial", async () => {
    const res = await residenteDe(condA);
    const t = await servidor((q) => uno(q, "select vecino_crear_reporte($1, 'otro', 'Ruido de vecino a las 3 am', 'Detalle privado', null, true) r", [res.token]));
    const id = t.r.id;
    const admin = await como("authenticated", yo, (q) => q("select id from tickets where id = $1", [id]));
    const deStaff = await como("authenticated", staff, (q) => q("select id from tickets where id = $1", [id]));
    assert.equal(admin.rowCount, 1);
    assert.equal(deStaff.rowCount, 0);
    const comite = await servidor(async (q) => {
      const c = await uno(q, "select comite_token from condominios where id = $1", [condA]);
      return uno(q, "select comite_datos($1, now()::date) d", [c.comite_token]);
    });
    assert.ok(!JSON.stringify(comite.d).includes("Ruido de vecino"));
    assert.ok(comite.d.reportes.some((r) => r.titulo === "Queja privada"));

    await como("authenticated", yo, (q) => q("update tickets set responsable = 'Comité de convivencia', fecha_compromiso = current_date + 3 where id = $1", [id]));
    await como("authenticated", yo, (q) => q("update tickets set estado = 'resuelto', resuelto_at = now(), resolucion = 'Se habló con el vecino' where id = $1", [id]));
    await servidor((q) => q("select vecino_reabrir($1, $2, 'Volvió a pasar anoche')", [res.token, id]));
    const h = await servidor((q) => q("select a_estado, nota, actor from ticket_historial where ticket_id = $1 order by created_at", [id]));
    const notas = h.rows.map((r) => r.nota ?? "").join(" | ");
    assert.match(notas, /Responsable: Comité de convivencia/);
    assert.match(notas, /Reabierto por el vecino/);
    assert.equal(h.rows.at(-1).a_estado, "reportado");
    // Otro residente no puede reabrir ni ver reportes ajenos
    const otro = await servidor((q) => uno(q, "select token from residentes where condominio_id = $1 and id <> $2 limit 1", [condA, res.id]));
    const vd = await servidor((q) => uno(q, "select vecino_datos($1) d", [otro.token]));
    assert.ok(!vd.d.reportes.some((r) => r.id === id));
  });
});

describe("Saldos y pagos", () => {
  test("saldo con varios cargos, saldo inicial, ajuste y pagos (solo cuentan los confirmados)", async () => {
    const v = await servidor((q) => uno(q, "insert into viviendas (organizacion_id, condominio_id, numero) values ($1, $2, 'Casa prueba 900') returning id", [orgA, condA]));
    await como("authenticated", yo, async (q) => {
      await q("insert into cargos_condominio (organizacion_id, condominio_id, vivienda_id, concepto, periodo, monto_centavos) values ($1,$2,$3,'mantenimiento','2026-10-01',120000), ($1,$2,$3,'mantenimiento','2026-11-01',120000), ($1,$2,$3,'agua','2026-11-01',25050)", [orgA, condA, v.id]);
      await q("insert into ajustes_saldo (organizacion_id, condominio_id, vivienda_id, monto_centavos, tipo, motivo) values ($1,$2,$3,50000,'saldo_inicial','Adeudo anterior'), ($1,$2,$3,-10000,'ajuste','Bonificación por obra')", [orgA, condA, v.id]);
      const p1 = await uno(q, "insert into pagos_condominio (organizacion_id, condominio_id, vivienda_id, monto_centavos, pagado_el, registrado_por) values ($1,$2,$3,120000,'2026-10-05','prueba') returning id", [orgA, condA, v.id]);
      await q("insert into pagos_condominio (organizacion_id, condominio_id, vivienda_id, monto_centavos, pagado_el, registrado_por) values ($1,$2,$3,99999,'2026-11-05','prueba')", [orgA, condA, v.id]);
      await q("select confirmar_pago_condominio($1)", [p1.id]);
    });
    const s = await como("authenticated", yo, (q) => uno(q, "select saldo_centavos::bigint s from saldos_vivienda where vivienda_id = $1", [v.id]));
    // 120000 + 120000 + 25050 + 50000 − 10000 − 120000 (el pendiente no cuenta)
    assert.equal(Number(s.s), 185050);
  });

  test("reintentar la confirmación de un pago no duplica recibo ni saldo", async () => {
    const res = await residenteDe(condA);
    const clave = randomUUID();
    const p1 = await servidor((q) => uno(q, "select vecino_registrar_pago($1, 50000, 'SPEI 1', current_date, null, $2) r", [res.token, clave]));
    const p2 = await servidor((q) => uno(q, "select vecino_registrar_pago($1, 50000, 'SPEI 1', current_date, null, $2) r", [res.token, clave]));
    assert.equal(p1.r.id, p2.r.id);
    assert.equal(p2.r.repetido, true);
    const antes = await servidor((q) => uno(q, "select saldo_centavos::bigint s from saldos_vivienda where vivienda_id = $1", [res.vivienda_id]));
    const [c1, c2] = await Promise.all([1, 2].map(() => como("authenticated", yo, (q) => uno(q, "select confirmar_pago_condominio($1) r", [p1.r.id]))));
    assert.equal(c1.r.folio, c2.r.folio);
    assert.equal([c1.r.repetido, c2.r.repetido].filter(Boolean).length, 1);
    const despues = await servidor((q) => uno(q, "select saldo_centavos::bigint s from saldos_vivienda where vivienda_id = $1", [res.vivienda_id]));
    assert.equal(Number(antes.s) - Number(despues.s), 50000);
    const audit = await servidor((q) => uno(q, "select count(*)::int n from bitacora_condominio where entidad = 'pagos_condominio' and entidad_id = $1 and accion = 'update'", [p1.r.id]));
    assert.equal(audit.n, 1);
  });

  test("cargar la cuota dos veces no duplica cargos", async () => {
    const n1 = await como("authenticated", yo, (q) => uno(q, "select cargar_cuota($1, 'mantenimiento', '2027-01-01', 120000, '2027-01-10') n", [condA]));
    const n2 = await como("authenticated", yo, (q) => uno(q, "select cargar_cuota($1, 'mantenimiento', '2027-01-15', 120000, '2027-01-10') n", [condA]));
    assert.ok(n1.n > 0);
    assert.equal(n2.n, 0);
  });
});

describe("Permisos y aislamiento", () => {
  test("inquilino sin permiso no ve el estado de cuenta ni registra pagos", async () => {
    const inq = await residenteDe(condA, "inquilino");
    const d = await servidor((q) => uno(q, "select vecino_datos($1) d", [inq.token]));
    assert.equal(d.d.permisos.ver_cuenta, false);
    assert.equal(d.d.cuenta, undefined);
    await assert.rejects(servidor((q) => q("select vecino_registrar_pago($1, 100, null, current_date, null, $2)", [inq.token, randomUUID()])), /sin_permiso/);
  });

  test("el residente solo ve su vivienda y su condominio", async () => {
    const res = await residenteDe(condA);
    const d = await servidor((q) => uno(q, "select vecino_datos($1) d", [res.token]));
    const ids = await servidor((q) => q("select id from pases where vivienda_id <> $1", [res.vivienda_id]));
    const texto = JSON.stringify(d.d);
    assert.ok(ids.rows.every((r) => !texto.includes(r.id)));
    assert.ok(!texto.includes("Torres Alamar"));
    assert.ok(!texto.includes("Administradora B"));
  });

  test("la caseta ve accesos y viviendas pero nada de dinero ni quejas, y solo de su condominio", async () => {
    const t = await abrirTurno(condA);
    const d = await servidor((q) => uno(q, "select caseta_datos($1, $2) d", [t.turno, t.hash]));
    const texto = JSON.stringify(d.d);
    assert.ok(!/saldo|monto|centavos|Ruido de vecino/i.test(texto));
    const otroIds = new Set((await servidor((q) => q("select id from viviendas where condominio_id <> $1", [condA]))).rows.map((r) => r.id));
    assert.ok(d.d.viviendas.every((v) => !otroIds.has(v.id)));
    // Mandar un mensaje a una vivienda de otro condominio falla
    const ajena = await servidor((q) => uno(q, "select id from viviendas where condominio_id = $1 limit 1", [condB]));
    await assert.rejects(servidor((q) => q("select caseta_mensaje($1, $2, $3, 'hola')", [t.turno, t.hash, ajena.id])), /no pertenece/);
  });

  test("una administradora no ve ni toca los condominios de otra", async () => {
    const vistos = await como("authenticated", otra, (q) => q("select id from condominios"));
    assert.ok(!vistos.rows.some((r) => r.id === condA));
    const saldos = await como("authenticated", otra, (q) => q("select vivienda_id from saldos_vivienda where condominio_id = $1", [condA]));
    assert.equal(saldos.rowCount, 0);
    await assert.rejects(como("authenticated", otra, (q) => q("select reporte_condominio($1, now()::date)", [condA])), /Sin permiso/);
    await assert.rejects(como("authenticated", otra, (q) => q("insert into viviendas (organizacion_id, condominio_id, numero) values ($1, $2, 'X')", [orgB, condA])), /no pertenece|row-level/);
  });

  test("los links no se pueden usar desde el navegador (anon) ni con sesión", async () => {
    const res = await residenteDe(condA);
    await assert.rejects(como("anon", null, (q) => q("select vecino_datos($1)", [res.token])), /permission denied/);
    await assert.rejects(como("authenticated", yo, (q) => q("select vecino_datos($1)", [res.token])), /permission denied/);
    await assert.rejects(como("authenticated", yo, (q) => q("select * from guardias_pin")), /permission denied/);
  });
});

describe("Alta de residentes y personal doméstico", () => {
  test("alta con INE y selfie: al aprobar se crea el residente y se borran las fotos", async () => {
    const c = await servidor((q) => uno(q, "select alta_token, organizacion_id from condominios where id = $1", [condA]));
    const viv = await servidor((q) => uno(q, "select id from viviendas where condominio_id = $1 order by numero desc limit 1", [condA]));
    const carpeta = `${c.organizacion_id}/condominios/${condA}/altas/`;
    // Una vivienda de otro condominio no se acepta
    const ajena = await servidor((q) => uno(q, "select id from viviendas where condominio_id = $1 limit 1", [condA2]));
    await assert.rejects(servidor((q) => q("select alta_crear($1, $2, 'Nueva Vecina', '4420001111', null, 'propietario', $3, $4, $5, false)", [c.alta_token, ajena.id, carpeta + "a.jpg", carpeta + "b.jpg", carpeta + "c.jpg"])), /Elige tu vivienda/);
    // Rutas fuera de la carpeta del condominio no se aceptan
    await assert.rejects(servidor((q) => q("select alta_crear($1, $2, 'Nueva Vecina', '4420001111', null, 'propietario', 'otra/a.jpg', 'otra/b.jpg', null, true)", [c.alta_token, viv.id])), /INE/);
    const s = await servidor((q) => uno(q, "select alta_crear($1, $2, 'Nueva Vecina', '4420001111', null, 'inquilino', $3, $4, $5, false) id", [c.alta_token, viv.id, carpeta + "a.jpg", carpeta + "b.jpg", carpeta + "c.jpg"]));
    const d = await como("authenticated", yo, (q) => uno(q, "select decidir_alta($1, true, null) d", [s.id]));
    assert.equal(d.d.borrar.length, 3);
    assert.ok(d.d.token);
    const fila = await servidor((q) => uno(q, "select estado, ine_frente_path, selfie_path, residente_id from solicitudes_alta where id = $1", [s.id]));
    assert.equal(fila.estado, "aprobada");
    assert.equal(fila.ine_frente_path, null);
    assert.equal(fila.selfie_path, null);
    const r = await servidor((q) => uno(q, "select tipo, vivienda_id from residentes where id = $1", [fila.residente_id]));
    assert.equal(r.tipo, "inquilino");
    await assert.rejects(como("authenticated", yo, (q) => q("select decidir_alta($1, true, null)", [s.id])), /ya se revisó/);
  });

  test("personal doméstico recurrente: caseta lo registra desde la lista y respeta el horario", async () => {
    const res = await residenteDe(condA);
    const p = await servidor((q) =>
      uno(q, "select vecino_crear_pase($1, 'María López', 'servicio', 'recurrente', now() - interval '1 minute', now() + interval '90 days', array[1,2,3,4,5,6,7]::smallint[], '00:00', '23:59', null, 'Limpieza', 'lista') r", [res.token]),
    );
    const t = await abrirTurno(condA);
    const d = await servidor((q) => uno(q, "select caseta_datos($1, $2) d", [t.turno, t.hash]));
    assert.ok(d.d.autorizados_hoy.some((a) => a.id === p.r.id && a.servicio === "Limpieza"));
    const e1 = await servidor((q) => uno(q, "select caseta_entrada_pase($1, $2, $3) r", [t.turno, t.hash, p.r.id]));
    const e2 = await servidor((q) => uno(q, "select caseta_entrada_pase($1, $2, $3) r", [t.turno, t.hash, p.r.id]));
    assert.equal(e1.r.ok, true);
    assert.equal(e2.r.ok, true, "recurrente: puede entrar más de una vez dentro del horario");
    // Un pase de otro condominio no se puede registrar desde esta caseta
    const otro = await residenteDe(condA2);
    const p2 = await servidor((q) => uno(q, "select vecino_crear_pase($1, 'Jardinero', 'servicio', 'recurrente', now(), now() + interval '9 days', null, null, null, null, 'Jardinería', 'lista') r", [otro.token]));
    const e3 = await servidor((q) => uno(q, "select caseta_entrada_pase($1, $2, $3) r", [t.turno, t.hash, p2.r.id]));
    assert.equal(e3.r.motivo, "no_existe");
  });
});

describe("Amenidades y mudanzas", () => {
  // Mañana a las 10:00 (CDMX), para no depender de la hora en que corre la prueba.
  const manana = (h = 10) => {
    const d = new Date(Date.now() + 86400_000).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
    return `${d}T${String(h).padStart(2, "0")}:00:00-06:00`;
  };

  test("gimnasio: el último lugar no se lo llevan dos; quien no alcanza queda en espera y se le ofrece al cancelarse otro", async () => {
    const gym = await servidor((q) => uno(q, "select id from amenidades where condominio_id = $1 and tipo = 'gimnasio'", [condA]));
    await servidor((q) => q("update amenidades set capacidad = 1 where id = $1", [gym.id]));
    const vecinos = (await servidor((q) => q("select distinct on (vivienda_id) token from residentes where condominio_id = $1 and tipo = 'propietario' limit 3", [condA]))).rows;
    const rs = await Promise.all(vecinos.map((v) => servidor((q) => uno(q, "select vecino_reservar($1, $2, $3, 60, 1) r", [v.token, gym.id, manana(7)]))));
    assert.equal(rs.filter((x) => x.r.estado === "confirmada").length, 1);
    assert.equal(rs.filter((x) => x.r.estado === "espera").length, 2);
    const i = rs.findIndex((x) => x.r.estado === "confirmada");
    await servidor((q) => q("select vecino_cancelar_reserva($1, $2)", [vecinos[i].token, rs[i].r.id]));
    const ahora = await servidor((q) => q("select id, estado from reservas where id = any($1)", [rs.map((x) => x.r.id)]));
    const ofrecida = ahora.rows.find((x) => x.estado === "ofrecida");
    assert.ok(ofrecida, "el primero en espera recibe la oferta");
    assert.equal(ahora.rows.filter((x) => x.estado === "espera").length, 1);
    // Acepta la oferta → confirmada
    const quien = vecinos[rs.findIndex((x) => x.r.id === ofrecida.id)];
    await servidor((q) => q("select vecino_responder_oferta($1, $2, true)", [quien.token, ofrecida.id]));
    assert.equal((await servidor((q) => uno(q, "select estado from reservas where id = $1", [ofrecida.id]))).estado, "confirmada");
  });

  test("salón: al aprobar se cargan renta y depósito; al devolver el depósito el saldo baja", async () => {
    const salon = await servidor((q) => uno(q, "select id from amenidades where condominio_id = $1 and tipo = 'salon'", [condA]));
    const res = await residenteDe(condA);
    const r = await servidor((q) => uno(q, "select vecino_reservar($1, $2, $3, 240, 40) r", [res.token, salon.id, manana(16)]));
    assert.equal(r.r.estado, "solicitada");
    // Nadie más puede apartar el mismo horario mientras está solicitada
    const otro = await servidor((q) => uno(q, "select token from residentes where condominio_id = $1 and vivienda_id <> $2 limit 1", [condA, res.vivienda_id]));
    await assert.rejects(servidor((q) => q("select vecino_reservar($1, $2, $3, 240, 10)", [otro.token, salon.id, manana(18)])), /ya está apartado/);
    const saldo = async () => Number((await servidor((q) => uno(q, "select saldo_centavos s from saldos_vivienda where vivienda_id = $1", [res.vivienda_id]))).s);
    const s0 = await saldo();
    await como("authenticated", yo, (q) => q("select decidir_reserva($1, true, null)", [r.r.id]));
    assert.equal((await saldo()) - s0, 350000);
    await como("authenticated", yo, (q) => q("select cerrar_deposito($1, true, null)", [r.r.id]));
    assert.equal((await saldo()) - s0, 250000);
    await assert.rejects(como("authenticated", yo, (q) => q("select cerrar_deposito($1, true, null)", [r.r.id])), /ya se cerró/);
  });

  test("mudanza: al aprobar crea su pase y no se cruza con otra que usa el elevador", async () => {
    const [a, b] = (await servidor((q) => q("select distinct on (vivienda_id) token from residentes where condominio_id = $1 limit 2", [condA2]))).rows;
    const m1 = await servidor((q) => uno(q, "select vecino_solicitar_mudanza($1, 'entrada', $2, $3, 'Mudanzas del Centro', 'ABC-123', array['elevador','zona_carga']) id", [a.token, manana(9), manana(12)]));
    const m2 = await servidor((q) => uno(q, "select vecino_solicitar_mudanza($1, 'salida', $2, $3, 'Fletes Rápidos', null, array['elevador']) id", [b.token, manana(11), manana(13)]));
    await como("authenticated", yo, (q) => q("select decidir_mudanza($1, true, null)", [m1.id]));
    await assert.rejects(como("authenticated", yo, (q) => q("select decidir_mudanza($1, true, null)", [m2.id])), /Choca/);
    const p = await servidor((q) => uno(q, "select p.visitante, p.placa, p.modalidad from mudanzas m join pases p on p.id = m.pase_id where m.id = $1", [m1.id]));
    assert.equal(p.visitante, "Mudanzas del Centro");
    assert.equal(p.modalidad, "recurrente");
  });
});

describe("Seguridad: vetados, fotos, placas, timbre, rondines y PIN de entrega", () => {
  const pase = (token, visitante, placa = null) =>
    servidor((q) => uno(q, "select vecino_crear_pase($1, $2, 'visita', 'unico', now() - interval '1 minute', now() + interval '2 hours', null, null, null, $3) r", [token, visitante, placa])).then((x) => x.r);

  test("vetado: con pase QR no entra y se genera alerta; manual en línea se bloquea; sin conexión se registra con alerta", async () => {
    const res = await residenteDe(condA);
    const t = await abrirTurno(condA);
    const p = await pase(res.token, "Juan Ejemplo Vetado");
    const r = await servidor((q) => uno(q, "select caseta_entrada($1, $2, $3) r", [t.turno, t.hash, p.codigo]));
    assert.equal(r.r.motivo, "vetado");
    const usos = await servidor((q) => uno(q, "select usos from pases where id = $1", [p.id]));
    assert.equal(usos.usos, 0);
    const m = await servidor((q) => uno(q, "select caseta_manual($1, $2, $3, 'entrada', 'juan ejemplo vetado', null, 'Interfón', 'manual', now(), $4) r", [t.turno, t.hash, res.vivienda_id, randomUUID()]));
    assert.equal(m.r.motivo, "vetado");
    const o = await servidor((q) => uno(q, "select caseta_manual($1, $2, $3, 'entrada', 'Juan Ejemplo Vetado', null, 'Interfón', 'sin_conexion', now(), $4) r", [t.turno, t.hash, res.vivienda_id, randomUUID()]));
    assert.equal(o.r.ok, true);
    assert.equal(o.r.alerta, true);
    const n = await servidor((q) => uno(q, "select count(*)::int n from alertas_condominio where condominio_id = $1 and tipo = 'vetado'", [condA]));
    assert.ok(n.n >= 3);
  });

  test("foto de la entrada: solo rutas del propio condominio", async () => {
    const res = await residenteDe(condA);
    const t = await abrirTurno(condA);
    const p = await pase(res.token, "Visita con foto");
    const e = await servidor((q) => uno(q, "select caseta_entrada($1, $2, $3) r", [t.turno, t.hash, p.codigo]));
    const c = await servidor((q) => uno(q, "select organizacion_id from condominios where id = $1", [condA]));
    await assert.rejects(servidor((q) => q("select caseta_foto_acceso($1, $2, $3, 'otra/ruta.jpg')", [t.turno, t.hash, e.r.acceso_id])), /no válida/);
    await servidor((q) => q("select caseta_foto_acceso($1, $2, $3, $4)", [t.turno, t.hash, e.r.acceso_id, `${c.organizacion_id}/condominios/${condA}/accesos/x.jpg`]));
    const f = await servidor((q) => uno(q, "select foto_path from accesos where id = $1", [e.r.acceso_id]));
    assert.match(f.foto_path, /accesos\/x\.jpg$/);
  });

  test("placas: residente abre, visita con pase abre y consume el pase, desconocida y vetada no abren", async () => {
    const c = await servidor((q) => uno(q, "select lpr_token from condominios where id = $1", [condA]));
    const veh = await servidor((q) => uno(q, "select placa from vehiculos where condominio_id = $1 limit 1", [condA]));
    const lpr = (placa) => servidor((q) => uno(q, "select lpr_evento($1, $2, 'entrada 1') r", [c.lpr_token, placa])).then((x) => x.r);
    assert.equal((await lpr(veh.placa.toLowerCase().replace(/(\d)/, "-$1"))).resultado, "residente");
    const res = await residenteDe(condA);
    const p = await pase(res.token, "Visita en auto", "QRT-456-B");
    const v = await lpr("QRT456B");
    assert.equal(v.abrir, true);
    assert.equal(v.resultado, "visita");
    const u = await servidor((q) => uno(q, "select usos from pases where id = $1", [p.id]));
    assert.equal(u.usos, 1);
    assert.equal((await lpr("ZZZ111")).abrir, false);
    assert.equal((await lpr("XYZ999A")).resultado, "vetado");
    await assert.rejects(servidor((q) => q("select lpr_evento('MALO', 'ABC123', null)")), /link_invalido/);
  });

  test("timbre: la visita avisa, el residente autoriza y la caseta registra con el pase de 30 minutos", async () => {
    const c = await servidor((q) => uno(q, "select timbre_token from condominios where id = $1", [condA]));
    const res = await residenteDe(condA);
    const l = await servidor((q) => uno(q, "select timbre_llamar($1, $2, 'Repartidor Rappi', 'Comida', null) r", [c.timbre_token, res.vivienda_id]));
    let e = await servidor((q) => uno(q, "select timbre_estado($1) r", [l.r.token]));
    assert.equal(e.r.estado, "esperando");
    await servidor((q) => q("select vecino_responder_timbre($1, $2, true)", [res.token, l.r.id]));
    e = await servidor((q) => uno(q, "select timbre_estado($1) r", [l.r.token]));
    assert.equal(e.r.estado, "autorizada");
    assert.ok(e.r.codigo);
    const t = await abrirTurno(condA);
    const r = await servidor((q) => uno(q, "select caseta_entrada($1, $2, $3) r", [t.turno, t.hash, e.r.codigo]));
    assert.equal(r.r.ok, true);
    // Otro residente no puede responder un timbre ajeno
    const otro = await servidor((q) => uno(q, "select token from residentes where condominio_id = $1 and vivienda_id <> $2 limit 1", [condA, res.vivienda_id]));
    const l2 = await servidor((q) => uno(q, "select timbre_llamar($1, $2, 'Otra visita', null, null) r", [c.timbre_token, res.vivienda_id]));
    await assert.rejects(servidor((q) => q("select vecino_responder_timbre($1, $2, true)", [otro.token, l2.r.id])), /No encontramos/);
    await servidor((q) => q("select timbre_llamar($1, $2, 'Tercera', null, null)", [c.timbre_token, res.vivienda_id]));
    await assert.rejects(servidor((q) => q("select timbre_llamar($1, $2, 'Cuarta', null, null)", [c.timbre_token, res.vivienda_id])), /Ya se avisó/);
  });

  test("rondín: marca puntos del propio condominio y aparecen en el turno", async () => {
    const t = await abrirTurno(condA);
    const punto = await servidor((q) => uno(q, "select codigo from puntos_rondin where condominio_id = $1 order by orden limit 1", [condA]));
    const ajeno = await servidor((q) => uno(q, "select codigo from puntos_rondin where condominio_id = $1 limit 1", [condA2]));
    assert.equal((await servidor((q) => uno(q, "select caseta_marcar_punto($1, $2, $3, null) r", [t.turno, t.hash, punto.codigo]))).r.ok, true);
    assert.equal((await servidor((q) => uno(q, "select caseta_marcar_punto($1, $2, $3, null) r", [t.turno, t.hash, ajeno.codigo]))).r.motivo, "punto_invalido");
    const x = await servidor((q) => uno(q, "select caseta_extra($1, $2) r", [t.turno, t.hash]));
    assert.equal(x.r.rondin.find((p) => p.en_mi_turno > 0)?.en_mi_turno, 1);
  });

  test("PIN de entrega: registra el paquete una sola vez y se bloquea tras 10 intentos fallidos", async () => {
    const res = await residenteDe(condA2);
    const p = await servidor((q) => uno(q, "select vecino_crear_pin($1, 'Amazon', 3) r", [res.token]));
    const u1 = await servidor((q) => uno(q, "select usar_pin_entrega($1, $2, null, 'Amazon') r", [condA2, p.r.pin]));
    assert.equal(u1.r.ok, true);
    const paq = await servidor((q) => uno(q, "select vivienda_id from paquetes where id = $1", [u1.r.paquete_id]));
    assert.equal(paq.vivienda_id, res.vivienda_id);
    assert.equal((await servidor((q) => uno(q, "select usar_pin_entrega($1, $2, null, null) r", [condA2, p.r.pin]))).r.motivo, "pin_invalido");
    const p2 = await servidor((q) => uno(q, "select vecino_crear_pin($1, null, 3) r", [res.token]));
    for (let i = 0; i < 9; i++) await servidor((q) => q("select usar_pin_entrega($1, '000000', null, null)", [condA2]));
    assert.equal((await servidor((q) => uno(q, "select usar_pin_entrega($1, $2, null, null) r", [condA2, p2.r.pin]))).r.motivo, "bloqueado");
    // Un PIN de otro condominio no sirve aquí
    assert.notEqual((await servidor((q) => uno(q, "select usar_pin_entrega($1, $2, null, null) r", [condA, p2.r.pin]))).r.ok, true);
  });
});

describe("Comunidad: votaciones, tablero y documentos", () => {
  test("un voto por vivienda; el inquilino no vota si es solo para propietarios; resultados", async () => {
    const v = await servidor((q) => uno(q, "select id from votaciones where condominio_id = $1 limit 1", [condA]));
    const prop = await residenteDe(condA);
    const inq = await residenteDe(condA, "inquilino");
    await servidor((q) => q("select vecino_votar($1, $2, 0)", [prop.token, v.id]));
    await assert.rejects(servidor((q) => q("select vecino_votar($1, $2, 1)", [prop.token, v.id])), /ya votó/);
    await assert.rejects(servidor((q) => q("select vecino_votar($1, $2, 1)", [inq.token, v.id])), /propietario/);
    await assert.rejects(servidor((q) => q("select vecino_votar($1, $2, 7)", [prop.token, v.id])), /Opción no válida/);
    const r = await servidor((q) => uno(q, "select resultados_votacion($1) r", [v.id]));
    assert.equal(r.r.opciones[0].votos, 1);
    assert.ok(Number(r.r.opciones[0].indiviso) > 0);
    const d = await servidor((q) => uno(q, "select vecino_comunidad($1) d", [prop.token]));
    assert.equal(d.d.votaciones.find((x) => x.id === v.id).mi_voto, 0);
  });

  test("tablero: publica, responde otro vecino, y solo el autor la oculta; documentos ocultos no se entregan", async () => {
    const [a, b] = (await servidor((q) => q("select distinct on (vivienda_id) token from residentes where condominio_id = $1 limit 2", [condA]))).rows;
    await servidor((q) => q("select vecino_publicar($1, 'perdido', 'Se perdió Firulais', 'Perro café, collar rojo')", [a.token]));
    const pub = await servidor((q) => uno(q, "select id from tablero where titulo = 'Se perdió Firulais'"));
    await servidor((q) => q("select vecino_responder($1, $2, 'Lo vi en la casa club')", [b.token, pub.id]));
    await servidor((q) => q("select vecino_borrar_publicacion($1, $2)", [b.token, pub.id]));
    let d = await servidor((q) => uno(q, "select vecino_comunidad($1) d", [a.token]));
    const t = d.d.tablero.find((x) => x.id === pub.id);
    assert.equal(t.respuestas.length, 1);
    assert.ok(!JSON.stringify(t).match(/442 /), "no expone teléfonos");
    await servidor((q) => q("select vecino_borrar_publicacion($1, $2)", [a.token, pub.id]));
    d = await servidor((q) => uno(q, "select vecino_comunidad($1) d", [a.token]));
    assert.ok(!d.d.tablero.some((x) => x.id === pub.id));
    const doc = await servidor((q) => uno(q, "insert into documentos_condominio (organizacion_id, condominio_id, titulo, storage_path, visible_residentes) values ($1, $2, 'Contrato vigilancia', 'x/y.pdf', false) returning id", [orgA, condA]));
    const p = await servidor((q) => uno(q, "select vecino_documento($1, $2) p", [a.token, doc.id]));
    assert.equal(p.p, null);
  });
});

describe("Conciliación bancaria", () => {
  test("empata un depósito con el pago por revisar y crea el pago de otro por la vivienda en el concepto; repetir no duplica", async () => {
    const res = await residenteDe(condA2);
    const viv = await servidor((q) => uno(q, "select numero from viviendas where id = $1", [res.vivienda_id]));
    const pendiente = await servidor((q) => uno(q, "select vecino_registrar_pago($1, 180000, 'SPEI 5', current_date, null, $2) r", [res.token, randomUUID()]));
    const otra = await servidor((q) => uno(q, "select id, numero from viviendas where condominio_id = $1 and id <> $2 order by numero desc limit 1", [condA2, res.vivienda_id]));
    const [m1, m2] = await como("authenticated", yo, async (q) => [
      await uno(q, "insert into movimientos_banco (organizacion_id, condominio_id, fecha, descripcion, monto_centavos, huella) values ($1,$2,current_date,'SPEI RECIBIDO',180000,$3) returning id", [orgA, condA2, randomUUID()]),
      await uno(q, `insert into movimientos_banco (organizacion_id, condominio_id, fecha, descripcion, monto_centavos, huella) values ($1,$2,current_date,'PAGO CUOTA ${otra.numero}',150000,$3) returning id`, [orgA, condA2, randomUUID()]),
    ]);
    const sug = await como("authenticated", yo, (q) => q("select * from sugerencias_conciliacion($1)", [condA2]));
    const s1 = sug.rows.find((x) => x.movimiento_id === m1.id);
    const s2 = sug.rows.find((x) => x.movimiento_id === m2.id);
    assert.equal(s1.pago_id, pendiente.r.id);
    assert.equal(s2.vivienda_id, otra.id);
    const saldo = async (v) => Number((await servidor((q) => uno(q, "select saldo_centavos s from saldos_vivienda where vivienda_id = $1", [v]))).s);
    const antes = await saldo(otra.id);
    await como("authenticated", yo, (q) => q("select conciliar_movimiento($1, $2, null)", [m1.id, s1.pago_id]));
    await como("authenticated", yo, (q) => q("select conciliar_movimiento($1, null, $2)", [m2.id, s2.vivienda_id]));
    await como("authenticated", yo, (q) => q("select conciliar_movimiento($1, null, $2)", [m2.id, s2.vivienda_id]));
    assert.equal(antes - (await saldo(otra.id)), 150000);
    const est = await servidor((q) => uno(q, "select estado from pagos_condominio where id = $1", [pendiente.r.id]));
    assert.equal(est.estado, "confirmado");
    await assert.rejects(como("authenticated", otra, (q) => q("select * from sugerencias_conciliacion($1)", [condA2])), /Sin permiso/);
  });
});

describe("Piloto: pases con contexto, fiestas, cajones y reglas", () => {
  test("el invitado abre su pase sin cuenta y solo ve sus datos de acceso; otra caseta no lo valida", async () => {
    const p = await servidor((q) => uno(q, "select p.codigo, p.visitante from pases p join eventos e on e.id = p.evento_id where e.condominio_id = $1 limit 1", [condA]));
    const pub = await servidor((q) => uno(q, "select pase_publico($1) d", [p.codigo]));
    assert.equal(pub.d.visitante, p.visitante);
    assert.ok(pub.d.instrucciones && pub.d.acceso);
    const texto = JSON.stringify(pub.d);
    assert.ok(!/residente|telefono|442 |token|vivienda_id/.test(texto), texto);
    const t = await abrirTurno(condA2);
    assert.equal((await servidor((q) => uno(q, "select caseta_entrada($1, $2, $3) r", [t.turno, t.hash, p.codigo]))).r.motivo, "no_existe");
  });

  test("fiesta: un pase por invitado, cajones para los primeros, revocar uno no afecta a los demás; reglas de máximo", async () => {
    const res = await residenteDe(condA2);
    const ini = new Date(Date.now() + 3 * 86400_000);
    ini.setUTCHours(1, 0, 0, 0); // 19:00 en Querétaro
    const fin = new Date(ini.getTime() + 4 * 3600_000);
    const ev = await servidor((q) => uno(q, "select vecino_crear_evento($1, 'Posada', $2, $3, $4, 2, null) id", [res.token, ini, fin, ["Ana", "Beto", "Caro", "Dani"]]));
    const pases = (await servidor((q) => q("select id, codigo, cajon_id, instrucciones from pases where evento_id = $1 order by created_at", [ev.id]))).rows;
    assert.equal(pases.length, 4);
    assert.equal(pases.filter((x) => x.cajon_id).length, 2);
    assert.ok(pases[0].instrucciones, "toma las instrucciones de la regla");
    await servidor((q) => q("select vecino_cancelar_pase($1, $2)", [res.token, pases[1].id]));
    const est = (await servidor((q) => q("select estado from pases where evento_id = $1", [ev.id]))).rows.map((x) => x.estado);
    assert.equal(est.filter((x) => x === "cancelado").length, 1);
    await assert.rejects(servidor((q) => q("select vecino_crear_evento($1, 'Grande', $2, $3, $4, 0, null)", [res.token, ini, fin, Array.from({ length: 31 }, (_, i) => `Inv ${i}`)])), /máximo de invitados/);
    await assert.rejects(servidor((q) => q("select vecino_crear_evento($1, 'Muchos autos', $2, $3, $4, 9, null)", [res.token, ini, fin, ["A", "Bb"]])), /cajones/);
  });

  test("cajones: no se asigna el mismo cajón dos veces al mismo horario; al salir se libera", async () => {
    const res = await residenteDe(condA2);
    const d = (h) => ({ visitante: `Auto ${h}`, tipo_visita: "visita", modalidad: "unico", desde: new Date(Date.now() - 60_000).toISOString(), hasta: new Date(Date.now() + 3 * 3600_000).toISOString(), cajon: true });
    const libres = Number((await servidor((q) => uno(q, "select count(*) n from cajones k where k.condominio_id = $1 and not exists (select 1 from pases p where p.cajon_id = k.id and p.estado = 'activo' and p.hasta > now() and p.desde < now() + interval '3 hours')", [condA2]))).n);
    const r = await Promise.allSettled(Array.from({ length: libres + 1 }, (_, i) => servidor((q) => uno(q, "select vecino_crear_pase_ctx($1, $2) r", [res.token, d(i)]))));
    assert.equal(r.filter((x) => x.status === "fulfilled").length, libres);
    assert.match(String(r.find((x) => x.status === "rejected").reason), /No hay cajones/);
    const asignados = (await servidor((q) => q("select cajon_id from pases where visitante like 'Auto %' and condominio_id = $1", [condA2]))).rows.map((x) => x.cajon_id);
    assert.equal(new Set(asignados).size, asignados.length);
    // Entra y sale uno: su cajón vuelve a estar libre
    const uno_ = (await servidor((q) => uno(q, "select codigo from pases where visitante = 'Auto 0' and condominio_id = $1", [condA2])));
    const t = await abrirTurno(condA2);
    const e = await servidor((q) => uno(q, "select caseta_entrada($1, $2, $3) r", [t.turno, t.hash, uno_.codigo]));
    assert.ok(e.r.cajon);
    await servidor((q) => q("select caseta_salida($1, $2, $3)", [t.turno, t.hash, e.r.acceso_id]));
    const otro = await servidor((q) => uno(q, "select vecino_crear_pase_ctx($1, $2) r", [res.token, d(99)]));
    assert.ok(otro.r.id);
  });

  test("reglas: servicio fuera de horario se rechaza; el pase de servicio muestra el trabajo autorizado; folio para buscar", async () => {
    const res = await residenteDe(condA);
    const noche = new Date(Date.now() + 86400_000);
    noche.setUTCHours(4, 0, 0, 0); // 22:00 en Querétaro
    await assert.rejects(
      servidor((q) => q("select vecino_crear_pase_ctx($1, $2)", [res.token, { visitante: "Plomero", tipo_visita: "servicio", desde: noche.toISOString(), hasta: new Date(noche.getTime() + 3600_000).toISOString() }])),
      /horario permitido/,
    );
    const p = (await servidor((q) => uno(q, "select codigo, folio from pases where trabajo like 'Instalación de módem%' and condominio_id = $1", [condA])));
    const t = await abrirTurno(condA);
    const r = await servidor((q) => uno(q, "select caseta_entrada($1, $2, $3) r", [t.turno, t.hash, `#${p.folio}`]));
    assert.equal(r.r.ok, true);
    assert.match(r.r.trabajo, /módem/);
  });
});

describe("Piloto: paquetería y cambio de turno", () => {
  test("doble confirmación del mismo paquete: solo una gana", async () => {
    const res = await residenteDe(condA);
    const t1 = await abrirTurno(condA);
    const paq = await servidor((q) => uno(q, "select caseta_paquete($1, $2, $3, 'Estafeta', null) id", [t1.turno, t1.hash, res.vivienda_id]));
    const r = await Promise.allSettled([1, 2].map(() => servidor((q) => q("select caseta_entregar_paquete($1, $2, $3, 'Ana Ruiz')", [t1.turno, t1.hash, paq.id]))));
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.match(String(r.find((x) => x.status === "rejected").reason), /ya se entregó/);
  });

  test("recogida por tercero: PIN de un solo uso, revocable, de su condominio", async () => {
    const res = await residenteDe(condA);
    const t = await abrirTurno(condA);
    await servidor((q) => q("select caseta_paquete($1, $2, $3, 'Amazon', 'Sobre')", [t.turno, t.hash, res.vivienda_id]));
    const a = await servidor((q) => uno(q, "select vecino_autorizar_recogida($1, null, 'Luis (vecino)', 24) r", [res.token]));
    const pub = await servidor((q) => uno(q, "select recogida_publica($1) d", [a.r.token]));
    assert.equal(pub.d.estado, "activa");
    assert.ok(!JSON.stringify(pub.d).includes("Ana"), "no muestra al residente");
    const t2 = await abrirTurno(condA2);
    assert.equal((await servidor((q) => uno(q, "select caseta_entregar_tercero($1, $2, $3) r", [t2.turno, t2.hash, a.r.pin]))).r.ok, false);
    const ok = await servidor((q) => uno(q, "select caseta_entregar_tercero($1, $2, $3) r", [t.turno, t.hash, a.r.pin]));
    assert.equal(ok.r.ok, true);
    assert.ok(ok.r.paquetes >= 1);
    assert.equal((await servidor((q) => uno(q, "select caseta_entregar_tercero($1, $2, $3) r", [t.turno, t.hash, a.r.pin]))).r.ok, false);
    const b = await servidor((q) => uno(q, "select vecino_autorizar_recogida($1, null, 'Otro', 24) r", [res.token]));
    await servidor((q) => q("select vecino_revocar_recogida($1, $2)", [res.token, b.r.id]));
    assert.equal((await servidor((q) => uno(q, "select caseta_entregar_tercero($1, $2, $3) r", [t.turno, t.hash, b.r.pin]))).r.motivo, "pin_invalido");
  });

  test("cambio de turno: incidencias abiertas en la entrega y el entrante confirma recepción", async () => {
    const saliente = await abrirTurno(condA);
    const res = await residenteDe(condA);
    const paq = await servidor((q) => uno(q, "select caseta_paquete($1, $2, $3, 'DHL', 'Pendiente al cambio') id", [saliente.turno, saliente.hash, res.vivienda_id]));
    await servidor((q) => q("select cerrar_turno($1, $2, 'Queda un paquete')", [saliente.turno, saliente.hash]));
    const t = await abrirTurno(condA);
    const d = await servidor((q) => uno(q, "select caseta_datos($1, $2) d", [t.turno, t.hash]));
    assert.ok(Array.isArray(d.d.entrega.incidencias));
    assert.ok(d.d.entrega.paquetes.some((k) => k.id === paq.id), "el paquete pendiente del turno anterior aparece");
    await servidor((q) => q("select caseta_confirmar_recepcion($1, $2, 'Recibo con un paquete de DHL')", [t.turno, t.hash]));
    const r = await servidor((q) => uno(q, "select recepcion_at, recepcion_notas from turnos where id = $1", [t.turno]));
    assert.ok(r.recepcion_at);
    await servidor((q) => q("select caseta_aclaracion($1, $2, null, 'Llamé a Casa 3 por una visita sin pase')", [t.turno, t.hash]));
    const ind = await como("authenticated", yo, (q) => uno(q, "select indicadores_piloto($1, now() - interval '7 days', now() + interval '1 minute') r", [condA]));
    assert.ok(ind.r.actual.aclaraciones >= 1);
    assert.ok(ind.r.actual.cambios_turno_confirmados >= 1);
    assert.ok("anterior" in ind.r);
  });
});

describe("Piloto: incidentes agrupados", () => {
  test("tres folios de falta de agua se vinculan a un incidente y reciben el aviso sin exponer datos entre viviendas", async () => {
    const sug = (await como("authenticated", yo, (q) => q("select * from sugerencias_incidentes($1)", [condA]))).rows.filter((x) => x.titulo === "No hay agua");
    assert.equal(sug.length, 3);
    const inc = await como("authenticated", yo, (q) => uno(q, "select agrupar_reportes($1, $2, null, 'Falta de agua') id", [condA, sug.map((x) => x.ticket_id)]));
    const viviendas = await como("authenticated", yo, (q) => uno(q, "select publicar_avance_incidente($1, 'Se cambió la válvula; regresa el agua a las 15:00', 'en_proceso', 'Mantenimiento', current_date) v", [inc.id]));
    assert.equal(viviendas.v.length, 3);
    const folios = (await servidor((q) => q("select folio from tickets where incidente_id = $1", [inc.id]))).rows;
    assert.equal(new Set(folios.map((f) => f.folio)).size, 3, "cada reporte conserva su folio");
    const t = await servidor((q) => uno(q, "select r.token, t.id from tickets t join residentes r on r.id = t.residente_id where t.incidente_id = $1 limit 1", [inc.id]));
    const vd = await servidor((q) => uno(q, "select vecino_datos($1) d", [t.token]));
    const rep = vd.d.reportes.find((x) => x.id === t.id);
    assert.ok(rep.historial.some((h) => /Avance general/.test(h.nota ?? "")));
    const vi = await servidor((q) => uno(q, "select vecino_incidentes($1) d", [t.token]));
    assert.equal(vi.d[t.id].afectados, 3);
    const otros = (await servidor((q) => q("select r.nombre from tickets x join residentes r on r.id = x.residente_id where x.incidente_id = $1 and x.id <> $2", [inc.id, t.id]))).rows;
    const texto = JSON.stringify(vd.d) + JSON.stringify(vi.d);
    assert.ok(otros.every((o) => !texto.includes(o.nombre)), "no aparecen nombres de otras viviendas");
    // Deshacer la agrupación de uno
    await como("authenticated", yo, (q) => q("select desagrupar_reporte($1)", [t.id]));
    assert.equal((await servidor((q) => uno(q, "select incidente_id from tickets where id = $1", [t.id]))).incidente_id, null);
  });
});

describe("Piloto: obras y equipos", () => {
  test("la cuota de la obra se reparte y lo recaudado se calcula con los pagos aplicados a lo más antiguo", async () => {
    const o = await servidor((q) => uno(q, "select id from obras where condominio_id = $1 limit 1", [condA2]));
    const n = await como("authenticated", yo, (q) => uno(q, "select cargar_cuota_obra($1, 4000000, current_date, null, false) n", [o.id]));
    assert.equal(n.n, 40);
    const n2 = await como("authenticated", yo, (q) => uno(q, "select cargar_cuota_obra($1, 4000000, current_date, null, false) n", [o.id]));
    assert.equal(n2.n, 0, "no se duplica");
    const res = await residenteDe(condA2);
    const antes = (await servidor((q) => uno(q, "select resumen_obras($1) r", [condA2]))).r.find((x) => x.id === o.id).recaudado_centavos;
    const saldo = Number((await servidor((q) => uno(q, "select saldo_centavos s from saldos_vivienda where vivienda_id = $1", [res.vivienda_id]))).s);
    const p = await servidor((q) => uno(q, "select vecino_registrar_pago($1, $2, 'SPEI obra', current_date, null, $3) r", [res.token, saldo, randomUUID()]));
    await como("authenticated", yo, (q) => q("select confirmar_pago_condominio($1)", [p.r.id]));
    const despues = (await servidor((q) => uno(q, "select resumen_obras($1) r", [condA2]))).r.find((x) => x.id === o.id).recaudado_centavos;
    assert.equal(Number(despues) - Number(antes), 100000);
  });
});
