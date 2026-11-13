-- Black Key · Condominios y privadas
-- La administradora opera privadas y condominios con las herramientas que ya usa (tickets, proveedores,
-- cotizaciones, mantenimiento) y suma: viviendas y residentes, pases QR y bitácora de caseta, chat con
-- vigilancia, paquetería, entrega de turno, cuotas con estados de cuenta y recibos, avisos por zona y
-- reportes para el comité.
--
-- Residentes, guardias y comité NO tienen cuenta: entran por links con token que se resuelven en el
-- servidor (llave service_role), igual que inquilinos, dueños y proveedores. Cada consulta por link se
-- filtra por el condominio del token, así que dos condominios de la misma administradora nunca se cruzan.
--
-- Montos en centavos (bigint). Fechas con zona horaria; los horarios de pases se evalúan en America/Mexico_City.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

-- ─────────────────────────────────────────────────────────────
-- Tokens opacos (sin datos personales). Alfabeto sin 0/O/1/I para poder dictarlos o teclearlos.
-- ─────────────────────────────────────────────────────────────
create or replace function public.token_opaco(largo int default 24)
returns text language plpgsql volatile
set search_path = ''
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(largo);
  r text := '';
begin
  for i in 0 .. largo - 1 loop
    r := r || substr(alfabeto, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return r;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Condominios, zonas, viviendas y residentes
-- ─────────────────────────────────────────────────────────────
create table public.condominios (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references public.organizaciones(id) on delete cascade,
  -- Áreas comunes: una propiedad de la cartera para que los reportes, cotizaciones y mantenimientos
  -- del condominio usen los tickets y proveedores de siempre.
  propiedad_id       uuid not null unique references public.propiedades(id),  -- no se puede borrar mientras exista el condominio
  nombre             text not null check (length(nombre) between 1 and 120),
  direccion          text,
  datos_pago         text,                         -- cuenta del condominio para transferencias
  foto_path          text,                         -- foto de portada del portal de residentes
  caseta_token       text not null unique default public.token_opaco(24),
  comite_token       text not null unique default public.token_opaco(24),
  alta_token         text not null unique default public.token_opaco(16),   -- link público para que un residente pida su alta
  comite_exporta     boolean not null default true,
  recibo_serie       text not null default 'R' check (length(recibo_serie) between 1 and 8),
  ultimo_recibo      integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index condominios_org_idx on public.condominios (organizacion_id);

create table public.zonas_condominio (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  nombre          text not null check (length(nombre) between 1 and 60),
  tipo            text not null default 'calle' check (tipo in ('torre', 'calle', 'seccion')),
  unique (condominio_id, nombre)
);

create table public.viviendas (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  zona_id         uuid references public.zonas_condominio(id) on delete set null,
  numero          text not null check (length(numero) between 1 and 30),
  notas           text,
  created_at      timestamptz not null default now(),
  unique (condominio_id, numero)
);
create index viviendas_cond_idx on public.viviendas (condominio_id);

-- Permisos configurables por residente. Si una llave falta, vale el valor por defecto de su tipo
-- (ver public.permiso_residente).
create table public.residentes (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  nombre          text not null check (length(nombre) between 1 and 120),
  telefono        text,
  email           text,
  tipo            text not null default 'propietario' check (tipo in ('propietario', 'inquilino')),
  permisos        jsonb not null default '{}',
  token           text not null unique default public.token_opaco(24),
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index residentes_viv_idx on public.residentes (vivienda_id);
create index residentes_cond_idx on public.residentes (condominio_id);

-- pases: crear pases · reportes: levantar reportes · ver_cuenta: estado de cuenta y recibos · registrar_pagos: subir comprobantes
create or replace function public.permiso_residente(tipo text, permisos jsonb, clave text)
returns boolean language sql immutable
set search_path = ''
as $$
  select coalesce(
    (permisos ->> clave)::boolean,
    case when tipo = 'propietario' then true
         else clave in ('pases', 'reportes') end
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Caseta: guardias, turnos, pases, accesos, chat y paquetes
-- ─────────────────────────────────────────────────────────────
create table public.guardias (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  nombre          text not null check (length(nombre) between 1 and 80),
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);
-- El PIN va aparte y sin políticas: solo lo lee el servidor (nunca el navegador ni el equipo).
create table public.guardias_pin (
  guardia_id uuid primary key references public.guardias(id) on delete cascade,
  pin_hash   text not null
);

create table public.turnos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  guardia_id      uuid not null references public.guardias(id) on delete restrict,
  inicio          timestamptz not null default now(),
  fin             timestamptz,
  notas           text,
  entrega         jsonb,                           -- resumen que se entrega al cerrar el turno
  sesion_hash     text                             -- sha256 del secreto del dispositivo; nunca el secreto
);
create index turnos_cond_idx on public.turnos (condominio_id, inicio desc);
create unique index turnos_un_abierto_idx on public.turnos (condominio_id) where fin is null;

create table public.pases (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  residente_id    uuid references public.residentes(id) on delete set null,
  codigo          text not null unique default public.token_opaco(12),
  visitante       text not null check (length(visitante) between 1 and 120),
  tipo_visita     text not null default 'visita' check (tipo_visita in ('visita', 'proveedor', 'servicio', 'taxi', 'paqueteria')),
  modalidad       text not null default 'unico' check (modalidad in ('unico', 'recurrente')),
  desde           timestamptz not null,
  hasta           timestamptz not null,
  dias            smallint[],                      -- recurrente: 1 = lunes … 7 = domingo
  hora_desde      time,
  hora_hasta      time,
  max_usos        integer check (max_usos is null or max_usos > 0),
  usos            integer not null default 0,
  placa           text,
  servicio        text,                            -- personal doméstico: limpieza, jardinería, niñera…
  metodo_acceso   text not null default 'qr' check (metodo_acceso in ('qr', 'lista')),  -- lista: caseta lo busca por nombre
  estado          text not null default 'activo' check (estado in ('activo', 'cancelado')),
  cancelado_at    timestamptz,
  created_at      timestamptz not null default now(),
  check (hasta > desde),
  check (modalidad = 'recurrente' or max_usos = 1)
);
create index pases_viv_idx on public.pases (vivienda_id, created_at desc);
create index pases_cond_idx on public.pases (condominio_id, hasta);

create table public.accesos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  pase_id         uuid references public.pases(id) on delete set null,
  entrada_id      uuid references public.accesos(id) on delete set null,  -- en una salida: su entrada
  tipo            text not null check (tipo in ('entrada', 'salida')),
  visitante       text not null,
  placa           text,
  metodo          text not null check (metodo in ('qr', 'manual', 'sin_conexion')),
  autorizo        text not null,                   -- residente del pase, o a quién se llamó para autorizar
  guardia_id      uuid references public.guardias(id) on delete set null,
  turno_id        uuid references public.turnos(id) on delete set null,
  revision        text check (revision in ('pendiente', 'revisado')),
  nota_revision   text,
  revisado_por    text,
  ref_cliente     text,                            -- idempotencia de registros hechos sin conexión
  ocurrio_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (condominio_id, ref_cliente)
);
create index accesos_cond_idx on public.accesos (condominio_id, ocurrio_at desc);
create index accesos_viv_idx on public.accesos (vivienda_id, ocurrio_at desc);
create unique index accesos_una_salida_idx on public.accesos (entrada_id) where tipo = 'salida';

create table public.caseta_chats (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  pendiente       boolean not null default false,  -- el residente escribió y caseta no ha respondido
  ultimo_at       timestamptz not null default now(),
  unique (condominio_id, vivienda_id)
);

create table public.caseta_mensajes (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  chat_id         uuid not null references public.caseta_chats(id) on delete cascade,
  lado            text not null check (lado in ('residente', 'caseta')),
  residente_id    uuid references public.residentes(id) on delete set null,
  guardia_id      uuid references public.guardias(id) on delete set null,
  texto           text not null check (length(texto) between 1 and 1000),
  created_at      timestamptz not null default now()
);
create index caseta_mensajes_chat_idx on public.caseta_mensajes (chat_id, created_at);

create table public.paquetes (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  paqueteria      text,
  descripcion     text,
  recibio_id      uuid references public.guardias(id) on delete set null,
  recibido_at     timestamptz not null default now(),
  avisado_at      timestamptz,
  entregado_a     text,
  entrego_id      uuid references public.guardias(id) on delete set null,
  entregado_at    timestamptz
);
create index paquetes_cond_idx on public.paquetes (condominio_id, entregado_at);

-- ─────────────────────────────────────────────────────────────
-- Cuotas, pagos, recibos, ajustes y gastos
-- ─────────────────────────────────────────────────────────────
create table public.cargos_condominio (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  concepto        text not null check (concepto in ('mantenimiento', 'agua', 'extraordinaria', 'multa', 'otro')),
  descripcion     text not null default '',
  periodo         date not null,                   -- primer día del mes
  monto_centavos  bigint not null check (monto_centavos > 0),
  vence           date,
  creado_por      text,
  created_at      timestamptz not null default now()
);
-- Cargar la cuota dos veces (doble clic, reintento) no duplica el cargo.
create unique index cargos_unico_idx on public.cargos_condominio (vivienda_id, concepto, periodo, descripcion);
create index cargos_cond_idx on public.cargos_condominio (condominio_id, periodo);

create table public.pagos_condominio (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  monto_centavos  bigint not null check (monto_centavos > 0),
  referencia      text,
  pagado_el       date not null,
  comprobante_path text,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'rechazado')),
  registrado_por  text not null,                   -- 'residente: Nombre' o correo de la administradora
  residente_id    uuid references public.residentes(id) on delete set null,
  revisado_por    text,
  revisado_at     timestamptz,
  nota            text,
  folio_recibo    integer,                         -- se asigna una sola vez al confirmar
  recibo_at       timestamptz,
  clave_cliente   text,                            -- idempotencia del envío
  created_at      timestamptz not null default now(),
  unique (condominio_id, folio_recibo),
  unique (condominio_id, clave_cliente)
);
create index pagos_cond_idx on public.pagos_condominio (condominio_id, estado);
create index pagos_viv_idx on public.pagos_condominio (vivienda_id);

-- Nunca se edita un saldo: se agrega un ajuste con motivo (saldo inicial importado, corrección, condonación).
create table public.ajustes_saldo (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  monto_centavos  bigint not null check (monto_centavos <> 0),  -- + aumenta el adeudo, − saldo a favor
  tipo            text not null default 'ajuste' check (tipo in ('saldo_inicial', 'ajuste')),
  motivo          text not null check (length(motivo) between 3 and 300),
  creado_por      text,
  created_at      timestamptz not null default now()
);
create index ajustes_viv_idx on public.ajustes_saldo (vivienda_id);

create table public.gastos_condominio (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  categoria       text not null,
  descripcion     text not null check (length(descripcion) between 1 and 300),
  proveedor_id    uuid references public.proveedores(id) on delete set null,
  ticket_id       uuid references public.tickets(id) on delete set null,
  monto_centavos  bigint not null check (monto_centavos > 0),
  fecha           date not null,
  comprobante_path text,
  creado_por      text,
  created_at      timestamptz not null default now()
);
create index gastos_cond_idx on public.gastos_condominio (condominio_id, fecha);

-- Saldo por vivienda: cargos + ajustes − pagos confirmados (positivo = debe).
create or replace view public.saldos_vivienda with (security_invoker = true) as
select v.id as vivienda_id, v.condominio_id, v.organizacion_id, v.numero,
  coalesce((select sum(c.monto_centavos) from public.cargos_condominio c where c.vivienda_id = v.id), 0)
  + coalesce((select sum(a.monto_centavos) from public.ajustes_saldo a where a.vivienda_id = v.id), 0)
  - coalesce((select sum(p.monto_centavos) from public.pagos_condominio p where p.vivienda_id = v.id and p.estado = 'confirmado'), 0)
  as saldo_centavos
from public.viviendas v;

-- ─────────────────────────────────────────────────────────────
-- Avisos, bitácora e idempotencia
-- ─────────────────────────────────────────────────────────────
create table public.avisos_condominio (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  zona_id         uuid references public.zonas_condominio(id) on delete cascade,  -- null = todo el condominio
  titulo          text not null check (length(titulo) between 1 and 120),
  cuerpo          text not null check (length(cuerpo) between 1 and 2000),
  creado_por      text,
  created_at      timestamptz not null default now()
);
create index avisos_cond_idx on public.avisos_condominio (condominio_id, created_at desc);

create table public.bitacora_condominio (
  id              bigint generated always as identity primary key,
  organizacion_id uuid not null,                   -- sin llaves foráneas: la bitácora sobrevive a lo que registra
  condominio_id   uuid,
  actor           text not null,
  accion          text not null,
  entidad         text not null,
  entidad_id      uuid,
  detalle         jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index bitacora_cond_idx on public.bitacora_condominio (condominio_id, created_at desc);

create table public.claves_idempotencia (
  alcance    text not null,
  clave      text not null,
  respuesta  jsonb not null,
  created_at timestamptz not null default now(),
  primary key (alcance, clave)
);

-- ─────────────────────────────────────────────────────────────
-- Tickets: reportes de vecinos con responsable, fecha compromiso, quejas sensibles e historial
-- ─────────────────────────────────────────────────────────────
alter table public.tickets
  add column if not exists condominio_id uuid references public.condominios(id) on delete cascade,
  add column if not exists vivienda_id uuid references public.viviendas(id) on delete set null,
  add column if not exists residente_id uuid references public.residentes(id) on delete set null,
  add column if not exists ubicacion text,
  add column if not exists sensible boolean not null default false,
  add column if not exists responsable text,
  add column if not exists fecha_compromiso date,
  add column if not exists resolucion text,
  add column if not exists reaperturas integer not null default 0;
create index if not exists tickets_cond_idx on public.tickets (condominio_id, estado);
create index if not exists tickets_res_idx on public.tickets (residente_id);

alter table public.tickets drop constraint if exists tickets_canal_origen_check;
alter table public.tickets add constraint tickets_canal_origen_check
  check (canal_origen in ('qr', 'whatsapp', 'panel', 'vecino'));

create table public.ticket_historial (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  actor           text not null,
  de_estado       text,
  a_estado        text,
  nota            text,
  created_at      timestamptz not null default now()
);
create index ticket_historial_idx on public.ticket_historial (ticket_id, created_at);

-- Cada cambio de estado, responsable o fecha queda en el historial, venga de donde venga.
create or replace function public.historial_ticket()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  quien text := coalesce(nullif(current_setting('bk.actor', true), ''), auth.jwt() ->> 'email', 'sistema');
  cambios text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_historial (organizacion_id, ticket_id, actor, a_estado, nota)
    values (new.organizacion_id, new.id, quien, new.estado::text, 'Reporte creado');
    return new;
  end if;
  if new.responsable is distinct from old.responsable then cambios := cambios || ('Responsable: ' || coalesce(new.responsable, '—')); end if;
  if new.fecha_compromiso is distinct from old.fecha_compromiso then cambios := cambios || ('Fecha compromiso: ' || coalesce(to_char(new.fecha_compromiso, 'DD/MM/YYYY'), '—')); end if;
  if new.estado is distinct from old.estado or array_length(cambios, 1) > 0 then
    insert into public.ticket_historial (organizacion_id, ticket_id, actor, de_estado, a_estado, nota)
    values (new.organizacion_id, new.id, quien,
            case when new.estado is distinct from old.estado then old.estado::text end,
            case when new.estado is distinct from old.estado then new.estado::text end,
            nullif(array_to_string(cambios, ' · '), ''));
  end if;
  return new;
end;
$$;
drop trigger if exists tickets_historial on public.tickets;
create trigger tickets_historial after insert or update on public.tickets
  for each row execute function public.historial_ticket();

-- Quejas sensibles: solo propietaria/admin de la administradora (no el staff). Residentes solo ven las suyas por su link.
drop policy if exists "miembros leen" on public.tickets;
create policy "miembros leen" on public.tickets for select to authenticated
  using (public.es_miembro(organizacion_id) and (not sensible or public.es_admin(organizacion_id)));
drop policy if exists "miembros editan" on public.tickets;
create policy "miembros editan" on public.tickets for update to authenticated
  using (public.es_miembro(organizacion_id) and (not sensible or public.es_admin(organizacion_id)))
  with check (public.es_miembro(organizacion_id));

-- ─────────────────────────────────────────────────────────────
-- Bitácora automática (sin tokens, códigos, PIN ni rutas de archivos)
-- ─────────────────────────────────────────────────────────────
create or replace function public.bitacora_cambio()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  fila jsonb := to_jsonb(coalesce(new, old));
  limpio jsonb := fila - array['token', 'codigo', 'caseta_token', 'comite_token', 'alta_token', 'ine_frente_path', 'ine_reverso_path', 'selfie_path', 'sesion_hash', 'comprobante_path', 'clave_cliente', 'ref_cliente', 'telefono', 'email'];
begin
  insert into public.bitacora_condominio (organizacion_id, condominio_id, actor, accion, entidad, entidad_id, detalle)
  values ((fila ->> 'organizacion_id')::uuid,
          case when tg_table_name = 'condominios' then (fila ->> 'id')::uuid else (fila ->> 'condominio_id')::uuid end,
          coalesce(nullif(current_setting('bk.actor', true), ''), auth.jwt() ->> 'email', 'sistema'),
          lower(tg_op), tg_table_name, (fila ->> 'id')::uuid,
          case when tg_op = 'UPDATE' then
            (select coalesce(jsonb_object_agg(k, limpio -> k), '{}') from jsonb_object_keys(limpio) k
             where (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k))
          else limpio end);
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['condominios', 'residentes', 'pases', 'accesos', 'cargos_condominio', 'pagos_condominio',
                           'ajustes_saldo', 'gastos_condominio', 'avisos_condominio', 'guardias', 'turnos']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.bitacora_cambio()',
                   t || '_bitacora', t);
  end loop;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['condominios', 'residentes'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Seguridad (RLS): la administradora ve sus condominios; residentes, caseta y comité van por el servidor.
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['condominios', 'zonas_condominio', 'viviendas', 'residentes', 'guardias', 'turnos', 'pases',
                           'accesos', 'caseta_chats', 'caseta_mensajes', 'paquetes', 'cargos_condominio',
                           'pagos_condominio', 'ajustes_saldo', 'gastos_condominio', 'avisos_condominio', 'ticket_historial']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "miembros leen" on public.%I for select to authenticated using (public.es_miembro(organizacion_id))', t);
    execute format('create policy "miembros crean" on public.%I for insert to authenticated with check (public.es_miembro(organizacion_id))', t);
    execute format('create policy "miembros editan" on public.%I for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id))', t);
    execute format('create policy "admins borran" on public.%I for delete to authenticated using (public.es_admin(organizacion_id))', t);
  end loop;
end;
$$;

-- Movimientos de dinero e historial: no se borran ni se reescriben desde el navegador.
drop policy "admins borran" on public.pagos_condominio;
drop policy "admins borran" on public.ajustes_saldo;
drop policy "miembros editan" on public.ajustes_saldo;
drop policy "admins borran" on public.ticket_historial;
drop policy "miembros editan" on public.ticket_historial;
drop policy "miembros editan" on public.accesos;
create policy "miembros revisan" on public.accesos for update to authenticated
  using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
-- El estado de un pago solo cambia con confirmar_pago_condominio / rechazar_pago_condominio.
drop policy "miembros editan" on public.pagos_condominio;

alter table public.bitacora_condominio enable row level security;
create policy "miembros leen" on public.bitacora_condominio for select to authenticated using (public.es_miembro(organizacion_id));

alter table public.guardias_pin enable row level security;        -- sin políticas: solo servidor
alter table public.claves_idempotencia enable row level security; -- sin políticas: solo servidor
revoke all on public.guardias_pin, public.claves_idempotencia from anon, authenticated;

-- Para que una fila nunca apunte a un condominio de otra administradora o a una vivienda de otro condominio.
create or replace function public.validar_condominio()
returns trigger language plpgsql
set search_path = ''
as $$
declare
  fila jsonb := to_jsonb(new);
begin
  if not exists (select 1 from public.condominios c
                 where c.id = (fila ->> 'condominio_id')::uuid and c.organizacion_id = (fila ->> 'organizacion_id')::uuid) then
    raise exception 'El condominio no pertenece a esta administradora';
  end if;
  if fila ? 'vivienda_id' and (fila ->> 'vivienda_id') is not null and not exists (
       select 1 from public.viviendas v where v.id = (fila ->> 'vivienda_id')::uuid and v.condominio_id = (fila ->> 'condominio_id')::uuid) then
    raise exception 'La vivienda no pertenece a este condominio';
  end if;
  if fila ? 'zona_id' and (fila ->> 'zona_id') is not null and not exists (
       select 1 from public.zonas_condominio z where z.id = (fila ->> 'zona_id')::uuid and z.condominio_id = (fila ->> 'condominio_id')::uuid) then
    raise exception 'La zona no pertenece a este condominio';
  end if;
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['zonas_condominio', 'viviendas', 'residentes', 'guardias', 'turnos', 'pases', 'accesos', 'caseta_chats',
                           'paquetes', 'cargos_condominio', 'pagos_condominio', 'ajustes_saldo', 'gastos_condominio', 'avisos_condominio']
  loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.validar_condominio()',
                   t || '_valida', t);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Funciones de negocio
-- ─────────────────────────────────────────────────────────────

-- Valida un pase y registra la entrada en un solo paso. El candado de la fila (FOR UPDATE) hace que dos
-- escaneos simultáneos del mismo QR de un solo uso no puedan autorizar dos entradas.
create or replace function public.caseta_registrar_entrada(p_turno uuid, p_codigo text, p_ahora timestamptz default now())
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype;
  p public.pases%rowtype;
  local timestamp := p_ahora at time zone 'America/Mexico_City';
  quien text;
  viv text;
  nuevo uuid;
begin
  select * into t from public.turnos where id = p_turno and fin is null;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'sin_turno'); end if;

  select * into p from public.pases
  where codigo = upper(trim(p_codigo)) and condominio_id = t.condominio_id
  for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;

  select v.numero into viv from public.viviendas v where v.id = p.vivienda_id;
  if p.estado = 'cancelado' then
    return jsonb_build_object('ok', false, 'motivo', 'cancelado', 'visitante', p.visitante, 'vivienda', viv);
  end if;
  if p_ahora < p.desde then
    return jsonb_build_object('ok', false, 'motivo', 'aun_no_vigente', 'visitante', p.visitante, 'vivienda', viv, 'desde', p.desde);
  end if;
  if p_ahora > p.hasta then
    return jsonb_build_object('ok', false, 'motivo', 'vencido', 'visitante', p.visitante, 'vivienda', viv, 'hasta', p.hasta);
  end if;
  if p.modalidad = 'recurrente' and (
       (p.dias is not null and not (extract(isodow from local)::smallint = any (p.dias)))
    or (p.hora_desde is not null and local::time < p.hora_desde)
    or (p.hora_hasta is not null and local::time > p.hora_hasta)) then
    return jsonb_build_object('ok', false, 'motivo', 'fuera_de_horario', 'visitante', p.visitante, 'vivienda', viv);
  end if;
  if p.max_usos is not null and p.usos >= p.max_usos then
    return jsonb_build_object('ok', false, 'motivo', 'ya_usado', 'visitante', p.visitante, 'vivienda', viv);
  end if;

  update public.pases set usos = usos + 1 where id = p.id;
  select coalesce(r.nombre, 'Residente') into quien from public.residentes r where r.id = p.residente_id;
  perform set_config('bk.actor', 'caseta', true);
  insert into public.accesos (organizacion_id, condominio_id, vivienda_id, pase_id, tipo, visitante, placa, metodo, autorizo, guardia_id, turno_id, ocurrio_at)
  values (p.organizacion_id, p.condominio_id, p.vivienda_id, p.id, 'entrada', p.visitante, p.placa, 'qr',
          coalesce(quien, 'Residente') || ' (pase QR)', t.guardia_id, t.id, p_ahora)
  returning id into nuevo;

  return jsonb_build_object('ok', true, 'motivo', 'autorizado', 'acceso_id', nuevo, 'visitante', p.visitante,
                            'vivienda', viv, 'tipo_visita', p.tipo_visita, 'placa', p.placa, 'autorizo', quien,
                            'modalidad', p.modalidad, 'hasta', p.hasta);
end;
$$;

-- Registra la salida de una entrada abierta (una sola salida por entrada).
create or replace function public.caseta_registrar_salida(p_turno uuid, p_entrada uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype;
  e public.accesos%rowtype;
  nuevo uuid;
begin
  select * into t from public.turnos where id = p_turno and fin is null;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'sin_turno'); end if;
  select * into e from public.accesos where id = p_entrada and condominio_id = t.condominio_id and tipo = 'entrada' for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if exists (select 1 from public.accesos where entrada_id = e.id and tipo = 'salida') then
    return jsonb_build_object('ok', false, 'motivo', 'ya_salio');
  end if;
  perform set_config('bk.actor', 'caseta', true);
  insert into public.accesos (organizacion_id, condominio_id, vivienda_id, pase_id, entrada_id, tipo, visitante, placa, metodo, autorizo, guardia_id, turno_id)
  values (e.organizacion_id, e.condominio_id, e.vivienda_id, e.pase_id, e.id, 'salida', e.visitante, e.placa,
          case when e.metodo = 'qr' then 'qr' else 'manual' end, e.autorizo, t.guardia_id, t.id)
  returning id into nuevo;
  return jsonb_build_object('ok', true, 'acceso_id', nuevo, 'visitante', e.visitante);
end;
$$;

-- Confirma un pago y emite su recibo. Reintentar devuelve el mismo recibo, sin duplicar folio ni saldo.
create or replace function public.confirmar_pago_condominio(p_pago uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  pg public.pagos_condominio%rowtype;
  folio integer;
  serie text;
  quien text := coalesce(auth.jwt() ->> 'email', 'administradora');
begin
  select * into pg from public.pagos_condominio where id = p_pago for update;
  if not found or not public.es_miembro(pg.organizacion_id) then
    raise exception 'No encontramos el pago';
  end if;
  select recibo_serie into serie from public.condominios where id = pg.condominio_id;
  if pg.estado = 'confirmado' then
    return jsonb_build_object('ok', true, 'repetido', true, 'folio', serie || '-' || pg.folio_recibo);
  end if;
  if pg.estado = 'rechazado' then
    raise exception 'Este pago se rechazó; regístralo de nuevo si sí llegó';
  end if;
  update public.condominios set ultimo_recibo = ultimo_recibo + 1 where id = pg.condominio_id
  returning ultimo_recibo into folio;
  perform set_config('bk.actor', quien, true);
  update public.pagos_condominio
     set estado = 'confirmado', revisado_por = quien, revisado_at = now(), folio_recibo = folio, recibo_at = now()
   where id = pg.id;
  return jsonb_build_object('ok', true, 'repetido', false, 'folio', serie || '-' || folio);
end;
$$;

create or replace function public.rechazar_pago_condominio(p_pago uuid, p_nota text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  pg public.pagos_condominio%rowtype;
  quien text := coalesce(auth.jwt() ->> 'email', 'administradora');
begin
  select * into pg from public.pagos_condominio where id = p_pago for update;
  if not found or not public.es_miembro(pg.organizacion_id) then raise exception 'No encontramos el pago'; end if;
  if pg.estado <> 'pendiente' then raise exception 'Solo se rechazan pagos pendientes'; end if;
  perform set_config('bk.actor', quien, true);
  update public.pagos_condominio set estado = 'rechazado', revisado_por = quien, revisado_at = now(),
         nota = left(coalesce(nullif(trim(p_nota), ''), 'Comprobante no coincide'), 300)
   where id = pg.id;
end;
$$;

-- Carga una cuota a todas las viviendas (o a una zona). Repetirla no duplica: devuelve cuántas se crearon.
create or replace function public.cargar_cuota(p_condominio uuid, p_concepto text, p_periodo date, p_monto_centavos bigint,
                                               p_vence date, p_zona uuid default null, p_descripcion text default '')
returns integer language plpgsql security definer
set search_path = ''
as $$
declare
  c public.condominios%rowtype;
  n integer;
begin
  select * into c from public.condominios where id = p_condominio;
  if not found or not public.es_miembro(c.organizacion_id) then raise exception 'No encontramos el condominio'; end if;
  if p_monto_centavos is null or p_monto_centavos <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  perform set_config('bk.actor', coalesce(auth.jwt() ->> 'email', 'administradora'), true);
  insert into public.cargos_condominio (organizacion_id, condominio_id, vivienda_id, concepto, descripcion, periodo, monto_centavos, vence, creado_por)
  select c.organizacion_id, c.id, v.id, p_concepto, coalesce(p_descripcion, ''), date_trunc('month', p_periodo)::date,
         p_monto_centavos, p_vence, auth.jwt() ->> 'email'
  from public.viviendas v
  where v.condominio_id = c.id and (p_zona is null or v.zona_id = p_zona)
  on conflict (vivienda_id, concepto, periodo, descripcion) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Crea un condominio con su propiedad de áreas comunes (cuenta como 1 propiedad del plan).
create or replace function public.crear_condominio(p_org uuid, p_nombre text, p_direccion text, p_colonia text default null)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  prop uuid;
  nuevo uuid;
begin
  if not public.es_admin(p_org) then raise exception 'Solo la propietaria o un admin puede crear condominios'; end if;
  insert into public.propiedades (organizacion_id, nombre, direccion, colonia, tipo, estado, notas)
  values (p_org, 'Áreas comunes · ' || p_nombre, p_direccion, p_colonia, 'otro', 'rentada',
          'Áreas comunes del condominio. Los reportes de vecinos y mantenimientos llegan aquí.')
  returning id into prop;
  insert into public.condominios (organizacion_id, propiedad_id, nombre, direccion)
  values (p_org, prop, p_nombre, p_direccion)
  returning id into nuevo;
  return nuevo;
end;
$$;

-- Cambia el link de caseta o del comité (si se perdió un celular o cambió el comité).
create or replace function public.renovar_token_condominio(p_condominio uuid, p_cual text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare org uuid;
begin
  select organizacion_id into org from public.condominios where id = p_condominio;
  if org is null or not public.es_admin(org) then raise exception 'Sin permiso'; end if;
  perform set_config('bk.actor', coalesce(auth.jwt() ->> 'email', 'administradora'), true);
  if p_cual = 'caseta' then
    update public.condominios set caseta_token = public.token_opaco(24) where id = p_condominio;
    update public.turnos set fin = now(), sesion_hash = null, notas = coalesce(notas || ' · ', '') || 'Cerrado al renovar el link de caseta'
     where condominio_id = p_condominio and fin is null;
  elsif p_cual = 'comite' then
    update public.condominios set comite_token = public.token_opaco(24) where id = p_condominio;
  else
    raise exception 'Opción no válida';
  end if;
end;
$$;

create or replace function public.renovar_token_residente(p_residente uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare org uuid;
begin
  select organizacion_id into org from public.residentes where id = p_residente;
  if org is null or not public.es_miembro(org) then raise exception 'Sin permiso'; end if;
  update public.residentes set token = public.token_opaco(24) where id = p_residente;
end;
$$;

-- PIN del guardia (4 a 8 dígitos), guardado con bcrypt.
create or replace function public.fijar_pin_guardia(p_guardia uuid, p_pin text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare org uuid;
begin
  select organizacion_id into org from public.guardias where id = p_guardia;
  if org is null or not public.es_miembro(org) then raise exception 'Sin permiso'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'El PIN debe tener de 4 a 8 números'; end if;
  insert into public.guardias_pin (guardia_id, pin_hash) values (p_guardia, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (guardia_id) do update set pin_hash = excluded.pin_hash;
end;
$$;

-- Abre turno con PIN. Cierra el turno anterior que siguiera abierto (sus pendientes pasan al nuevo).
create or replace function public.iniciar_turno(p_caseta_token text, p_guardia uuid, p_pin text, p_sesion_hash text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  c public.condominios%rowtype;
  g public.guardias%rowtype;
  h text;
  nuevo uuid;
begin
  select * into c from public.condominios where caseta_token = p_caseta_token;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'link_invalido'); end if;
  select * into g from public.guardias where id = p_guardia and condominio_id = c.id and activo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'guardia'); end if;
  select pin_hash into h from public.guardias_pin where guardia_id = g.id;
  if h is null or h <> extensions.crypt(coalesce(p_pin, ''), h) then
    return jsonb_build_object('ok', false, 'motivo', 'pin');
  end if;
  perform set_config('bk.actor', 'caseta: ' || g.nombre, true);
  update public.turnos set fin = now(), sesion_hash = null,
         notas = coalesce(notas || ' · ', '') || 'Cerrado al iniciar el turno de ' || g.nombre
   where condominio_id = c.id and fin is null;
  insert into public.turnos (organizacion_id, condominio_id, guardia_id, sesion_hash)
  values (c.organizacion_id, c.id, g.id, p_sesion_hash)
  returning id into nuevo;
  return jsonb_build_object('ok', true, 'turno_id', nuevo);
end;
$$;

-- Las funciones de caseta y turnos solo se llaman desde el servidor (service_role).
revoke execute on function public.caseta_registrar_entrada(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.caseta_registrar_salida(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.iniciar_turno(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.caseta_registrar_entrada(uuid, text, timestamptz) to service_role;
grant execute on function public.caseta_registrar_salida(uuid, uuid) to service_role;
grant execute on function public.iniciar_turno(text, uuid, text, text) to service_role;

revoke execute on function public.confirmar_pago_condominio(uuid) from public, anon;
revoke execute on function public.rechazar_pago_condominio(uuid, text) from public, anon;
revoke execute on function public.cargar_cuota(uuid, text, date, bigint, date, uuid, text) from public, anon;
revoke execute on function public.crear_condominio(uuid, text, text, text) from public, anon;
revoke execute on function public.renovar_token_condominio(uuid, text) from public, anon;
revoke execute on function public.renovar_token_residente(uuid) from public, anon;
revoke execute on function public.fijar_pin_guardia(uuid, text) from public, anon;
grant execute on function public.confirmar_pago_condominio(uuid) to authenticated;
grant execute on function public.rechazar_pago_condominio(uuid, text) to authenticated;
grant execute on function public.cargar_cuota(uuid, text, date, bigint, date, uuid, text) to authenticated;
grant execute on function public.crear_condominio(uuid, text, text, text) to authenticated;
grant execute on function public.renovar_token_condominio(uuid, text) to authenticated;
grant execute on function public.renovar_token_residente(uuid) to authenticated;
grant execute on function public.fijar_pin_guardia(uuid, text) to authenticated;
revoke execute on function public.token_opaco(int) from public, anon;
grant execute on function public.token_opaco(int) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════
-- Links de residente, caseta y comité
-- Toda la autorización de estos links vive aquí: cada función resuelve el token, toma SU condominio y
-- vivienda, y nunca devuelve ni modifica nada fuera de ellos. Solo las llama el servidor (service_role).
-- ═════════════════════════════════════════════════════════════

-- Residente activo por token (o error).
create or replace function public.residente_por_token(p_token text)
returns public.residentes language plpgsql stable security definer
set search_path = ''
as $$
declare r public.residentes%rowtype;
begin
  select * into r from public.residentes where token = p_token and activo;
  if not found then raise exception 'link_invalido'; end if;
  return r;
end;
$$;

-- Turno abierto cuyo secreto coincide con el del dispositivo (o error).
create or replace function public.turno_valido(p_turno uuid, p_hash text)
returns public.turnos language plpgsql stable security definer
set search_path = ''
as $$
declare t public.turnos%rowtype;
begin
  select * into t from public.turnos where id = p_turno and fin is null and sesion_hash is not null and sesion_hash = p_hash;
  if not found then raise exception 'turno_invalido'; end if;
  return t;
end;
$$;

-- Resumen de un mes: cobranza, ingresos, gastos, adeudos, accesos y reportes.
create or replace function public.resumen_condominio(p_condominio uuid, p_mes date, p_detalle boolean)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  ini date := date_trunc('month', p_mes)::date;
  fin date := (date_trunc('month', p_mes) + interval '1 month')::date;
  cargado bigint; cobrado bigint; gastado bigint; adeudo bigint;
  r jsonb;
begin
  select coalesce(sum(monto_centavos), 0) into cargado from public.cargos_condominio where condominio_id = p_condominio and periodo = ini;
  select coalesce(sum(monto_centavos), 0) into cobrado from public.pagos_condominio
   where condominio_id = p_condominio and estado = 'confirmado' and pagado_el >= ini and pagado_el < fin;
  select coalesce(sum(monto_centavos), 0) into gastado from public.gastos_condominio where condominio_id = p_condominio and fecha >= ini and fecha < fin;
  select coalesce(sum(greatest(saldo_centavos, 0)), 0) into adeudo from public.saldos_vivienda where condominio_id = p_condominio;
  r := jsonb_build_object(
    'mes', to_char(ini, 'YYYY-MM'),
    'cargado_centavos', cargado,
    'cobrado_centavos', cobrado,
    'gastos_centavos', gastado,
    'adeudo_total_centavos', adeudo,
    'cobranza_pct', case when cargado > 0 then round(100.0 * least(cobrado, cargado) / cargado) else null end,
    'viviendas', (select count(*) from public.viviendas where condominio_id = p_condominio),
    'viviendas_con_adeudo', (select count(*) from public.saldos_vivienda where condominio_id = p_condominio and saldo_centavos > 0),
    'accesos_mes', (select count(*) from public.accesos where condominio_id = p_condominio and tipo = 'entrada'
                    and ocurrio_at >= ini and ocurrio_at < fin),
    'reportes_abiertos', (select count(*) from public.tickets where condominio_id = p_condominio and estado not in ('resuelto', 'cancelado')),
    'reportes_cerrados_mes', (select count(*) from public.tickets where condominio_id = p_condominio and estado = 'resuelto'
                              and resuelto_at >= ini and resuelto_at < fin)
  );
  if p_detalle then
    r := r || jsonb_build_object(
      'gastos', coalesce((select jsonb_agg(jsonb_build_object('fecha', g.fecha, 'categoria', g.categoria, 'descripcion', g.descripcion,
                                                             'monto_centavos', g.monto_centavos) order by g.fecha)
                          from public.gastos_condominio g where g.condominio_id = p_condominio and g.fecha >= ini and g.fecha < fin), '[]'),
      'adeudos', coalesce((select jsonb_agg(jsonb_build_object('vivienda', s.numero, 'saldo_centavos', s.saldo_centavos) order by s.saldo_centavos desc)
                           from public.saldos_vivienda s where s.condominio_id = p_condominio and s.saldo_centavos > 0), '[]'),
      -- Las quejas sensibles solo cuentan; nunca muestran título ni vivienda.
      'reportes', coalesce((select jsonb_agg(jsonb_build_object('folio', t.folio, 'estado', t.estado,
                                  'titulo', case when t.sensible then 'Queja privada' else t.titulo end,
                                  'categoria', case when t.sensible then null else t.categoria end,
                                  'responsable', t.responsable, 'fecha_compromiso', t.fecha_compromiso) order by t.created_at desc)
                            from public.tickets t where t.condominio_id = p_condominio and t.estado not in ('resuelto', 'cancelado')), '[]')
    );
  end if;
  return r;
end;
$$;

-- Reporte para la administradora (requiere sesión de miembro).
create or replace function public.reporte_condominio(p_condominio uuid, p_mes date)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare org uuid;
begin
  select organizacion_id into org from public.condominios where id = p_condominio;
  if org is null or not public.es_miembro(org) then raise exception 'Sin permiso'; end if;
  return public.resumen_condominio(p_condominio, p_mes, true);
end;
$$;

-- Lo que ve el comité por su link.
create or replace function public.comite_datos(p_token text, p_mes date)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare c public.condominios%rowtype;
begin
  select * into c from public.condominios where comite_token = p_token;
  if not found then raise exception 'link_invalido'; end if;
  return jsonb_build_object('condominio', c.nombre, 'condominio_id', c.id, 'exporta', c.comite_exporta,
                            'administradora', (select nombre from public.organizaciones where id = c.organizacion_id))
         || public.resumen_condominio(c.id, p_mes, true);
end;
$$;

-- Movimientos del mes para exportar (comité con permiso o administradora).
create or replace function public.movimientos_condominio(p_condominio uuid, p_mes date)
returns table (fecha date, vivienda text, tipo text, concepto text, referencia text, cargo_centavos bigint, abono_centavos bigint)
language sql stable security definer
set search_path = ''
as $$
  with ini as (select date_trunc('month', p_mes)::date d)
  select c.periodo, v.numero, 'cargo', c.concepto || case when c.descripcion <> '' then ' · ' || c.descripcion else '' end, null, c.monto_centavos, 0::bigint
    from public.cargos_condominio c join public.viviendas v on v.id = c.vivienda_id, ini
   where c.condominio_id = p_condominio and c.periodo = ini.d
  union all
  select p.pagado_el, v.numero, 'pago', 'Recibo ' || cn.recibo_serie || '-' || p.folio_recibo, p.referencia, 0::bigint, p.monto_centavos
    from public.pagos_condominio p join public.viviendas v on v.id = p.vivienda_id join public.condominios cn on cn.id = p.condominio_id, ini
   where p.condominio_id = p_condominio and p.estado = 'confirmado' and p.pagado_el >= ini.d and p.pagado_el < (ini.d + interval '1 month')
  union all
  select a.created_at::date, v.numero, case when a.tipo = 'saldo_inicial' then 'saldo inicial' else 'ajuste' end, a.motivo, null,
         greatest(a.monto_centavos, 0), greatest(-a.monto_centavos, 0)
    from public.ajustes_saldo a join public.viviendas v on v.id = a.vivienda_id, ini
   where a.condominio_id = p_condominio and a.created_at >= ini.d and a.created_at < (ini.d + interval '1 month')
  union all
  select g.fecha, '—', 'gasto', g.categoria || ' · ' || g.descripcion, null, g.monto_centavos, 0::bigint
    from public.gastos_condominio g, ini
   where g.condominio_id = p_condominio and g.fecha >= ini.d and g.fecha < (ini.d + interval '1 month')
  order by 1, 2;
$$;

create or replace function public.comite_movimientos(p_token text, p_mes date)
returns table (fecha date, vivienda text, tipo text, concepto text, referencia text, cargo_centavos bigint, abono_centavos bigint)
language plpgsql stable security definer
set search_path = ''
as $$
declare c public.condominios%rowtype;
begin
  select * into c from public.condominios where comite_token = p_token;
  if not found or not c.comite_exporta then raise exception 'Sin permiso'; end if;
  return query select * from public.movimientos_condominio(c.id, p_mes);
end;
$$;

create or replace function public.exportar_movimientos(p_condominio uuid, p_mes date)
returns table (fecha date, vivienda text, tipo text, concepto text, referencia text, cargo_centavos bigint, abono_centavos bigint)
language plpgsql stable security definer
set search_path = ''
as $$
declare org uuid;
begin
  select organizacion_id into org from public.condominios where id = p_condominio;
  if org is null or not public.es_miembro(org) then raise exception 'Sin permiso'; end if;
  return query select * from public.movimientos_condominio(p_condominio, p_mes);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Residente
-- ─────────────────────────────────────────────────────────────
create or replace function public.vecino_datos(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  v public.viviendas%rowtype;
  c public.condominios%rowtype;
  zona text;
  ver_cuenta boolean := public.permiso_residente(r.tipo, r.permisos, 'ver_cuenta');
  res jsonb;
begin
  select * into v from public.viviendas where id = r.vivienda_id;
  select * into c from public.condominios where id = r.condominio_id;
  select nombre into zona from public.zonas_condominio where id = v.zona_id;
  res := jsonb_build_object(
    'residente', jsonb_build_object('id', r.id, 'nombre', r.nombre, 'tipo', r.tipo),
    'permisos', jsonb_build_object(
       'pases', public.permiso_residente(r.tipo, r.permisos, 'pases'),
       'reportes', public.permiso_residente(r.tipo, r.permisos, 'reportes'),
       'ver_cuenta', ver_cuenta,
       'registrar_pagos', public.permiso_residente(r.tipo, r.permisos, 'registrar_pagos')),
    'vivienda', jsonb_build_object('numero', v.numero, 'zona', zona),
    'condominio', jsonb_build_object('nombre', c.nombre, 'foto_path', c.foto_path,
       'administradora', (select nombre from public.organizaciones where id = c.organizacion_id)),
    'pases', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select p.id, p.codigo, p.visitante, p.tipo_visita, p.modalidad, p.desde, p.hasta, p.dias, p.hora_desde, p.hora_hasta,
               p.max_usos, p.usos, p.placa, p.servicio, p.metodo_acceso, p.estado, p.created_at
          from public.pases p where p.vivienda_id = v.id and (p.hasta > now() - interval '7 days')
         order by p.created_at desc limit 30) x), '[]'),
    'accesos', coalesce((select jsonb_agg(x order by x.ocurrio_at desc) from (
        select a.tipo, a.visitante, a.metodo, a.ocurrio_at from public.accesos a
         where a.vivienda_id = v.id order by a.ocurrio_at desc limit 20) x), '[]'),
    'paquetes', coalesce((select jsonb_agg(x order by x.recibido_at desc) from (
        select k.id, k.paqueteria, k.descripcion, k.recibido_at, k.entregado_a, k.entregado_at from public.paquetes k
         where k.vivienda_id = v.id and (k.entregado_at is null or k.entregado_at > now() - interval '14 days')
         order by k.recibido_at desc limit 20) x), '[]'),
    'avisos', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select a.titulo, a.cuerpo, a.created_at, z.nombre as zona from public.avisos_condominio a
          left join public.zonas_condominio z on z.id = a.zona_id
         where a.condominio_id = c.id and (a.zona_id is null or a.zona_id = v.zona_id)
         order by a.created_at desc limit 20) x), '[]'),
    'chat', coalesce((select jsonb_agg(x order by x.created_at) from (
        select m.lado, m.texto, m.created_at from public.caseta_mensajes m join public.caseta_chats ch on ch.id = m.chat_id
         where ch.vivienda_id = v.id order by m.created_at desc limit 50) x), '[]'),
    'reportes', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select t.id, t.folio, t.titulo, t.categoria, t.estado, t.sensible, t.responsable, t.fecha_compromiso, t.resolucion,
               t.created_at, t.token_publico,
               (select m.storage_path from public.ticket_media m where m.ticket_id = t.id and m.tipo = 'foto'
                 order by m.created_at limit 1) as foto,
               (select jsonb_agg(jsonb_build_object('a', h.a_estado, 'nota', h.nota, 'fecha', h.created_at) order by h.created_at)
                  from public.ticket_historial h where h.ticket_id = t.id) as historial
          from public.tickets t where t.residente_id = r.id order by t.created_at desc limit 20) x), '[]'),
    'comunidad', (select jsonb_build_object('mes', s->>'mes', 'cobranza_pct', s->'cobranza_pct', 'cobrado_centavos', s->'cobrado_centavos',
                                            'gastos_centavos', s->'gastos_centavos', 'reportes_abiertos', s->'reportes_abiertos')
                    from (select public.resumen_condominio(c.id, (now() at time zone 'America/Mexico_City')::date, false) s) q)
  );
  if ver_cuenta then
    res := res || jsonb_build_object('cuenta', jsonb_build_object(
      'saldo_centavos', (select saldo_centavos from public.saldos_vivienda where vivienda_id = v.id),
      'datos_pago', c.datos_pago,
      'cargos', coalesce((select jsonb_agg(x order by x.periodo desc) from (
          select k.concepto, k.descripcion, k.periodo, k.monto_centavos, k.vence from public.cargos_condominio k
           where k.vivienda_id = v.id order by k.periodo desc limit 36) x), '[]'),
      'pagos', coalesce((select jsonb_agg(x order by x.pagado_el desc) from (
          select p.id, p.monto_centavos, p.pagado_el, p.referencia, p.estado, p.nota,
                 case when p.folio_recibo is not null then c.recibo_serie || '-' || p.folio_recibo end as recibo, p.recibo_at
            from public.pagos_condominio p where p.vivienda_id = v.id order by p.pagado_el desc limit 36) x), '[]'),
      'ajustes', coalesce((select jsonb_agg(x order by x.created_at desc) from (
          select a.monto_centavos, a.tipo, a.motivo, a.created_at from public.ajustes_saldo a
           where a.vivienda_id = v.id order by a.created_at desc limit 20) x), '[]')));
  end if;
  return res;
end;
$$;

create or replace function public.vecino_crear_pase(p_token text, p_visitante text, p_tipo_visita text, p_modalidad text,
  p_desde timestamptz, p_hasta timestamptz, p_dias smallint[] default null, p_hora_desde time default null,
  p_hora_hasta time default null, p_placa text default null, p_servicio text default null, p_metodo text default 'qr')
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  nuevo public.pases%rowtype;
begin
  if not public.permiso_residente(r.tipo, r.permisos, 'pases') then raise exception 'sin_permiso'; end if;
  if length(trim(coalesce(p_visitante, ''))) < 2 then raise exception 'Escribe el nombre de la visita'; end if;
  if p_hasta <= p_desde then raise exception 'La vigencia termina antes de empezar'; end if;
  if p_hasta < now() then raise exception 'La vigencia ya pasó'; end if;
  if p_modalidad = 'unico' and p_hasta - p_desde > interval '7 days' then raise exception 'Un pase de un solo uso dura máximo 7 días'; end if;
  if p_modalidad = 'recurrente' and p_hasta - p_desde > interval '366 days' then raise exception 'Un pase recurrente dura máximo un año'; end if;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  insert into public.pases (organizacion_id, condominio_id, vivienda_id, residente_id, visitante, tipo_visita, modalidad,
                            desde, hasta, dias, hora_desde, hora_hasta, max_usos, placa, servicio, metodo_acceso)
  values (r.organizacion_id, r.condominio_id, r.vivienda_id, r.id, left(trim(p_visitante), 120), p_tipo_visita, p_modalidad,
          p_desde, p_hasta, case when p_modalidad = 'recurrente' then p_dias end,
          case when p_modalidad = 'recurrente' then p_hora_desde end, case when p_modalidad = 'recurrente' then p_hora_hasta end,
          case when p_modalidad = 'unico' then 1 end, nullif(upper(left(trim(coalesce(p_placa, '')), 12)), ''),
          nullif(left(trim(coalesce(p_servicio, '')), 40), ''), case when p_metodo = 'lista' and p_modalidad = 'recurrente' then 'lista' else 'qr' end)
  returning * into nuevo;
  return jsonb_build_object('id', nuevo.id, 'codigo', nuevo.codigo);
end;
$$;

create or replace function public.vecino_cancelar_pase(p_token text, p_pase uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  update public.pases set estado = 'cancelado', cancelado_at = now()
   where id = p_pase and vivienda_id = r.vivienda_id and estado = 'activo';
  if not found then raise exception 'No encontramos ese pase'; end if;
end;
$$;

create or replace function public.vecino_mensaje(p_token text, p_texto text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  chat uuid;
begin
  if length(trim(coalesce(p_texto, ''))) = 0 then raise exception 'Escribe un mensaje'; end if;
  insert into public.caseta_chats (organizacion_id, condominio_id, vivienda_id, pendiente, ultimo_at)
  values (r.organizacion_id, r.condominio_id, r.vivienda_id, true, now())
  on conflict (condominio_id, vivienda_id) do update set pendiente = true, ultimo_at = now()
  returning id into chat;
  insert into public.caseta_mensajes (organizacion_id, chat_id, lado, residente_id, texto)
  values (r.organizacion_id, chat, 'residente', r.id, left(trim(p_texto), 1000));
end;
$$;

create or replace function public.vecino_crear_reporte(p_token text, p_categoria text, p_titulo text, p_descripcion text,
                                                       p_ubicacion text, p_sensible boolean)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  c public.condominios%rowtype;
  t record;
begin
  if not public.permiso_residente(r.tipo, r.permisos, 'reportes') then raise exception 'sin_permiso'; end if;
  if length(trim(coalesce(p_titulo, ''))) < 3 then raise exception 'Cuéntanos en una frase qué pasa'; end if;
  select * into c from public.condominios where id = r.condominio_id;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  insert into public.tickets (organizacion_id, propiedad_id, condominio_id, vivienda_id, residente_id, titulo, descripcion,
                              categoria, ubicacion, sensible, canal_origen)
  values (c.organizacion_id, c.propiedad_id, c.id, r.vivienda_id, r.id, left(trim(p_titulo), 120),
          nullif(left(trim(coalesce(p_descripcion, '')), 1000), ''), p_categoria, nullif(left(trim(coalesce(p_ubicacion, '')), 120), ''),
          coalesce(p_sensible, false), 'vecino')
  returning id, folio, token_publico into t;
  return jsonb_build_object('id', t.id, 'folio', t.folio, 'organizacion_id', c.organizacion_id);
end;
$$;

create or replace function public.vecino_reabrir(p_token text, p_ticket uuid, p_motivo text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Cuéntanos por qué lo reabres'; end if;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  update public.tickets set estado = 'reportado', reaperturas = reaperturas + 1, resuelto_at = null
   where id = p_ticket and residente_id = r.id and estado in ('resuelto', 'cancelado');
  if not found then raise exception 'Solo se reabren tus reportes ya cerrados'; end if;
  update public.ticket_historial set nota = 'Reabierto por el vecino: ' || left(trim(p_motivo), 300)
   where id = (select id from public.ticket_historial where ticket_id = p_ticket order by created_at desc limit 1);
end;
$$;

create or replace function public.vecino_registrar_pago(p_token text, p_monto_centavos bigint, p_referencia text, p_pagado_el date,
                                                        p_comprobante_path text, p_clave text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  existente uuid;
  nuevo uuid;
begin
  if not public.permiso_residente(r.tipo, r.permisos, 'registrar_pagos') then raise exception 'sin_permiso'; end if;
  if coalesce(p_monto_centavos, 0) <= 0 then raise exception 'Escribe el monto que transferiste'; end if;
  if p_pagado_el > (now() at time zone 'America/Mexico_City')::date then raise exception 'La fecha no puede ser futura'; end if;
  if p_comprobante_path is not null and p_comprobante_path not like r.organizacion_id || '/condominios/' || r.condominio_id || '/pagos/%' then
    raise exception 'Comprobante no válido';
  end if;
  select id into existente from public.pagos_condominio where condominio_id = r.condominio_id and clave_cliente = p_clave;
  if existente is not null then return jsonb_build_object('id', existente, 'repetido', true); end if;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  insert into public.pagos_condominio (organizacion_id, condominio_id, vivienda_id, monto_centavos, referencia, pagado_el,
                                       comprobante_path, registrado_por, residente_id, clave_cliente)
  values (r.organizacion_id, r.condominio_id, r.vivienda_id, p_monto_centavos, nullif(left(trim(coalesce(p_referencia, '')), 60), ''),
          p_pagado_el, p_comprobante_path, 'residente: ' || r.nombre, r.id, p_clave)
  on conflict (condominio_id, clave_cliente) do nothing
  returning id into nuevo;
  if nuevo is null then
    select id into existente from public.pagos_condominio where condominio_id = r.condominio_id and clave_cliente = p_clave;
    return jsonb_build_object('id', existente, 'repetido', true);
  end if;
  return jsonb_build_object('id', nuevo, 'repetido', false);
end;
$$;

-- Recibo (para imprimir) de un pago confirmado de su vivienda.
create or replace function public.vecino_recibo(p_token text, p_pago uuid)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  x jsonb;
begin
  select jsonb_build_object('folio', c.recibo_serie || '-' || p.folio_recibo, 'monto_centavos', p.monto_centavos, 'pagado_el', p.pagado_el,
                            'referencia', p.referencia, 'emitido', p.recibo_at, 'vivienda', v.numero, 'condominio', c.nombre,
                            'administradora', o.nombre, 'residente', r.nombre,
                            'saldo_centavos', (select saldo_centavos from public.saldos_vivienda where vivienda_id = v.id))
    into x
    from public.pagos_condominio p join public.viviendas v on v.id = p.vivienda_id
    join public.condominios c on c.id = p.condominio_id join public.organizaciones o on o.id = c.organizacion_id
   where p.id = p_pago and p.vivienda_id = r.vivienda_id and p.estado = 'confirmado';
  if x is null or not public.permiso_residente(r.tipo, r.permisos, 'ver_cuenta') then raise exception 'No encontramos ese recibo'; end if;
  return x;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Caseta
-- ─────────────────────────────────────────────────────────────

-- Lo que debe saber quien entra al turno.
create or replace function public.entrega_turno(p_condominio uuid)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'dentro', coalesce((select jsonb_agg(x order by x.ocurrio_at) from (
        select a.id, a.visitante, a.placa, a.ocurrio_at, v.numero as vivienda, a.metodo from public.accesos a
          join public.viviendas v on v.id = a.vivienda_id
         where a.condominio_id = p_condominio and a.tipo = 'entrada' and a.ocurrio_at > now() - interval '24 hours'
           and not exists (select 1 from public.accesos s where s.entrada_id = a.id)) x), '[]'),
    'chats_pendientes', coalesce((select jsonb_agg(x order by x.ultimo_at) from (
        select ch.vivienda_id, v.numero as vivienda, ch.ultimo_at,
               (select m.texto from public.caseta_mensajes m where m.chat_id = ch.id order by m.created_at desc limit 1) as ultimo
          from public.caseta_chats ch join public.viviendas v on v.id = ch.vivienda_id
         where ch.condominio_id = p_condominio and ch.pendiente) x), '[]'),
    'paquetes', coalesce((select jsonb_agg(x order by x.recibido_at) from (
        select k.id, v.numero as vivienda, k.paqueteria, k.descripcion, k.recibido_at, k.avisado_at from public.paquetes k
          join public.viviendas v on v.id = k.vivienda_id
         where k.condominio_id = p_condominio and k.entregado_at is null) x), '[]'),
    'esperados', coalesce((select jsonb_agg(x order by x.desde) from (
        select p.visitante, p.tipo_visita, v.numero as vivienda, p.desde, p.hasta, p.placa from public.pases p
          join public.viviendas v on v.id = p.vivienda_id
         where p.condominio_id = p_condominio and p.estado = 'activo' and p.modalidad = 'unico' and p.usos = 0
           and p.desde < now() + interval '12 hours' and p.hasta > now()
         limit 30) x), '[]'),
    'manuales_pendientes', (select count(*) from public.accesos where condominio_id = p_condominio and revision = 'pendiente'),
    'turno_anterior', (select jsonb_build_object('guardia', g.nombre, 'inicio', t.inicio, 'fin', t.fin, 'notas', t.notas)
                         from public.turnos t join public.guardias g on g.id = t.guardia_id
                        where t.condominio_id = p_condominio and t.fin is not null order by t.fin desc limit 1)
  );
$$;

create or replace function public.caseta_datos(p_turno uuid, p_hash text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  return jsonb_build_object(
    'condominio', (select nombre from public.condominios where id = t.condominio_id),
    'guardia', (select nombre from public.guardias where id = t.guardia_id),
    'inicio', t.inicio,
    'entrega', public.entrega_turno(t.condominio_id),
    -- Datos mínimos para autorizar por teléfono: número de vivienda, nombres y teléfono de residentes activos.
    'viviendas', coalesce((select jsonb_agg(x order by x.numero) from (
        select v.id, v.numero, z.nombre as zona,
               (select jsonb_agg(jsonb_build_object('nombre', r.nombre, 'telefono', r.telefono, 'tipo', r.tipo) order by r.tipo, r.nombre)
                  from public.residentes r where r.vivienda_id = v.id and r.activo) as residentes
          from public.viviendas v left join public.zonas_condominio z on z.id = v.zona_id
         where v.condominio_id = t.condominio_id) x), '[]'),
    'accesos_hoy', coalesce((select jsonb_agg(x order by x.ocurrio_at desc) from (
        select a.id, a.tipo, a.visitante, a.placa, a.metodo, a.autorizo, a.ocurrio_at, v.numero as vivienda, a.revision
          from public.accesos a join public.viviendas v on v.id = a.vivienda_id
         where a.condominio_id = t.condominio_id and a.ocurrio_at > now() - interval '18 hours'
         order by a.ocurrio_at desc limit 60) x), '[]'),
    -- Personal doméstico y pases recurrentes válidos hoy, para buscarlos por nombre.
    'autorizados_hoy', coalesce((select jsonb_agg(x order by x.vivienda, x.visitante) from (
        select p.id, p.visitante, p.servicio, p.tipo_visita, p.hora_desde, p.hora_hasta, p.metodo_acceso, v.numero as vivienda
          from public.pases p join public.viviendas v on v.id = p.vivienda_id
         where p.condominio_id = t.condominio_id and p.estado = 'activo' and p.modalidad = 'recurrente'
           and p.desde <= now() and p.hasta > now()
           and (p.dias is null or extract(isodow from (now() at time zone 'America/Mexico_City'))::smallint = any (p.dias))) x), '[]'),
    'chats', coalesce((select jsonb_agg(x order by x.pendiente desc, x.ultimo_at desc) from (
        select ch.vivienda_id, v.numero as vivienda, ch.pendiente, ch.ultimo_at,
               (select m.texto from public.caseta_mensajes m where m.chat_id = ch.id order by m.created_at desc limit 1) as ultimo
          from public.caseta_chats ch join public.viviendas v on v.id = ch.vivienda_id
         where ch.condominio_id = t.condominio_id order by ch.ultimo_at desc limit 40) x), '[]')
  );
end;
$$;

create or replace function public.caseta_chat(p_turno uuid, p_hash text, p_vivienda uuid)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  return coalesce((select jsonb_agg(x order by x.created_at) from (
      select m.lado, m.texto, m.created_at, coalesce(r.nombre, g.nombre) as autor
        from public.caseta_mensajes m join public.caseta_chats ch on ch.id = m.chat_id
        left join public.residentes r on r.id = m.residente_id left join public.guardias g on g.id = m.guardia_id
       where ch.condominio_id = t.condominio_id and ch.vivienda_id = p_vivienda
       order by m.created_at desc limit 80) x), '[]');
end;
$$;

create or replace function public.caseta_mensaje(p_turno uuid, p_hash text, p_vivienda uuid, p_texto text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
  chat uuid;
begin
  if length(trim(coalesce(p_texto, ''))) = 0 then raise exception 'Escribe un mensaje'; end if;
  insert into public.caseta_chats (organizacion_id, condominio_id, vivienda_id, pendiente, ultimo_at)
  values (t.organizacion_id, t.condominio_id, p_vivienda, false, now())
  on conflict (condominio_id, vivienda_id) do update set pendiente = false, ultimo_at = now()
  returning id into chat;
  insert into public.caseta_mensajes (organizacion_id, chat_id, lado, guardia_id, texto)
  values (t.organizacion_id, chat, 'caseta', t.guardia_id, left(trim(p_texto), 1000));
end;
$$;

create or replace function public.caseta_atendido(p_turno uuid, p_hash text, p_vivienda uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  update public.caseta_chats set pendiente = false where condominio_id = t.condominio_id and vivienda_id = p_vivienda;
end;
$$;

create or replace function public.caseta_paquete(p_turno uuid, p_hash text, p_vivienda uuid, p_paqueteria text, p_descripcion text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
  nuevo uuid;
begin
  insert into public.paquetes (organizacion_id, condominio_id, vivienda_id, paqueteria, descripcion, recibio_id)
  values (t.organizacion_id, t.condominio_id, p_vivienda, nullif(left(trim(coalesce(p_paqueteria, '')), 60), ''),
          nullif(left(trim(coalesce(p_descripcion, '')), 200), ''), t.guardia_id)
  returning id into nuevo;
  return nuevo;
end;
$$;

create or replace function public.caseta_paquete_avisado(p_turno uuid, p_hash text, p_paquete uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  update public.paquetes set avisado_at = coalesce(avisado_at, now()) where id = p_paquete and condominio_id = t.condominio_id;
end;
$$;

create or replace function public.caseta_entregar_paquete(p_turno uuid, p_hash text, p_paquete uuid, p_entregado_a text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  if length(trim(coalesce(p_entregado_a, ''))) < 2 then raise exception 'Escribe quién lo recogió'; end if;
  update public.paquetes set entregado_a = left(trim(p_entregado_a), 80), entrego_id = t.guardia_id, entregado_at = now()
   where id = p_paquete and condominio_id = t.condominio_id and entregado_at is null;
  if not found then raise exception 'Ese paquete ya se entregó'; end if;
end;
$$;

-- Entrada o salida sin QR (autorizada por teléfono) o capturada sin conexión. Queda para revisión de la administración.
-- p_ref es generado por el dispositivo: reenviar el mismo registro no lo duplica.
create or replace function public.caseta_manual(p_turno uuid, p_hash text, p_vivienda uuid, p_tipo text, p_visitante text,
                                                p_placa text, p_autorizo text, p_metodo text, p_ocurrio_at timestamptz, p_ref text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
  nuevo uuid;
begin
  if p_metodo not in ('manual', 'sin_conexion') then raise exception 'Método no válido'; end if;
  if length(trim(coalesce(p_visitante, ''))) < 2 then raise exception 'Escribe el nombre de quien entra'; end if;
  if length(trim(coalesce(p_autorizo, ''))) < 2 then raise exception 'Escribe quién autorizó'; end if;
  if not exists (select 1 from public.viviendas where id = p_vivienda and condominio_id = t.condominio_id) then
    raise exception 'Vivienda no válida';
  end if;
  perform set_config('bk.actor', 'caseta', true);
  insert into public.accesos (organizacion_id, condominio_id, vivienda_id, tipo, visitante, placa, metodo, autorizo, guardia_id,
                              turno_id, revision, ref_cliente, ocurrio_at)
  values (t.organizacion_id, t.condominio_id, p_vivienda, p_tipo, left(trim(p_visitante), 120),
          nullif(upper(left(trim(coalesce(p_placa, '')), 12)), ''), p_metodo, left(trim(p_autorizo), 120), t.guardia_id, t.id,
          'pendiente', p_ref, least(coalesce(p_ocurrio_at, now()), now()))
  on conflict (condominio_id, ref_cliente) do nothing
  returning id into nuevo;
  return jsonb_build_object('ok', true, 'repetido', nuevo is null);
end;
$$;

create or replace function public.cerrar_turno(p_turno uuid, p_hash text, p_notas text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
  e jsonb := public.entrega_turno(t.condominio_id);
begin
  perform set_config('bk.actor', 'caseta', true);
  update public.turnos set fin = now(), sesion_hash = null, notas = nullif(left(trim(coalesce(p_notas, '')), 1000), ''), entrega = e
   where id = t.id;
  return e;
end;
$$;

-- Sobrecarga con secreto del dispositivo: la que usa la app.
create or replace function public.caseta_entrada(p_turno uuid, p_hash text, p_codigo text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.turno_valido(p_turno, p_hash);
  return public.caseta_registrar_entrada(p_turno, p_codigo, now());
end;
$$;

create or replace function public.caseta_salida(p_turno uuid, p_hash text, p_entrada uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.turno_valido(p_turno, p_hash);
  return public.caseta_registrar_salida(p_turno, p_entrada);
end;
$$;

-- Estas funciones solo las llama el servidor.
do $$
declare f text;
begin
  foreach f in array array[
    'residente_por_token(text)', 'turno_valido(uuid, text)', 'resumen_condominio(uuid, date, boolean)', 'comite_datos(text, date)',
    'movimientos_condominio(uuid, date)', 'comite_movimientos(text, date)', 'vecino_datos(text)',
    'vecino_crear_pase(text, text, text, text, timestamptz, timestamptz, smallint[], time, time, text, text, text)',
    'vecino_cancelar_pase(text, uuid)', 'vecino_mensaje(text, text)', 'vecino_crear_reporte(text, text, text, text, text, boolean)',
    'vecino_reabrir(text, uuid, text)', 'vecino_registrar_pago(text, bigint, text, date, text, text)', 'vecino_recibo(text, uuid)',
    'entrega_turno(uuid)', 'caseta_datos(uuid, text)', 'caseta_chat(uuid, text, uuid)', 'caseta_mensaje(uuid, text, uuid, text)',
    'caseta_atendido(uuid, text, uuid)', 'caseta_paquete(uuid, text, uuid, text, text)', 'caseta_paquete_avisado(uuid, text, uuid)',
    'caseta_entregar_paquete(uuid, text, uuid, text)',
    'caseta_manual(uuid, text, uuid, text, text, text, text, text, timestamptz, text)', 'cerrar_turno(uuid, text, text)',
    'caseta_entrada(uuid, text, text)', 'caseta_salida(uuid, text, uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
revoke execute on function public.reporte_condominio(uuid, date) from public, anon;
revoke execute on function public.exportar_movimientos(uuid, date) from public, anon;
grant execute on function public.reporte_condominio(uuid, date) to authenticated;
grant execute on function public.exportar_movimientos(uuid, date) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Datos de ejemplo (botón "Cargar condominios de ejemplo"): dos comunidades ficticias para demos y pruebas.
-- Todos los nombres y teléfonos son inventados. PIN de los guardias de ejemplo: 1234.
-- ─────────────────────────────────────────────────────────────
create or replace function public.demo_condominios(p_org uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  a uuid; b uuid;
  za uuid[] := '{}'; zb uuid[] := '{}';
  z uuid; v uuid; g uuid; r uuid;
  calles text[] := array['Encino', 'Fresno', 'Sauce'];
  nombres text[] := array['Ana Ruiz', 'Carlos Méndez', 'Lucía Herrera', 'Jorge Salinas', 'Mariana Ochoa', 'Pablo Treviño',
                          'Sofía Cantú', 'Diego Arriaga', 'Valeria Núñez', 'Andrés Robles', 'Fernanda Lara', 'Ricardo Pineda'];
  mes date := date_trunc('month', (now() at time zone 'America/Mexico_City'))::date;
  previo date := (date_trunc('month', (now() at time zone 'America/Mexico_City')) - interval '1 month')::date;
  i int;
begin
  if not public.es_admin(p_org) then raise exception 'Sin permiso'; end if;
  perform set_config('bk.actor', 'datos de ejemplo', true);

  -- Privada con calles (60 casas)
  a := public.crear_condominio(p_org, 'Privada Los Encinos (ejemplo)', 'Av. de los Encinos 100, Jurica', 'Jurica');
  update public.condominios set datos_pago = 'Banco Ejemplo · CLABE 000000000000000000 · A nombre de Condóminos Los Encinos A.C. (ficticio)'
   where id = a;
  for i in 1 .. 3 loop
    insert into public.zonas_condominio (organizacion_id, condominio_id, nombre, tipo) values (p_org, a, 'Calle ' || calles[i], 'calle') returning id into z;
    za := za || z;
  end loop;
  for i in 1 .. 60 loop
    insert into public.viviendas (organizacion_id, condominio_id, zona_id, numero)
    values (p_org, a, za[((i - 1) / 20) + 1], 'Casa ' || i) returning id into v;
    if i <= 12 then
      insert into public.residentes (organizacion_id, condominio_id, vivienda_id, nombre, telefono, tipo)
      values (p_org, a, v, nombres[i], '442 000 ' || lpad(i::text, 4, '0'), case when i in (3, 7) then 'inquilino' else 'propietario' end);
    end if;
  end loop;

  -- Condominio vertical (2 torres, 40 departamentos)
  b := public.crear_condominio(p_org, 'Torres Alamar (ejemplo)', 'Blvd. Bernardo Quintana 500', 'Centro Sur');
  update public.condominios set datos_pago = 'Banco Ejemplo · CLABE 111111111111111111 · Condominio Torres Alamar (ficticio)' where id = b;
  for i in 1 .. 2 loop
    insert into public.zonas_condominio (organizacion_id, condominio_id, nombre, tipo) values (p_org, b, 'Torre ' || chr(64 + i), 'torre') returning id into z;
    zb := zb || z;
  end loop;
  for i in 1 .. 40 loop
    insert into public.viviendas (organizacion_id, condominio_id, zona_id, numero)
    values (p_org, b, zb[((i - 1) / 20) + 1], chr(64 + ((i - 1) / 20) + 1) || '-' || (100 * (((i - 1) % 20) / 4 + 1) + ((i - 1) % 4) + 1))
    returning id into v;
    if i <= 4 then
      insert into public.residentes (organizacion_id, condominio_id, vivienda_id, nombre, telefono, tipo)
      values (p_org, b, v, nombres[13 - i], '442 111 ' || lpad(i::text, 4, '0'), 'propietario');
    end if;
  end loop;

  -- Guardias con PIN 1234
  foreach z in array array[a, b] loop
    insert into public.guardias (organizacion_id, condominio_id, nombre) values (p_org, z, 'Guardia matutino') returning id into g;
    insert into public.guardias_pin values (g, extensions.crypt('1234', extensions.gen_salt('bf')));
    insert into public.guardias (organizacion_id, condominio_id, nombre) values (p_org, z, 'Guardia nocturno') returning id into g;
    insert into public.guardias_pin values (g, extensions.crypt('1234', extensions.gen_salt('bf')));
  end loop;

  -- Cuotas del mes anterior y del actual
  insert into public.cargos_condominio (organizacion_id, condominio_id, vivienda_id, concepto, periodo, monto_centavos, vence, creado_por)
  select p_org, vv.condominio_id, vv.id, 'mantenimiento', m, case when vv.condominio_id = a then 120000 else 180000 end, m + 9, 'datos de ejemplo'
    from public.viviendas vv, unnest(array[previo, mes]) m where vv.condominio_id in (a, b);
  insert into public.cargos_condominio (organizacion_id, condominio_id, vivienda_id, concepto, periodo, monto_centavos, vence, creado_por)
  select p_org, a, vv.id, 'agua', mes, 25000, mes + 9, 'datos de ejemplo' from public.viviendas vv where vv.condominio_id = a;
  -- Saldo inicial importado en algunas casas
  insert into public.ajustes_saldo (organizacion_id, condominio_id, vivienda_id, monto_centavos, tipo, motivo, creado_por)
  select p_org, a, vv.id, 240000, 'saldo_inicial', 'Adeudo de la administración anterior', 'datos de ejemplo'
    from public.viviendas vv where vv.condominio_id = a and vv.numero in ('Casa 5', 'Casa 18', 'Casa 41');
  -- Pagos confirmados del mes anterior (la mayoría) con recibo
  insert into public.pagos_condominio (organizacion_id, condominio_id, vivienda_id, monto_centavos, referencia, pagado_el, registrado_por, estado, revisado_por, revisado_at)
  select p_org, vv.condominio_id, vv.id, case when vv.condominio_id = a then 120000 else 180000 end, 'SPEI ' || (1000 + row_number() over ()),
         previo + 5, 'datos de ejemplo', 'confirmado', 'datos de ejemplo', now()
    from public.viviendas vv where vv.condominio_id in (a, b) and (hashtext(vv.id::text) % 5) <> 0;
  update public.pagos_condominio pp set folio_recibo = x.n, recibo_at = now()
    from (select id, row_number() over (partition by condominio_id order by created_at, id) n from public.pagos_condominio
           where condominio_id in (a, b)) x where pp.id = x.id;
  update public.condominios cc set ultimo_recibo = (select coalesce(max(folio_recibo), 0) from public.pagos_condominio where condominio_id = cc.id)
   where cc.id in (a, b);
  -- Un pago por revisar
  insert into public.pagos_condominio (organizacion_id, condominio_id, vivienda_id, monto_centavos, referencia, pagado_el, registrado_por, residente_id)
  select p_org, a, rr.vivienda_id, 145000, 'SPEI 99881', (now() at time zone 'America/Mexico_City')::date, 'residente: ' || rr.nombre, rr.id
    from public.residentes rr where rr.condominio_id = a order by rr.created_at limit 1;
  -- Gastos
  insert into public.gastos_condominio (organizacion_id, condominio_id, categoria, descripcion, monto_centavos, fecha, creado_por) values
    (p_org, a, 'Vigilancia', 'Servicio de seguridad (ejemplo)', 3800000, mes + 1, 'datos de ejemplo'),
    (p_org, a, 'Jardinería', 'Mantenimiento de áreas verdes (ejemplo)', 650000, mes + 2, 'datos de ejemplo'),
    (p_org, a, 'Energía', 'Alumbrado de áreas comunes (ejemplo)', 420000, mes + 3, 'datos de ejemplo'),
    (p_org, b, 'Elevadores', 'Póliza mensual de elevadores (ejemplo)', 900000, mes + 1, 'datos de ejemplo');
  -- Avisos
  insert into public.avisos_condominio (organizacion_id, condominio_id, zona_id, titulo, cuerpo, creado_por) values
    (p_org, a, null, 'Bienvenidos a la nueva app', 'Desde aquí pueden crear pases para sus visitas, ver su estado de cuenta y reportar fallas.', 'datos de ejemplo'),
    (p_org, a, za[2], 'Corte de agua en Calle Fresno', 'El jueves de 10:00 a 14:00 habrá corte por reparación de una válvula.', 'datos de ejemplo');
  -- Amenidades
  insert into public.amenidades (organizacion_id, condominio_id, nombre, tipo, descripcion, modo, capacidad, hora_abre, hora_cierra, duraciones, reglas) values
    (p_org, a, 'Gimnasio', 'gimnasio', 'Caminadoras, bicicletas y pesas.', 'turnos', 6, '06:00', '22:00', '{60,90}', 'Usa toalla. Limpia el equipo al terminar.'),
    (p_org, b, 'Gimnasio', 'gimnasio', 'Equipo de cardio y pesas.', 'turnos', 4, '06:00', '22:00', '{60}', 'Usa toalla. Limpia el equipo al terminar.');
  insert into public.amenidades (organizacion_id, condominio_id, nombre, tipo, descripcion, modo, capacidad, hora_abre, hora_cierra, duraciones, renta_centavos, deposito_centavos, reglas) values
    (p_org, a, 'Salón de eventos', 'salon', 'Salón con terraza y cocina de apoyo.', 'solicitud', 50, '10:00', '23:59', '{240,360}', 250000, 100000,
     'Música hasta las 23:00. Entrega el salón limpio. El depósito se devuelve si no hay daños.'),
    (p_org, b, 'Roof garden', 'terraza', 'Terraza con asador en el último piso.', 'solicitud', 30, '10:00', '23:00', '{240}', 150000, 80000,
     'Música hasta las 22:00. Recoge la basura al terminar.');

  -- Un pase, un paquete y un reporte para que la demo no empiece vacía
  select rr.id, rr.vivienda_id into r, v from public.residentes rr where rr.condominio_id = a order by rr.created_at limit 1;
  insert into public.pases (organizacion_id, condominio_id, vivienda_id, residente_id, visitante, desde, hasta, max_usos)
  values (p_org, a, v, r, 'Visita de ejemplo', now(), now() + interval '1 day', 1);
  insert into public.paquetes (organizacion_id, condominio_id, vivienda_id, paqueteria, descripcion)
  values (p_org, a, v, 'Mercado Libre', 'Caja mediana');
  insert into public.tickets (organizacion_id, propiedad_id, condominio_id, vivienda_id, residente_id, titulo, categoria, ubicacion, canal_origen)
  select p_org, c.propiedad_id, a, v, r, 'Lámpara fundida en el andador', 'electricidad', 'Andador frente a Casa 3', 'vecino'
    from public.condominios c where c.id = a;

  return jsonb_build_object('condominios', jsonb_build_array(a, b));
end;
$$;
revoke execute on function public.demo_condominios(uuid) from public, anon;
grant execute on function public.demo_condominios(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Personal autorizado sin QR: caseta lo busca en la lista y registra la entrada con las mismas reglas del pase.
-- ─────────────────────────────────────────────────────────────
create or replace function public.caseta_entrada_pase(p_turno uuid, p_hash text, p_pase uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
  cod text;
begin
  select codigo into cod from public.pases where id = p_pase and condominio_id = t.condominio_id;
  if cod is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  return public.caseta_registrar_entrada(p_turno, cod, now());
end;
$$;
revoke execute on function public.caseta_entrada_pase(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.caseta_entrada_pase(uuid, text, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Alta de residentes con INE y selfie
-- El residente abre el link de alta del condominio, elige su vivienda, sube su INE (frente y reverso) y una
-- selfie, y acepta el aviso de privacidad. La administración compara las fotos y aprueba o rechaza.
-- Al decidir, las imágenes se borran: solo queda quién verificó y cuándo (minimización de datos).
-- La comparación facial automática no está activa: requiere un proveedor de verificación (ver README).
-- ─────────────────────────────────────────────────────────────
create table public.solicitudes_alta (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id    uuid not null references public.condominios(id) on delete cascade,
  vivienda_id      uuid not null references public.viviendas(id) on delete cascade,
  nombre           text not null check (length(nombre) between 3 and 120),
  telefono         text not null check (length(telefono) between 7 and 30),
  email            text,
  tipo             text not null check (tipo in ('propietario', 'inquilino')),
  ine_frente_path  text,
  ine_reverso_path text,
  selfie_path      text,
  revision_manual  boolean not null default false,    -- la persona pidió revisión sin selfie
  consentimiento_at timestamptz not null,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  revisado_por     text,
  revisado_at      timestamptz,
  nota             text,
  residente_id     uuid references public.residentes(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index solicitudes_alta_cond_idx on public.solicitudes_alta (condominio_id, estado);
create trigger solicitudes_alta_valida before insert or update on public.solicitudes_alta
  for each row execute function public.validar_condominio();
create trigger solicitudes_alta_bitacora after insert or update or delete on public.solicitudes_alta
  for each row execute function public.bitacora_cambio();
alter table public.solicitudes_alta enable row level security;
create policy "miembros leen" on public.solicitudes_alta for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.solicitudes_alta for update to authenticated
  using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.solicitudes_alta for delete to authenticated using (public.es_admin(organizacion_id));

-- Lo que ve quien abre el link de alta: nombre del condominio y números de vivienda (sin nombres de nadie).
create or replace function public.alta_datos(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare c public.condominios%rowtype;
begin
  select * into c from public.condominios where alta_token = p_token;
  if not found then raise exception 'link_invalido'; end if;
  return jsonb_build_object('condominio', c.nombre, 'condominio_id', c.id, 'organizacion_id', c.organizacion_id,
    'administradora', (select nombre from public.organizaciones where id = c.organizacion_id),
    'viviendas', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'numero', v.numero) order by length(v.numero), v.numero)
                           from public.viviendas v where v.condominio_id = c.id), '[]'));
end;
$$;

create or replace function public.alta_crear(p_token text, p_vivienda uuid, p_nombre text, p_telefono text, p_email text, p_tipo text,
                                             p_frente text, p_reverso text, p_selfie text, p_revision_manual boolean)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  c public.condominios%rowtype;
  carpeta text;
  nuevo uuid;
begin
  select * into c from public.condominios where alta_token = p_token;
  if not found then raise exception 'link_invalido'; end if;
  if not exists (select 1 from public.viviendas where id = p_vivienda and condominio_id = c.id) then raise exception 'Elige tu vivienda'; end if;
  if p_tipo not in ('propietario', 'inquilino') then raise exception 'Elige si eres propietario o inquilino'; end if;
  if length(trim(coalesce(p_nombre, ''))) < 3 then raise exception 'Escribe tu nombre completo'; end if;
  if length(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')) < 10 then raise exception 'Escribe tu celular a 10 dígitos'; end if;
  carpeta := c.organizacion_id || '/condominios/' || c.id || '/altas/';
  if p_frente is null or p_reverso is null or p_frente not like carpeta || '%' or p_reverso not like carpeta || '%'
     or (p_selfie is not null and p_selfie not like carpeta || '%') then
    raise exception 'Sube las fotos de tu INE';
  end if;
  if p_selfie is null and not coalesce(p_revision_manual, false) then raise exception 'Toma tu selfie o pide revisión manual'; end if;
  -- Freno simple contra abuso del link público.
  if (select count(*) from public.solicitudes_alta where condominio_id = c.id and estado = 'pendiente') >= 200 then
    raise exception 'Hay demasiadas solicitudes pendientes; avisa a tu administración';
  end if;
  perform set_config('bk.actor', 'alta: ' || left(trim(p_nombre), 60), true);
  insert into public.solicitudes_alta (organizacion_id, condominio_id, vivienda_id, nombre, telefono, email, tipo, ine_frente_path,
                                       ine_reverso_path, selfie_path, revision_manual, consentimiento_at)
  values (c.organizacion_id, c.id, p_vivienda, left(trim(p_nombre), 120), left(trim(p_telefono), 30),
          nullif(lower(left(trim(coalesce(p_email, '')), 160)), ''), p_tipo, p_frente, p_reverso, p_selfie,
          p_selfie is null, now())
  returning id into nuevo;
  return nuevo;
end;
$$;

-- La administración decide. Al aprobar crea al residente con su link. Devuelve las rutas a borrar del almacenamiento.
create or replace function public.decidir_alta(p_solicitud uuid, p_aprobar boolean, p_nota text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  s public.solicitudes_alta%rowtype;
  quien text := coalesce(auth.jwt() ->> 'email', 'administradora');
  r uuid;
  tk text;
begin
  select * into s from public.solicitudes_alta where id = p_solicitud for update;
  if not found or not public.es_miembro(s.organizacion_id) then raise exception 'No encontramos la solicitud'; end if;
  if s.estado <> 'pendiente' then raise exception 'Esta solicitud ya se revisó'; end if;
  perform set_config('bk.actor', quien, true);
  if p_aprobar then
    insert into public.residentes (organizacion_id, condominio_id, vivienda_id, nombre, telefono, email, tipo)
    values (s.organizacion_id, s.condominio_id, s.vivienda_id, s.nombre, s.telefono, s.email, s.tipo)
    returning id, token into r, tk;
  end if;
  update public.solicitudes_alta
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end, revisado_por = quien, revisado_at = now(),
         nota = coalesce(nullif(left(trim(coalesce(p_nota, '')), 300), ''), case when p_aprobar then 'Identidad verificada' end),
         residente_id = r, ine_frente_path = null, ine_reverso_path = null, selfie_path = null
   where id = s.id;
  return jsonb_build_object('residente_id', r, 'token', tk, 'telefono', s.telefono, 'nombre', s.nombre,
    'borrar', to_jsonb(array_remove(array[s.ine_frente_path, s.ine_reverso_path, s.selfie_path], null)));
end;
$$;

create or replace function public.renovar_alta_token(p_condominio uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare org uuid;
begin
  select organizacion_id into org from public.condominios where id = p_condominio;
  if org is null or not public.es_admin(org) then raise exception 'Sin permiso'; end if;
  update public.condominios set alta_token = public.token_opaco(16) where id = p_condominio;
end;
$$;

revoke execute on function public.alta_datos(text) from public, anon, authenticated;
revoke execute on function public.alta_crear(text, uuid, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.alta_datos(text) to service_role;
grant execute on function public.alta_crear(text, uuid, text, text, text, text, text, text, text, boolean) to service_role;
revoke execute on function public.decidir_alta(uuid, boolean, text) from public, anon;
revoke execute on function public.renovar_alta_token(uuid) from public, anon;
grant execute on function public.decidir_alta(uuid, boolean, text) to authenticated;
grant execute on function public.renovar_alta_token(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════
-- Amenidades y mudanzas
-- ═════════════════════════════════════════════════════════════
create table public.amenidades (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id     uuid not null references public.condominios(id) on delete cascade,
  nombre            text not null check (length(nombre) between 1 and 80),
  tipo              text not null default 'otro' check (tipo in ('gimnasio', 'salon', 'terraza', 'asador', 'cancha', 'alberca', 'otro')),
  descripcion       text,
  reglas            text,
  foto_path         text,
  -- turnos: se confirma sola si hay lugar (gimnasio, cancha). solicitud: la administración aprueba (salón).
  modo              text not null default 'turnos' check (modo in ('turnos', 'solicitud')),
  capacidad         integer not null default 1 check (capacidad > 0),     -- turnos: personas por turno · solicitud: aforo
  hora_abre         time not null default '07:00',
  hora_cierra       time not null default '22:00',
  duraciones        integer[] not null default '{60}',                    -- minutos que se pueden elegir
  renta_centavos    bigint not null default 0 check (renta_centavos >= 0),
  deposito_centavos bigint not null default 0 check (deposito_centavos >= 0),
  activo            boolean not null default true,
  created_at        timestamptz not null default now()
);
create index amenidades_cond_idx on public.amenidades (condominio_id);

create table public.reservas (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id     uuid not null references public.condominios(id) on delete cascade,
  amenidad_id       uuid not null references public.amenidades(id) on delete cascade,
  vivienda_id       uuid not null references public.viviendas(id) on delete cascade,
  residente_id      uuid references public.residentes(id) on delete set null,
  inicio            timestamptz not null,
  fin               timestamptz not null,
  personas          integer not null default 1 check (personas > 0),
  estado            text not null check (estado in ('confirmada', 'solicitada', 'espera', 'rechazada', 'cancelada')),
  renta_centavos    bigint not null default 0,
  deposito_centavos bigint not null default 0,
  deposito_estado   text check (deposito_estado in ('cargado', 'devuelto', 'retenido')),
  nota              text,
  revisado_por      text,
  revisado_at       timestamptz,
  created_at        timestamptz not null default now(),
  check (fin > inicio)
);
create index reservas_amen_idx on public.reservas (amenidad_id, inicio);
create index reservas_viv_idx on public.reservas (vivienda_id, inicio desc);

create table public.mudanzas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id    uuid not null references public.condominios(id) on delete cascade,
  vivienda_id      uuid not null references public.viviendas(id) on delete cascade,
  residente_id     uuid references public.residentes(id) on delete set null,
  tipo             text not null check (tipo in ('entrada', 'salida')),
  inicio           timestamptz not null,
  fin              timestamptz not null,
  empresa          text not null check (length(empresa) between 2 and 80),
  placa            text,
  recursos         text[] not null default '{}',        -- zona_carga, elevador
  estado           text not null default 'solicitada' check (estado in ('solicitada', 'aprobada', 'rechazada', 'cancelada')),
  pase_id          uuid references public.pases(id) on delete set null,
  nota             text,
  revisado_por     text,
  revisado_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (fin > inicio)
);
create index mudanzas_cond_idx on public.mudanzas (condominio_id, inicio);

do $$
declare t text;
begin
  foreach t in array array['amenidades', 'reservas', 'mudanzas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "miembros leen" on public.%I for select to authenticated using (public.es_miembro(organizacion_id))', t);
    execute format('create policy "miembros crean" on public.%I for insert to authenticated with check (public.es_miembro(organizacion_id))', t);
    execute format('create policy "miembros editan" on public.%I for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id))', t);
    execute format('create policy "admins borran" on public.%I for delete to authenticated using (public.es_admin(organizacion_id))', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.validar_condominio()', t || '_valida', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.bitacora_cambio()', t || '_bitacora', t);
  end loop;
end;
$$;

-- Reserva desde el portal. El candado sobre la amenidad evita que dos vecinos tomen el último lugar al mismo tiempo.
create or replace function public.vecino_reservar(p_token text, p_amenidad uuid, p_inicio timestamptz, p_minutos integer, p_personas integer)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  a public.amenidades%rowtype;
  v_fin timestamptz := p_inicio + make_interval(mins => p_minutos);
  ini_local time := (p_inicio at time zone 'America/Mexico_City')::time;
  fin_local time := (v_fin at time zone 'America/Mexico_City')::time;
  ocupado integer;
  estado text;
  nuevo uuid;
begin
  select * into a from public.amenidades where id = p_amenidad and condominio_id = r.condominio_id and activo for update;
  if not found then raise exception 'No encontramos esa amenidad'; end if;
  if not (p_minutos = any (a.duraciones)) then raise exception 'Elige una duración válida'; end if;
  if p_inicio < now() - interval '5 minutes' then raise exception 'Ese horario ya pasó'; end if;
  if p_inicio > now() + interval '90 days' then raise exception 'Solo se reserva con hasta 90 días de anticipación'; end if;
  if ini_local < a.hora_abre or (fin_local > a.hora_cierra and fin_local <> '00:00') or (p_inicio at time zone 'America/Mexico_City')::date <> ((v_fin - interval '1 second') at time zone 'America/Mexico_City')::date then
    raise exception 'Fuera del horario de la amenidad (%–%)', to_char(a.hora_abre, 'HH24:MI'), to_char(a.hora_cierra, 'HH24:MI');
  end if;
  if coalesce(p_personas, 1) < 1 or (a.modo = 'solicitud' and p_personas > a.capacidad) then raise exception 'El aforo máximo es de % personas', a.capacidad; end if;

  if a.modo = 'turnos' then
    if exists (select 1 from public.reservas x where x.amenidad_id = a.id and x.vivienda_id = r.vivienda_id and x.estado in ('confirmada', 'espera')
               and x.inicio < v_fin and x.fin > p_inicio) then
      raise exception 'Ya tienes una reserva en ese horario';
    end if;
    select coalesce(sum(x.personas), 0) into ocupado from public.reservas x
     where x.amenidad_id = a.id and x.estado = 'confirmada' and x.inicio < v_fin and x.fin > p_inicio;
    estado := case when ocupado + p_personas <= a.capacidad then 'confirmada' else 'espera' end;
  else
    if exists (select 1 from public.reservas x where x.amenidad_id = a.id and x.estado in ('confirmada', 'solicitada')
               and x.inicio < v_fin and x.fin > p_inicio) then
      raise exception 'Ese horario ya está apartado. Elige otro';
    end if;
    estado := 'solicitada';
  end if;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  insert into public.reservas (organizacion_id, condominio_id, amenidad_id, vivienda_id, residente_id, inicio, fin, personas, estado,
                               renta_centavos, deposito_centavos)
  values (r.organizacion_id, r.condominio_id, a.id, r.vivienda_id, r.id, p_inicio, v_fin, p_personas, estado,
          a.renta_centavos, a.deposito_centavos)
  returning id into nuevo;
  return jsonb_build_object('id', nuevo, 'estado', estado);
end;
$$;

-- Cancelar libera el lugar: el primero en lista de espera que quepa queda confirmado.
create or replace function public.vecino_cancelar_reserva(p_token text, p_reserva uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  x public.reservas%rowtype;
  a public.amenidades%rowtype;
  e record;
begin
  select * into x from public.reservas where id = p_reserva and vivienda_id = r.vivienda_id and estado in ('confirmada', 'solicitada', 'espera');
  if not found then raise exception 'No encontramos esa reserva'; end if;
  if x.deposito_estado = 'cargado' then raise exception 'Esta reserva ya tiene cargos; pide a la administración que la cancele'; end if;
  select * into a from public.amenidades where id = x.amenidad_id for update;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  update public.reservas set estado = 'cancelada' where id = x.id;
  if x.estado = 'confirmada' and a.modo = 'turnos' then
    for e in select * from public.reservas w where w.amenidad_id = a.id and w.estado = 'espera' and w.inicio < x.fin and w.fin > x.inicio order by w.created_at loop
      if (select coalesce(sum(c.personas), 0) from public.reservas c where c.amenidad_id = a.id and c.estado = 'confirmada'
          and c.inicio < e.fin and c.fin > e.inicio) + e.personas <= a.capacidad then
        update public.reservas set estado = 'confirmada', nota = 'Pasó de lista de espera' where id = e.id;
      end if;
    end loop;
  end if;
end;
$$;

-- La administración aprueba o rechaza un salón. Al aprobar, la renta y el depósito se cargan al estado de cuenta.
create or replace function public.decidir_reserva(p_reserva uuid, p_aprobar boolean, p_nota text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  x public.reservas%rowtype;
  a public.amenidades%rowtype;
  quien text := coalesce(auth.jwt() ->> 'email', 'administradora');
  fecha text;
begin
  select * into x from public.reservas where id = p_reserva for update;
  if not found or not public.es_miembro(x.organizacion_id) then raise exception 'No encontramos la reserva'; end if;
  if x.estado <> 'solicitada' then raise exception 'Esta reserva ya se revisó'; end if;
  select * into a from public.amenidades where id = x.amenidad_id;
  fecha := to_char(x.inicio at time zone 'America/Mexico_City', 'DD/MM/YYYY');
  perform set_config('bk.actor', quien, true);
  if p_aprobar then
    if x.renta_centavos > 0 then
      insert into public.cargos_condominio (organizacion_id, condominio_id, vivienda_id, concepto, descripcion, periodo, monto_centavos, vence, creado_por)
      values (x.organizacion_id, x.condominio_id, x.vivienda_id, 'otro', 'Renta ' || a.nombre || ' ' || fecha || ' · ' || left(x.id::text, 8),
              date_trunc('month', x.inicio at time zone 'America/Mexico_City')::date, x.renta_centavos, (x.inicio at time zone 'America/Mexico_City')::date, quien);
    end if;
    if x.deposito_centavos > 0 then
      insert into public.cargos_condominio (organizacion_id, condominio_id, vivienda_id, concepto, descripcion, periodo, monto_centavos, vence, creado_por)
      values (x.organizacion_id, x.condominio_id, x.vivienda_id, 'otro', 'Depósito reembolsable ' || a.nombre || ' ' || fecha || ' · ' || left(x.id::text, 8),
              date_trunc('month', x.inicio at time zone 'America/Mexico_City')::date, x.deposito_centavos, (x.inicio at time zone 'America/Mexico_City')::date, quien);
    end if;
  end if;
  update public.reservas set estado = case when p_aprobar then 'confirmada' else 'rechazada' end,
         deposito_estado = case when p_aprobar and x.deposito_centavos > 0 then 'cargado' end,
         nota = nullif(left(trim(coalesce(p_nota, '')), 300), ''), revisado_por = quien, revisado_at = now()
   where id = x.id;
end;
$$;

-- Después del evento: se devuelve el depósito (ajuste a favor) o se retiene con motivo.
create or replace function public.cerrar_deposito(p_reserva uuid, p_devolver boolean, p_nota text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  x public.reservas%rowtype;
  a public.amenidades%rowtype;
  quien text := coalesce(auth.jwt() ->> 'email', 'administradora');
begin
  select * into x from public.reservas where id = p_reserva for update;
  if not found or not public.es_miembro(x.organizacion_id) then raise exception 'No encontramos la reserva'; end if;
  if x.deposito_estado is distinct from 'cargado' then raise exception 'Este depósito ya se cerró'; end if;
  if not p_devolver and length(trim(coalesce(p_nota, ''))) < 3 then raise exception 'Escribe por qué se retiene el depósito'; end if;
  select * into a from public.amenidades where id = x.amenidad_id;
  perform set_config('bk.actor', quien, true);
  if p_devolver then
    insert into public.ajustes_saldo (organizacion_id, condominio_id, vivienda_id, monto_centavos, tipo, motivo, creado_por)
    values (x.organizacion_id, x.condominio_id, x.vivienda_id, -x.deposito_centavos, 'ajuste',
            'Devolución de depósito ' || a.nombre || ' · ' || left(x.id::text, 8), quien);
  end if;
  update public.reservas set deposito_estado = case when p_devolver then 'devuelto' else 'retenido' end,
         nota = coalesce(nullif(left(trim(coalesce(p_nota, '')), 300), ''), nota)
   where id = x.id;
end;
$$;

create or replace function public.vecino_solicitar_mudanza(p_token text, p_tipo text, p_inicio timestamptz, p_fin timestamptz,
                                                           p_empresa text, p_placa text, p_recursos text[])
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  rec text[] := array(select unnest(coalesce(p_recursos, '{}')) intersect select unnest(array['zona_carga', 'elevador']));
  nuevo uuid;
begin
  if p_tipo not in ('entrada', 'salida') then raise exception 'Elige entrada o salida'; end if;
  if p_fin <= p_inicio or p_fin - p_inicio > interval '12 hours' then raise exception 'Revisa el horario (máximo 12 horas)'; end if;
  if p_inicio < now() then raise exception 'Elige una fecha futura'; end if;
  if length(trim(coalesce(p_empresa, ''))) < 2 then raise exception 'Escribe la empresa de mudanza'; end if;
  if exists (select 1 from public.mudanzas m where m.condominio_id = r.condominio_id and m.estado = 'aprobada'
             and m.inicio < p_fin and m.fin > p_inicio and m.recursos && rec) then
    raise exception 'La zona de carga o el elevador ya están apartados en ese horario';
  end if;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  insert into public.mudanzas (organizacion_id, condominio_id, vivienda_id, residente_id, tipo, inicio, fin, empresa, placa, recursos)
  values (r.organizacion_id, r.condominio_id, r.vivienda_id, r.id, p_tipo, p_inicio, p_fin, left(trim(p_empresa), 80),
          nullif(upper(left(trim(coalesce(p_placa, '')), 12)), ''), rec)
  returning id into nuevo;
  return nuevo;
end;
$$;

create or replace function public.vecino_cancelar_mudanza(p_token text, p_mudanza uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  m public.mudanzas%rowtype;
begin
  select * into m from public.mudanzas where id = p_mudanza and vivienda_id = r.vivienda_id and estado in ('solicitada', 'aprobada') for update;
  if not found then raise exception 'No encontramos esa mudanza'; end if;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  update public.mudanzas set estado = 'cancelada' where id = m.id;
  if m.pase_id is not null then update public.pases set estado = 'cancelado', cancelado_at = now() where id = m.pase_id; end if;
end;
$$;

-- Aprobar una mudanza crea su pase QR (varias entradas dentro del horario) y aparece en la caseta.
create or replace function public.decidir_mudanza(p_mudanza uuid, p_aprobar boolean, p_nota text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  m public.mudanzas%rowtype;
  quien text := coalesce(auth.jwt() ->> 'email', 'administradora');
  pase uuid;
begin
  select * into m from public.mudanzas where id = p_mudanza for update;
  if not found or not public.es_miembro(m.organizacion_id) then raise exception 'No encontramos la mudanza'; end if;
  if m.estado <> 'solicitada' then raise exception 'Esta mudanza ya se revisó'; end if;
  perform set_config('bk.actor', quien, true);
  if p_aprobar then
    if exists (select 1 from public.mudanzas x where x.condominio_id = m.condominio_id and x.estado = 'aprobada' and x.id <> m.id
               and x.inicio < m.fin and x.fin > m.inicio and x.recursos && m.recursos) then
      raise exception 'Choca con otra mudanza aprobada que usa los mismos recursos';
    end if;
    insert into public.pases (organizacion_id, condominio_id, vivienda_id, residente_id, visitante, tipo_visita, modalidad, desde, hasta, placa, servicio)
    values (m.organizacion_id, m.condominio_id, m.vivienda_id, m.residente_id, m.empresa, 'proveedor', 'recurrente',
            m.inicio - interval '30 minutes', m.fin + interval '1 hour', m.placa, 'Mudanza (' || m.tipo || ')')
    returning id into pase;
  end if;
  update public.mudanzas set estado = case when p_aprobar then 'aprobada' else 'rechazada' end, pase_id = pase,
         nota = nullif(left(trim(coalesce(p_nota, '')), 300), ''), revisado_por = quien, revisado_at = now()
   where id = m.id;
end;
$$;

-- Lo que ve el residente en Amenidades: catálogo, ocupación de los próximos 14 días y sus reservas y mudanzas.
create or replace function public.vecino_amenidades(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  return jsonb_build_object(
    'amenidades', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'tipo', a.tipo, 'descripcion', a.descripcion,
        'reglas', a.reglas, 'foto_path', a.foto_path, 'modo', a.modo, 'capacidad', a.capacidad, 'hora_abre', a.hora_abre,
        'hora_cierra', a.hora_cierra, 'duraciones', a.duraciones, 'renta_centavos', a.renta_centavos, 'deposito_centavos', a.deposito_centavos,
        'ocupacion', coalesce((select jsonb_agg(jsonb_build_object('inicio', x.inicio, 'fin', x.fin, 'personas', x.personas, 'estado', x.estado))
                               from public.reservas x where x.amenidad_id = a.id and x.estado in ('confirmada', 'solicitada')
                                and x.fin > now() and x.inicio < now() + interval '14 days'), '[]')) order by a.nombre)
        from public.amenidades a where a.condominio_id = r.condominio_id and a.activo), '[]'),
    'reservas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'amenidad', a.nombre, 'inicio', x.inicio, 'fin', x.fin,
        'personas', x.personas, 'estado', x.estado, 'renta_centavos', x.renta_centavos, 'deposito_centavos', x.deposito_centavos,
        'deposito_estado', x.deposito_estado, 'nota', x.nota) order by x.inicio desc)
        from public.reservas x join public.amenidades a on a.id = x.amenidad_id
       where x.vivienda_id = r.vivienda_id and x.fin > now() - interval '30 days'), '[]'),
    'mudanzas', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'tipo', m.tipo, 'inicio', m.inicio, 'fin', m.fin, 'empresa', m.empresa,
        'placa', m.placa, 'recursos', m.recursos, 'estado', m.estado, 'nota', m.nota,
        'pase_codigo', (select p.codigo from public.pases p where p.id = m.pase_id and p.estado = 'activo')) order by m.inicio desc)
        from public.mudanzas m where m.vivienda_id = r.vivienda_id and m.fin > now() - interval '30 days'), '[]'));
end;
$$;

-- La caseta también ve las mudanzas aprobadas y los eventos del día.
create or replace function public.agenda_caseta(p_turno uuid, p_hash text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  return jsonb_build_object(
    'mudanzas', coalesce((select jsonb_agg(jsonb_build_object('tipo', m.tipo, 'vivienda', v.numero, 'empresa', m.empresa, 'placa', m.placa,
        'inicio', m.inicio, 'fin', m.fin, 'recursos', m.recursos) order by m.inicio)
        from public.mudanzas m join public.viviendas v on v.id = m.vivienda_id
       where m.condominio_id = t.condominio_id and m.estado = 'aprobada' and m.fin > now() and m.inicio < now() + interval '24 hours'), '[]'),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('amenidad', a.nombre, 'vivienda', v.numero, 'inicio', x.inicio, 'fin', x.fin,
        'personas', x.personas) order by x.inicio)
        from public.reservas x join public.amenidades a on a.id = x.amenidad_id join public.viviendas v on v.id = x.vivienda_id
       where x.condominio_id = t.condominio_id and x.estado = 'confirmada' and a.modo = 'solicitud'
         and x.fin > now() and x.inicio < now() + interval '24 hours'), '[]'));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['vecino_reservar(text, uuid, timestamptz, integer, integer)', 'vecino_cancelar_reserva(text, uuid)',
    'vecino_solicitar_mudanza(text, text, timestamptz, timestamptz, text, text, text[])', 'vecino_cancelar_mudanza(text, uuid)',
    'vecino_amenidades(text)', 'agenda_caseta(uuid, text)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['decidir_reserva(uuid, boolean, text)', 'cerrar_deposito(uuid, boolean, text)', 'decidir_mudanza(uuid, boolean, text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
