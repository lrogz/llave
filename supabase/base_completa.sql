-- Black Key · base de datos completa (todas las migraciones en orden). Solo para un proyecto de Supabase NUEVO y vacío.

-- ═════ 20261007120000_esquema_inicial.sql ═════
-- Llave · esquema inicial
-- Administración de propiedades: cartera, tickets con fotos/video, cotizaciones,
-- aprobación del dueño, bandeja de WhatsApp, cobro de rentas y servicios.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run.
-- Córrelo una sola vez, en un proyecto nuevo y vacío.



-- ─────────────────────────────────────────────────────────────
-- Tipos
-- ─────────────────────────────────────────────────────────────
create type public.rol_miembro      as enum ('propietario', 'admin', 'staff');
create type public.tipo_propiedad   as enum ('casa', 'departamento', 'local', 'oficina', 'unidad_condominio', 'otro');
create type public.estado_propiedad as enum ('rentada', 'vacia', 'en_mantenimiento');
create type public.quien_paga       as enum ('dueno', 'inquilino', 'condominio', 'administradora');
create type public.estado_ticket    as enum ('reportado', 'cotizando', 'aprobacion', 'en_proceso', 'resuelto', 'cancelado');
create type public.urgencia_ticket  as enum ('baja', 'media', 'alta', 'urgente');
create type public.tipo_media       as enum ('foto', 'video', 'audio', 'pdf');
create type public.estado_solicitud as enum ('enviada', 'vista', 'cotizada', 'visita_agendada', 'descartada');
create type public.modo_cotizacion  as enum ('remota', 'visita');
create type public.estado_cotizacion as enum ('recibida', 'seleccionada', 'enviada_aprobacion', 'aprobada', 'rechazada');
create type public.estado_cobro     as enum ('pendiente', 'por_confirmar', 'pagado', 'vencido', 'condonado');
create type public.tipo_servicio    as enum ('luz', 'agua', 'gas', 'internet', 'predial', 'cuota_condominio', 'otro');
create type public.tipo_contacto    as enum ('inquilino', 'dueno', 'proveedor', 'otro');
create type public.direccion_msg    as enum ('entrante', 'saliente', 'automatica');
create type public.tipo_inspeccion  as enum ('entrada', 'salida', 'rutina');

-- ─────────────────────────────────────────────────────────────
-- Utilidades
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Administradoras y miembros
-- ─────────────────────────────────────────────────────────────
create table public.organizaciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  plan        text not null default 'inicio' check (plan in ('inicio', 'pro', 'empresa')),
  whatsapp    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.miembros (
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  rol             public.rol_miembro not null default 'staff',
  created_at      timestamptz not null default now(),
  primary key (organizacion_id, user_id)
);
create index miembros_user_idx on public.miembros (user_id);

-- ¿El usuario actual pertenece a la organización?
create or replace function public.es_miembro(org uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.miembros m
    where m.organizacion_id = org and m.user_id = (select auth.uid())
  );
$$;

-- ¿Es propietario o admin de la organización?
create or replace function public.es_admin(org uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.miembros m
    where m.organizacion_id = org and m.user_id = (select auth.uid())
      and m.rol in ('propietario', 'admin')
  );
$$;

-- Crea una organización y deja al usuario actual como propietario.
create or replace function public.crear_organizacion(nombre text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  nueva uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere sesión';
  end if;
  insert into public.organizaciones (nombre) values (crear_organizacion.nombre) returning id into nueva;
  insert into public.miembros (organizacion_id, user_id, rol) values (nueva, (select auth.uid()), 'propietario');
  return nueva;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Personas
-- ─────────────────────────────────────────────────────────────
create table public.duenos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  nombre          text not null,
  telefono        text,
  email           text,
  comision_pct    numeric(5,2) check (comision_pct between 0 and 100),
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.inquilinos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  nombre          text not null,
  telefono        text,
  email           text,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Proveedores: los de siempre de la administradora (organizacion_id) o de la red Llave (es_red = true, sin organización).
create table public.proveedores (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid references public.organizaciones(id) on delete cascade,
  es_red          boolean not null default false,
  nombre          text not null,
  telefono        text,
  email           text,
  especialidades  text[] not null default '{}',
  zonas           text[] not null default '{}',
  calificacion    numeric(2,1) check (calificacion between 0 and 5),
  trabajos        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint proveedor_dueno check (es_red or organizacion_id is not null)
);

-- ─────────────────────────────────────────────────────────────
-- Cartera
-- ─────────────────────────────────────────────────────────────
create table public.propiedades (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  dueno_id        uuid references public.duenos(id) on delete set null,
  nombre          text not null,
  direccion       text,
  colonia         text,
  ciudad          text default 'Querétaro',
  tipo            public.tipo_propiedad not null default 'casa',
  estado          public.estado_propiedad not null default 'vacia',
  renta_mensual   numeric(12,2),
  foto_path       text,
  codigo_qr       text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.contratos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  inquilino_id    uuid not null references public.inquilinos(id) on delete restrict,
  inicio          date not null,
  fin             date not null,
  renta           numeric(12,2) not null,
  dia_pago        smallint not null default 1 check (dia_pago between 1 and 31),
  deposito        numeric(12,2),
  recargo_pct     numeric(5,2) default 0,
  documento_path  text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (fin > inicio)
);

-- ─────────────────────────────────────────────────────────────
-- Tickets: reporte → cotizaciones → aprobación → cierre
-- ─────────────────────────────────────────────────────────────
create table public.tickets (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id      uuid not null references public.propiedades(id) on delete cascade,
  inquilino_id      uuid references public.inquilinos(id) on delete set null,
  folio             bigint generated always as identity,
  titulo            text not null,
  descripcion       text,
  categoria         text,
  urgencia          public.urgencia_ticket not null default 'media',
  estado            public.estado_ticket not null default 'reportado',
  quien_paga        public.quien_paga,
  disponibilidad    text[] not null default '{}',
  canal_origen      text not null default 'qr' check (canal_origen in ('qr', 'whatsapp', 'panel')),
  token_publico     text not null unique default replace(gen_random_uuid()::text, '-', ''),
  resuelto_at       timestamptz,
  calificacion      smallint check (calificacion between 1 and 5),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index tickets_org_estado_idx on public.tickets (organizacion_id, estado);
create index tickets_propiedad_idx on public.tickets (propiedad_id);

create table public.ticket_media (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  tipo            public.tipo_media not null,
  storage_path    text not null,
  duracion_seg    integer,
  momento         text not null default 'reporte' check (momento in ('reporte', 'antes', 'despues')),
  subido_por      text not null default 'inquilino' check (subido_por in ('inquilino', 'administradora', 'proveedor')),
  created_at      timestamptz not null default now()
);
create index ticket_media_ticket_idx on public.ticket_media (ticket_id);

-- Invitación a cotizar (link por WhatsApp, sin cuenta).
create table public.solicitudes_cotizacion (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  proveedor_id    uuid not null references public.proveedores(id) on delete cascade,
  estado          public.estado_solicitud not null default 'enviada',
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  enviada_at      timestamptz not null default now(),
  vista_at        timestamptz,
  unique (ticket_id, proveedor_id)
);

create table public.cotizaciones (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references public.organizaciones(id) on delete cascade,
  ticket_id             uuid not null references public.tickets(id) on delete cascade,
  proveedor_id          uuid references public.proveedores(id) on delete set null,
  solicitud_id          uuid references public.solicitudes_cotizacion(id) on delete set null,
  modo                  public.modo_cotizacion not null default 'remota',
  monto                 numeric(12,2),
  incluye_materiales    boolean,
  garantia_dias         integer,
  fechas_disponibles    date[] not null default '{}',
  visita_at             timestamptz,
  archivo_path          text,
  subida_por_admin      boolean not null default false,
  notas                 text,
  estado                public.estado_cotizacion not null default 'recibida',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (modo = 'visita' or monto is not null or archivo_path is not null)
);
create index cotizaciones_ticket_idx on public.cotizaciones (ticket_id);

create table public.aprobaciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  cotizacion_id   uuid not null references public.cotizaciones(id) on delete cascade,
  dueno_id        uuid references public.duenos(id) on delete set null,
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  decision        text check (decision in ('aprobada', 'rechazada')),
  comentario      text,
  decidida_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Pagos y servicios
-- ─────────────────────────────────────────────────────────────
create table public.cobros_renta (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  contrato_id     uuid not null references public.contratos(id) on delete cascade,
  periodo         date not null,
  monto           numeric(12,2) not null,
  recargo         numeric(12,2) not null default 0,
  vence           date not null,
  estado          public.estado_cobro not null default 'pendiente',
  metodo          text check (metodo in ('spei', 'tarjeta', 'oxxo', 'efectivo', 'transferencia_externa')),
  comprobante_path text,
  pagado_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (contrato_id, periodo)
);
create index cobros_org_estado_idx on public.cobros_renta (organizacion_id, estado);

create table public.servicios (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  tipo            public.tipo_servicio not null,
  compania        text,
  numero_servicio text,
  quien_paga      public.quien_paga not null default 'inquilino',
  dia_vencimiento smallint check (dia_vencimiento between 1 and 31),
  periodicidad    text not null default 'mensual' check (periodicidad in ('mensual', 'bimestral', 'anual')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.recibos_servicio (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  servicio_id     uuid not null references public.servicios(id) on delete cascade,
  periodo         date not null,
  monto           numeric(12,2),
  vence           date not null,
  estado          public.estado_cobro not null default 'pendiente',
  comprobante_path text,
  pagado_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (servicio_id, periodo)
);
create index recibos_org_estado_idx on public.recibos_servicio (organizacion_id, estado, vence);

-- ─────────────────────────────────────────────────────────────
-- Bandeja única (WhatsApp)
-- ─────────────────────────────────────────────────────────────
create table public.conversaciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid references public.propiedades(id) on delete set null,
  tipo_contacto   public.tipo_contacto not null default 'otro',
  contacto_id     uuid,
  telefono        text not null,
  nombre          text,
  sin_responder   boolean not null default true,
  ultimo_msg_at   timestamptz,
  created_at      timestamptz not null default now(),
  unique (organizacion_id, telefono)
);

create table public.mensajes (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  direccion       public.direccion_msg not null,
  cuerpo          text,
  media_path      text,
  ticket_id       uuid references public.tickets(id) on delete set null,
  externo_id      text,
  created_at      timestamptz not null default now()
);
create index mensajes_conv_idx on public.mensajes (conversacion_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- Check-in / check-out
-- ─────────────────────────────────────────────────────────────
create table public.inspecciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  contrato_id     uuid references public.contratos(id) on delete set null,
  tipo            public.tipo_inspeccion not null,
  fecha           date not null default current_date,
  partidas        jsonb not null default '[]',
  firmada_inquilino boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Índices por organización y por llaves foráneas
-- ─────────────────────────────────────────────────────────────
create index duenos_org_idx        on public.duenos (organizacion_id);
create index inquilinos_org_idx    on public.inquilinos (organizacion_id);
create index proveedores_org_idx   on public.proveedores (organizacion_id);
create index propiedades_org_idx   on public.propiedades (organizacion_id);
create index propiedades_dueno_idx on public.propiedades (dueno_id);
create index contratos_prop_idx    on public.contratos (propiedad_id);
create index contratos_inq_idx     on public.contratos (inquilino_id);
create index tickets_inq_idx       on public.tickets (inquilino_id);
create index solicitudes_ticket_idx on public.solicitudes_cotizacion (ticket_id);
create index solicitudes_prov_idx  on public.solicitudes_cotizacion (proveedor_id);
create index cotizaciones_prov_idx on public.cotizaciones (proveedor_id);
create index cotizaciones_sol_idx  on public.cotizaciones (solicitud_id);
create index aprobaciones_cot_idx  on public.aprobaciones (cotizacion_id);
create index aprobaciones_dueno_idx on public.aprobaciones (dueno_id);
create index cobros_contrato_idx   on public.cobros_renta (contrato_id);
create index servicios_prop_idx    on public.servicios (propiedad_id);
create index conversaciones_prop_idx on public.conversaciones (propiedad_id);
create index mensajes_ticket_idx   on public.mensajes (ticket_id);
create index inspecciones_prop_idx on public.inspecciones (propiedad_id);
create index inspecciones_contrato_idx on public.inspecciones (contrato_id);
create index ticket_media_org_idx  on public.ticket_media (organizacion_id);
create index solicitudes_org_idx   on public.solicitudes_cotizacion (organizacion_id);
create index cotizaciones_org_idx  on public.cotizaciones (organizacion_id);
create index aprobaciones_org_idx  on public.aprobaciones (organizacion_id);
create index contratos_org_idx     on public.contratos (organizacion_id);
create index servicios_org_idx     on public.servicios (organizacion_id);
create index mensajes_org_idx      on public.mensajes (organizacion_id);
create index inspecciones_org_idx  on public.inspecciones (organizacion_id);

-- ─────────────────────────────────────────────────────────────
-- updated_at automático
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['organizaciones','duenos','inquilinos','proveedores','propiedades','contratos',
                           'tickets','cotizaciones','cobros_renta','servicios','recibos_servicio']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Seguridad (RLS): cada administradora solo ve lo suyo.
-- Inquilinos, dueños y proveedores NO tienen cuenta: entran por links con token
-- que se resuelven en el servidor (rutas de API con la llave service_role).
-- ─────────────────────────────────────────────────────────────
alter table public.organizaciones enable row level security;
alter table public.miembros       enable row level security;

create policy "miembros ven su organización" on public.organizaciones
  for select to authenticated using (public.es_miembro(id));
create policy "admins editan su organización" on public.organizaciones
  for update to authenticated using (public.es_admin(id)) with check (public.es_admin(id));

create policy "miembros ven a su equipo" on public.miembros
  for select to authenticated using (public.es_miembro(organizacion_id));
create policy "admins agregan miembros" on public.miembros
  for insert to authenticated with check (public.es_admin(organizacion_id));
create policy "admins cambian roles" on public.miembros
  for update to authenticated using (public.es_admin(organizacion_id)) with check (public.es_admin(organizacion_id));
create policy "admins quitan miembros" on public.miembros
  for delete to authenticated using (public.es_admin(organizacion_id));

-- Tablas de operación: cualquier miembro lee y escribe dentro de su organización.
do $$
declare t text;
begin
  foreach t in array array['duenos','inquilinos','propiedades','contratos','tickets','ticket_media',
                           'solicitudes_cotizacion','cotizaciones','aprobaciones','cobros_renta',
                           'servicios','recibos_servicio','conversaciones','mensajes','inspecciones']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "miembros leen" on public.%I for select to authenticated using (public.es_miembro(organizacion_id))', t);
    execute format('create policy "miembros crean" on public.%I for insert to authenticated with check (public.es_miembro(organizacion_id))', t);
    execute format('create policy "miembros editan" on public.%I for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id))', t);
    execute format('create policy "admins borran" on public.%I for delete to authenticated using (public.es_admin(organizacion_id))', t);
  end loop;
end;
$$;

-- Proveedores: los propios de la organización + la red Llave (solo lectura).
alter table public.proveedores enable row level security;
create policy "ver propios y red" on public.proveedores
  for select to authenticated using (es_red or public.es_miembro(organizacion_id));
create policy "crear propios" on public.proveedores
  for insert to authenticated with check (not es_red and public.es_miembro(organizacion_id));
create policy "editar propios" on public.proveedores
  for update to authenticated using (not es_red and public.es_miembro(organizacion_id))
  with check (not es_red and public.es_miembro(organizacion_id));
create policy "borrar propios" on public.proveedores
  for delete to authenticated using (not es_red and public.es_admin(organizacion_id));

-- Las funciones de ayuda no se exponen a usuarios anónimos.
revoke execute on function public.es_miembro(uuid) from public, anon;
revoke execute on function public.es_admin(uuid) from public, anon;
revoke execute on function public.crear_organizacion(text) from public, anon;
grant execute on function public.es_miembro(uuid) to authenticated;
grant execute on function public.es_admin(uuid) to authenticated;
grant execute on function public.crear_organizacion(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Archivos (fotos, videos, cotizaciones, comprobantes)
-- Ruta: <organizacion_id>/<carpeta>/<archivo>
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('llave', 'llave', false, 104857600,
        array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime',
              'audio/mpeg','audio/ogg','audio/mp4','application/pdf'])
on conflict (id) do nothing;

create policy "miembros leen archivos" on storage.objects
  for select to authenticated
  using (bucket_id = 'llave' and public.es_miembro(((storage.foldername(name))[1])::uuid));
create policy "miembros suben archivos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'llave' and public.es_miembro(((storage.foldername(name))[1])::uuid));
create policy "admins borran archivos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'llave' and public.es_admin(((storage.foldername(name))[1])::uuid));

-- ═════ 20261008040000_folio_por_administradora.sql ═════
-- Llave · folio de ticket por administradora (#1, #2, … para cada una) en vez de un contador global.
-- Cómo correrlo: Supabase › SQL Editor › pegar este archivo › Run (después del esquema inicial).

alter table public.tickets alter column folio drop identity if exists;
alter table public.tickets alter column folio drop not null;

create or replace function public.asignar_folio()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  -- Un candado por administradora evita folios repetidos si llegan dos reportes al mismo tiempo.
  perform pg_advisory_xact_lock(hashtextextended(new.organizacion_id::text, 0));
  select coalesce(max(t.folio), 0) + 1 into new.folio
  from public.tickets t
  where t.organizacion_id = new.organizacion_id;
  return new;
end;
$$;

drop trigger if exists tickets_folio on public.tickets;
create trigger tickets_folio before insert on public.tickets
  for each row execute function public.asignar_folio();

-- Renumera los tickets que ya existan, en orden de creación, dentro de cada administradora.
with orden as (
  select id, row_number() over (partition by organizacion_id order by created_at, id) as n
  from public.tickets
)
update public.tickets t set folio = o.n from orden o where o.id = t.id;

alter table public.tickets alter column folio set not null;
create unique index if not exists tickets_folio_org_idx on public.tickets (organizacion_id, folio);

-- ═════ 20261010060000_crm_seguimiento.sql ═════
-- Black Key · CRM de seguimiento de dueños e inquilinos
-- Notas con historial, pendientes con fecha y responsable, y datos extra de contacto.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los dos anteriores).

create type public.de_quien as enum ('administradora', 'dueno', 'inquilino');

-- Preferencias del dueño y aval del inquilino
alter table public.duenos
  add column if not exists canal_preferido text not null default 'whatsapp'
    check (canal_preferido in ('whatsapp', 'correo', 'llamada')),
  add column if not exists frecuencia_reporte text not null default 'mensual'
    check (frecuencia_reporte in ('mensual', 'quincenal', 'solo_cambios'));

alter table public.inquilinos
  add column if not exists aval_nombre text,
  add column if not exists aval_telefono text;

-- Notas rápidas: "Llamé, dice que paga el viernes"
create table public.notas (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  dueno_id        uuid references public.duenos(id) on delete cascade,
  inquilino_id    uuid references public.inquilinos(id) on delete cascade,
  propiedad_id    uuid references public.propiedades(id) on delete cascade,
  texto           text not null check (char_length(texto) between 1 and 2000),
  autor_id        uuid default auth.uid(),
  autor_email     text,
  created_at      timestamptz not null default now(),
  check (num_nonnulls(dueno_id, inquilino_id, propiedad_id) >= 1)
);
create index notas_dueno_idx on public.notas (dueno_id, created_at desc);
create index notas_inquilino_idx on public.notas (inquilino_id, created_at desc);

-- Temas por resolver: con fecha límite y de quién depende
create table public.pendientes (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  titulo          text not null check (char_length(titulo) between 1 and 200),
  de_quien        public.de_quien not null default 'administradora',
  vence           date,
  dueno_id        uuid references public.duenos(id) on delete cascade,
  inquilino_id    uuid references public.inquilinos(id) on delete cascade,
  propiedad_id    uuid references public.propiedades(id) on delete cascade,
  ticket_id       uuid references public.tickets(id) on delete set null,
  hecho_at        timestamptz,
  creado_por      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index pendientes_abiertos_idx on public.pendientes (organizacion_id, vence) where hecho_at is null;
create index pendientes_dueno_idx on public.pendientes (dueno_id);
create index pendientes_inquilino_idx on public.pendientes (inquilino_id);

create trigger pendientes_updated_at before update on public.pendientes
  for each row execute function public.set_updated_at();

-- Mismas reglas que el resto: cada administradora solo ve y edita lo suyo.
do $$
declare t text;
begin
  foreach t in array array['notas', 'pendientes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "miembros leen" on public.%I for select to authenticated using (public.es_miembro(organizacion_id))', t);
    execute format('create policy "miembros crean" on public.%I for insert to authenticated with check (public.es_miembro(organizacion_id))', t);
    execute format('create policy "miembros editan" on public.%I for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id))', t);
    execute format('create policy "admins borran" on public.%I for delete to authenticated using (public.es_admin(organizacion_id))', t);
  end loop;
end;
$$;

-- ═════ 20261010070000_reporte_dueno.sql ═════
-- Black Key · Reporte mensual al dueño
-- Un link por dueño y mes: renta cobrada, trabajos con fotos de antes y después, gastos y saldo.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

create table public.reportes_dueno (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  dueno_id        uuid not null references public.duenos(id) on delete cascade,
  periodo         date not null check (extract(day from periodo) = 1),
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  visto_at        timestamptz,
  created_at      timestamptz not null default now(),
  unique (dueno_id, periodo)
);
create index reportes_dueno_org_idx on public.reportes_dueno (organizacion_id, periodo);

alter table public.reportes_dueno enable row level security;
create policy "miembros leen" on public.reportes_dueno for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.reportes_dueno for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.reportes_dueno for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.reportes_dueno for delete to authenticated using (public.es_admin(organizacion_id));

-- ═════ 20261010080000_cobro_rentas.sql ═════
-- Black Key · Cobro de rentas
-- Genera el cobro de cada mes por contrato, marca atrasos con recargo y deja
-- que el inquilino suba su comprobante con un link.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

-- Link para que el inquilino vea cuánto paga y suba su comprobante
alter table public.cobros_renta
  add column if not exists token text unique default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists nota text;
update public.cobros_renta set token = replace(gen_random_uuid()::text, '-', '') where token is null;
alter table public.cobros_renta alter column token set not null;

-- Dónde depositar (CLABE, banco, beneficiario): lo ve el inquilino en su link
alter table public.organizaciones add column if not exists datos_pago text;

-- Crea los cobros del mes y marca los atrasados. Se puede llamar las veces que sea: no duplica.
create or replace function public.actualizar_cobros(org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Mexico_City')::date;
  mes date := date_trunc('month', hoy)::date;
  fin_mes date := (date_trunc('month', hoy) + interval '1 month - 1 day')::date;
begin
  if not public.es_miembro(org) then
    raise exception 'Sin acceso a esta administradora';
  end if;

  insert into public.cobros_renta (organizacion_id, contrato_id, periodo, monto, vence)
  select c.organizacion_id, c.id, mes, c.renta,
         mes + (least(c.dia_pago, extract(day from fin_mes)::int) - 1)
  from public.contratos c
  where c.organizacion_id = org
    and c.activo
    and c.inicio <= fin_mes
    and c.fin >= mes
  on conflict (contrato_id, periodo) do nothing;

  update public.cobros_renta r
     set estado = 'vencido',
         recargo = round(r.monto * coalesce(c.recargo_pct, 0) / 100, 2)
    from public.contratos c
   where r.contrato_id = c.id
     and r.organizacion_id = org
     and r.estado = 'pendiente'
     and r.vence < hoy;
end;
$$;

revoke all on function public.actualizar_cobros(uuid) from public, anon;
grant execute on function public.actualizar_cobros(uuid) to authenticated;

-- ═════ 20261010090000_servicios_documentos.sql ═════
-- Black Key · Servicios pagados y documentos
-- 1) Recibos de luz, agua, gas, predial, cuota… generados cada periodo y marcados si se vencen.
-- 2) Documentos (contrato, INE, escrituras, pólizas) ligados a propiedad, dueño o inquilino.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

-- ─── Documentos ───────────────────────────────────────────────
create table public.documentos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid references public.propiedades(id) on delete cascade,
  dueno_id        uuid references public.duenos(id) on delete cascade,
  inquilino_id    uuid references public.inquilinos(id) on delete cascade,
  tipo            text not null default 'otro'
                  check (tipo in ('contrato', 'identificacion', 'comprobante_domicilio', 'escrituras', 'poliza', 'predial', 'otro')),
  nombre          text not null check (char_length(nombre) between 1 and 160),
  storage_path    text not null,
  vence           date,
  subido_por      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  check (num_nonnulls(propiedad_id, dueno_id, inquilino_id) >= 1)
);
create index documentos_org_idx on public.documentos (organizacion_id, created_at desc);
create index documentos_vence_idx on public.documentos (organizacion_id, vence) where vence is not null;

alter table public.documentos enable row level security;
create policy "miembros leen" on public.documentos for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.documentos for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.documentos for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.documentos for delete to authenticated using (public.es_admin(organizacion_id));

-- ─── Servicios: además de rentas, genera los recibos del periodo ───
alter table public.recibos_servicio add column if not exists nota text;

create or replace function public.actualizar_cobros(org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Mexico_City')::date;
  mes date := date_trunc('month', hoy)::date;
  fin_mes date := (date_trunc('month', hoy) + interval '1 month - 1 day')::date;
begin
  if not public.es_miembro(org) then
    raise exception 'Sin acceso a esta administradora';
  end if;

  -- Rentas del mes por contrato activo
  insert into public.cobros_renta (organizacion_id, contrato_id, periodo, monto, vence)
  select c.organizacion_id, c.id, mes, c.renta,
         mes + (least(c.dia_pago, extract(day from fin_mes)::int) - 1)
  from public.contratos c
  where c.organizacion_id = org and c.activo and c.inicio <= fin_mes and c.fin >= mes
  on conflict (contrato_id, periodo) do nothing;

  -- Recibos de servicios: mensual cada mes; bimestral cada 2 meses; anual una vez al año
  -- (contando desde el mes en que se dio de alta el servicio).
  insert into public.recibos_servicio (organizacion_id, servicio_id, periodo, vence)
  select s.organizacion_id, s.id, mes,
         mes + (least(coalesce(s.dia_vencimiento, 10), extract(day from fin_mes)::int) - 1)
  from public.servicios s
  where s.organizacion_id = org
    and date_trunc('month', s.created_at at time zone 'America/Mexico_City')::date <= mes
    and (
      s.periodicidad = 'mensual'
      or (s.periodicidad = 'bimestral' and ((extract(year from mes) * 12 + extract(month from mes))
            - (extract(year from s.created_at at time zone 'America/Mexico_City') * 12
               + extract(month from s.created_at at time zone 'America/Mexico_City')))::int % 2 = 0)
      or (s.periodicidad = 'anual' and extract(month from mes) = extract(month from s.created_at at time zone 'America/Mexico_City'))
    )
  on conflict (servicio_id, periodo) do nothing;

  -- Atrasos
  update public.cobros_renta r
     set estado = 'vencido',
         recargo = round(r.monto * coalesce(c.recargo_pct, 0) / 100, 2)
    from public.contratos c
   where r.contrato_id = c.id and r.organizacion_id = org and r.estado = 'pendiente' and r.vence < hoy;

  update public.recibos_servicio
     set estado = 'vencido'
   where organizacion_id = org and estado = 'pendiente' and vence < hoy;
end;
$$;

revoke all on function public.actualizar_cobros(uuid) from public, anon;
grant execute on function public.actualizar_cobros(uuid) to authenticated;

-- ═════ 20261010100000_equipo.sql ═════
-- Black Key · Equipo
-- Invitar a más personas (asistente, socia) a la misma administradora.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

-- Correo visible de cada miembro (para la lista del equipo)
alter table public.miembros add column if not exists email text;
update public.miembros m set email = u.email from auth.users u where u.id = m.user_id and m.email is null;

create or replace function public.crear_organizacion(nombre text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  nueva uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere sesión';
  end if;
  insert into public.organizaciones (nombre) values (crear_organizacion.nombre) returning id into nueva;
  insert into public.miembros (organizacion_id, user_id, rol, email)
  values (nueva, (select auth.uid()), 'propietario', (select auth.jwt() ->> 'email'));
  return nueva;
end;
$$;

create table public.invitaciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  email           text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  rol             public.rol_miembro not null default 'staff' check (rol <> 'propietario'),
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  creada_por      uuid default auth.uid(),
  aceptada_at     timestamptz,
  created_at      timestamptz not null default now()
);
create unique index invitaciones_pendiente_idx on public.invitaciones (organizacion_id, lower(email)) where aceptada_at is null;

alter table public.invitaciones enable row level security;
create policy "admins ven invitaciones" on public.invitaciones for select to authenticated using (public.es_admin(organizacion_id));
create policy "admins invitan" on public.invitaciones for insert to authenticated with check (public.es_admin(organizacion_id));
create policy "admins cancelan" on public.invitaciones for delete to authenticated using (public.es_admin(organizacion_id));

-- Acepta una invitación con la sesión actual. El correo debe coincidir con el invitado.
create or replace function public.aceptar_invitacion(t text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  correo text := lower((select auth.jwt() ->> 'email'));
  inv public.invitaciones%rowtype;
begin
  if uid is null then
    raise exception 'Entra con tu correo para aceptar la invitación';
  end if;

  select * into inv from public.invitaciones where token = t;
  if not found or inv.aceptada_at is not null then
    raise exception 'Esta invitación ya no es válida';
  end if;
  if correo is distinct from lower(inv.email) then
    raise exception 'Esta invitación es para %. Entra con ese correo.', inv.email;
  end if;

  if exists (select 1 from public.miembros where user_id = uid and organizacion_id = inv.organizacion_id) then
    update public.invitaciones set aceptada_at = now() where id = inv.id;
    return inv.organizacion_id;
  end if;
  if exists (select 1 from public.miembros where user_id = uid) then
    raise exception 'Tu correo ya tiene su propia cuenta de Black Key. Pide que te inviten con otro correo.';
  end if;

  insert into public.miembros (organizacion_id, user_id, rol, email) values (inv.organizacion_id, uid, inv.rol, correo);
  update public.invitaciones set aceptada_at = now() where id = inv.id;
  return inv.organizacion_id;
end;
$$;

revoke all on function public.aceptar_invitacion(text) from public, anon;
grant execute on function public.aceptar_invitacion(text) to authenticated;

-- ═════ 20261010110000_avisos.sql ═════
-- Black Key · Avisos automáticos por correo
-- Cada mañana: aviso de renta, renta vencida, reporte del día 1 al dueño,
-- renovaciones, servicios por vencer y resumen para la administradora.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

-- Qué avisos manda cada administradora (todos encendidos al inicio)
alter table public.organizaciones
  add column if not exists avisos jsonb not null
  default '{"renta": true, "vencida": true, "reporte": true, "renovacion": true, "servicios": true, "resumen": true}'::jsonb;

-- Bitácora: evita mandar el mismo aviso dos veces
create table if not exists public.avisos_enviados (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  clave           text not null,
  tipo            text not null,
  para            text not null,
  asunto          text,
  created_at      timestamptz not null default now(),
  unique (organizacion_id, clave)
);
create index if not exists avisos_enviados_org_idx on public.avisos_enviados (organizacion_id, created_at desc);
alter table public.avisos_enviados enable row level security;
create policy "miembros ven avisos" on public.avisos_enviados for select to authenticated using (public.es_miembro(organizacion_id));

-- La lógica de rentas y servicios pasa a una función interna que el sistema
-- (el envío diario) puede correr para todas las administradoras.
create or replace function public.generar_cobros(org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Mexico_City')::date;
  mes date := date_trunc('month', hoy)::date;
  fin_mes date := (date_trunc('month', hoy) + interval '1 month - 1 day')::date;
begin
  insert into public.cobros_renta (organizacion_id, contrato_id, periodo, monto, vence)
  select c.organizacion_id, c.id, mes, c.renta,
         mes + (least(c.dia_pago, extract(day from fin_mes)::int) - 1)
  from public.contratos c
  where c.organizacion_id = org and c.activo and c.inicio <= fin_mes and c.fin >= mes
  on conflict (contrato_id, periodo) do nothing;

  insert into public.recibos_servicio (organizacion_id, servicio_id, periodo, vence)
  select s.organizacion_id, s.id, mes,
         mes + (least(coalesce(s.dia_vencimiento, 10), extract(day from fin_mes)::int) - 1)
  from public.servicios s
  where s.organizacion_id = org
    and date_trunc('month', s.created_at at time zone 'America/Mexico_City')::date <= mes
    and (
      s.periodicidad = 'mensual'
      or (s.periodicidad = 'bimestral' and ((extract(year from mes) * 12 + extract(month from mes))
            - (extract(year from s.created_at at time zone 'America/Mexico_City') * 12
               + extract(month from s.created_at at time zone 'America/Mexico_City')))::int % 2 = 0)
      or (s.periodicidad = 'anual' and extract(month from mes) = extract(month from s.created_at at time zone 'America/Mexico_City'))
    )
  on conflict (servicio_id, periodo) do nothing;

  update public.cobros_renta r
     set estado = 'vencido',
         recargo = round(r.monto * coalesce(c.recargo_pct, 0) / 100, 2)
    from public.contratos c
   where r.contrato_id = c.id and r.organizacion_id = org and r.estado = 'pendiente' and r.vence < hoy;

  update public.recibos_servicio
     set estado = 'vencido'
   where organizacion_id = org and estado = 'pendiente' and vence < hoy;
end;
$$;
revoke all on function public.generar_cobros(uuid) from public, anon, authenticated;
grant execute on function public.generar_cobros(uuid) to service_role;

-- La que usa la app: solo para miembros de esa administradora.
create or replace function public.actualizar_cobros(org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_miembro(org) then
    raise exception 'Sin acceso a esta administradora';
  end if;
  perform public.generar_cobros(org);
end;
$$;
revoke all on function public.actualizar_cobros(uuid) from public, anon;
grant execute on function public.actualizar_cobros(uuid) to authenticated;

-- ═════ 20261010120000_planes.sql ═════
-- Black Key · Planes y suscripción
-- $110 MXN por propiedad al mes; gratis hasta 3 propiedades; 30 días de prueba sin límite.
-- Usa la columna `plan` que ya existe: 'inicio' (gratis / prueba) o 'pro' (suscripción activa).
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter table public.organizaciones
  add column if not exists prueba_hasta date not null default ((now() at time zone 'America/Mexico_City')::date + 30),
  add column if not exists suscripcion_estado text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists propiedades_cobradas integer;

-- Los datos de cobro solo los cambia el sistema (webhook de Stripe con la llave de servidor),
-- nunca una administradora desde la app.
create or replace function public.proteger_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.plan is distinct from old.plan
    or new.prueba_hasta is distinct from old.prueba_hasta
    or new.suscripcion_estado is distinct from old.suscripcion_estado
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.propiedades_cobradas is distinct from old.propiedades_cobradas
  ) then
    raise exception 'Los datos del plan solo se cambian desde el cobro';
  end if;
  return new;
end;
$$;

drop trigger if exists organizaciones_proteger_plan on public.organizaciones;
create trigger organizaciones_proteger_plan before update on public.organizaciones
  for each row execute function public.proteger_plan();

-- ═════ 20261014090000_liquidaciones.sql ═════
-- Black Key · Liquidación al dueño
-- Cada mes: renta cobrada − comisión − mantenimiento − cargos + abonos = lo que se le transfiere al dueño.
-- `movimientos_dueno`: cargos y abonos manuales (predial pagado por la administración, devolución, etc.).
-- `liquidaciones`: foto de cómo quedó el mes cuando se marca como transferido.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter table public.duenos
  add column if not exists banco text,
  add column if not exists clabe text check (clabe is null or clabe ~ '^[0-9]{18}$');

create table if not exists public.movimientos_dueno (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  dueno_id        uuid not null references public.duenos(id) on delete cascade,
  propiedad_id    uuid references public.propiedades(id) on delete set null,
  periodo         date not null check (extract(day from periodo) = 1),
  tipo            text not null check (tipo in ('cargo', 'abono')),
  concepto        text not null check (length(concepto) between 1 and 160),
  monto           numeric(12,2) not null check (monto > 0),
  created_at      timestamptz not null default now()
);
create index if not exists movimientos_dueno_idx on public.movimientos_dueno (dueno_id, periodo);

create table if not exists public.liquidaciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  dueno_id        uuid not null references public.duenos(id) on delete cascade,
  periodo         date not null check (extract(day from periodo) = 1),
  renta_cobrada   numeric(12,2) not null,
  comision        numeric(12,2) not null,
  mantenimiento   numeric(12,2) not null,
  cargos          numeric(12,2) not null,
  abonos          numeric(12,2) not null,
  total           numeric(12,2) not null,
  pagada_el       date not null,
  referencia      text,
  comprobante_path text,
  created_at      timestamptz not null default now(),
  unique (dueno_id, periodo)
);
create index if not exists liquidaciones_org_idx on public.liquidaciones (organizacion_id, periodo);

alter table public.movimientos_dueno enable row level security;
create policy "miembros leen" on public.movimientos_dueno for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.movimientos_dueno for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros borran" on public.movimientos_dueno for delete to authenticated using (public.es_miembro(organizacion_id));

alter table public.liquidaciones enable row level security;
create policy "miembros leen" on public.liquidaciones for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.liquidaciones for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.liquidaciones for delete to authenticated using (public.es_admin(organizacion_id));


-- ═════ 20261014100000_whatsapp.sql ═════
-- Black Key · WhatsApp automático
-- Los mensajes que llegan por WhatsApp se guardan en `mensajes` (Bandeja). Este índice evita
-- procesar dos veces el mismo mensaje cuando Meta reintenta el aviso.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

create unique index if not exists mensajes_externo_idx on public.mensajes (externo_id) where externo_id is not null;

-- ═════ 20261014110000_anuncios.sql ═════
-- Black Key · Anuncios de casas vacías
-- Cada propiedad puede tener un anuncio público (link /v/<token>) con fotos, características
-- y un botón "Me interesa" que deja al prospecto en la app.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter table public.propiedades
  add column if not exists recamaras smallint check (recamaras between 0 and 50),
  add column if not exists banos numeric(3,1) check (banos between 0 and 50),
  add column if not exists m2 numeric(8,2) check (m2 > 0),
  add column if not exists estacionamientos smallint check (estacionamientos between 0 and 50),
  add column if not exists amueblada boolean not null default false,
  add column if not exists mascotas boolean not null default false,
  add column if not exists descripcion_anuncio text,
  add column if not exists requisitos text,
  add column if not exists anuncio_whatsapp text,
  add column if not exists anuncio_publicado boolean not null default false,
  add column if not exists anuncio_token text unique default replace(gen_random_uuid()::text, '-', '');

update public.propiedades set anuncio_token = replace(gen_random_uuid()::text, '-', '') where anuncio_token is null;
alter table public.propiedades alter column anuncio_token set not null;

create table if not exists public.fotos_propiedad (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  storage_path    text not null,
  created_at      timestamptz not null default now()
);
create index if not exists fotos_propiedad_idx on public.fotos_propiedad (propiedad_id, created_at);

create table if not exists public.prospectos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  nombre          text not null check (length(nombre) between 1 and 120),
  telefono        text not null check (length(telefono) between 7 and 30),
  email           text,
  mensaje         text check (length(mensaje) <= 1000),
  mudanza         date,
  estado          text not null default 'nuevo' check (estado in ('nuevo', 'contactado', 'visita', 'descartado', 'rentado')),
  created_at      timestamptz not null default now()
);
create index if not exists prospectos_propiedad_idx on public.prospectos (propiedad_id, created_at desc);

alter table public.fotos_propiedad enable row level security;
create policy "miembros leen" on public.fotos_propiedad for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.fotos_propiedad for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros borran" on public.fotos_propiedad for delete to authenticated using (public.es_miembro(organizacion_id));

-- Los prospectos llegan desde el anuncio público (servidor con la llave de servicio); la administradora los ve y les da seguimiento.
alter table public.prospectos enable row level security;
create policy "miembros leen" on public.prospectos for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.prospectos for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.prospectos for delete to authenticated using (public.es_admin(organizacion_id));

-- ═════ 20261014120000_entregas_mantenimiento.sql ═════
-- Black Key · Entrega/recepción de la casa y mantenimiento preventivo
-- 1) `inspecciones` (ya existía): inventario por cuarto con fotos y firma del inquilino desde un link.
-- 2) `mantenimientos`: tareas que se repiten (impermeabilizar, fumigar…); el envío diario crea el ticket solo.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter table public.inspecciones
  add column if not exists token text unique default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists lecturas jsonb not null default '{}',
  add column if not exists notas text,
  add column if not exists observaciones_inquilino text,
  add column if not exists firma_nombre text,
  add column if not exists firma_path text,
  add column if not exists firmada_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
update public.inspecciones set token = replace(gen_random_uuid()::text, '-', '') where token is null;
alter table public.inspecciones alter column token set not null;

create table if not exists public.inspeccion_fotos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  inspeccion_id   uuid not null references public.inspecciones(id) on delete cascade,
  partida         text not null,
  storage_path    text not null,
  created_at      timestamptz not null default now()
);
create index if not exists inspeccion_fotos_idx on public.inspeccion_fotos (inspeccion_id);
alter table public.inspeccion_fotos enable row level security;
create policy "miembros leen" on public.inspeccion_fotos for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.inspeccion_fotos for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros borran" on public.inspeccion_fotos for delete to authenticated using (public.es_miembro(organizacion_id));

-- Una vez firmada por el inquilino, la inspección ya no se puede cambiar (ni sus fotos).
create or replace function public.inspeccion_firmada_bloqueada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'inspecciones' then
    if old.firmada_at is not null and current_user in ('authenticated', 'anon') then
      raise exception 'La entrega ya está firmada y no se puede modificar';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.inspecciones i where i.id = coalesce(new.inspeccion_id, old.inspeccion_id) and i.firmada_at is not null)
     and current_user in ('authenticated', 'anon') then
    raise exception 'La entrega ya está firmada y no se puede modificar';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists inspecciones_bloqueo on public.inspecciones;
create trigger inspecciones_bloqueo before update or delete on public.inspecciones
  for each row execute function public.inspeccion_firmada_bloqueada();
drop trigger if exists inspeccion_fotos_bloqueo on public.inspeccion_fotos;
create trigger inspeccion_fotos_bloqueo before insert or delete on public.inspeccion_fotos
  for each row execute function public.inspeccion_firmada_bloqueada();

create table if not exists public.mantenimientos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  titulo          text not null check (length(titulo) between 1 and 120),
  categoria       text,
  cada_meses      smallint not null check (cada_meses between 1 and 60),
  proxima         date not null,
  quien_paga      public.quien_paga,
  notas           text,
  activo          boolean not null default true,
  ultimo_ticket_id uuid references public.tickets(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists mantenimientos_org_idx on public.mantenimientos (organizacion_id, activo, proxima);
alter table public.mantenimientos enable row level security;
create policy "miembros leen" on public.mantenimientos for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.mantenimientos for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.mantenimientos for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "miembros borran" on public.mantenimientos for delete to authenticated using (public.es_miembro(organizacion_id));

-- ═════ 20261014130000_cobro_contratos_solicitudes.sql ═════
-- Black Key · Referencia de pago, contrato con firma electrónica, solicitudes de renta y póliza jurídica
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

-- 1) Referencia numérica por contrato (la pone el inquilino en su transferencia SPEI)
create sequence if not exists public.referencia_pago_seq start 1000001 maxvalue 9999999;
grant usage on sequence public.referencia_pago_seq to authenticated, service_role;
alter table public.contratos add column if not exists referencia text unique default (nextval('public.referencia_pago_seq'))::text;
update public.contratos set referencia = (nextval('public.referencia_pago_seq'))::text where referencia is null;

-- 2) Póliza jurídica / protección de renta del contrato (Morada Uno u otra)
alter table public.contratos
  add column if not exists poliza_proveedor text,
  add column if not exists poliza_numero text,
  add column if not exists poliza_vence date,
  add column if not exists poliza_costo numeric(12,2);

-- 3) Contrato de arrendamiento para firma electrónica
create table if not exists public.documentos_contrato (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  contrato_id     uuid not null references public.contratos(id) on delete cascade,
  contenido       text not null,
  hash            text,
  estado          text not null default 'borrador' check (estado in ('borrador', 'enviado', 'firmado')),
  enviado_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists documentos_contrato_idx on public.documentos_contrato (contrato_id);

create table if not exists public.firmas_contrato (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  documento_id    uuid not null references public.documentos_contrato(id) on delete cascade,
  rol             text not null check (rol in ('arrendador', 'arrendatario', 'fiador', 'administradora')),
  nombre          text not null,
  telefono        text,
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  firma_path      text,
  firmada_at      timestamptz,
  ip              text,
  dispositivo     text,
  created_at      timestamptz not null default now()
);
create index if not exists firmas_contrato_doc_idx on public.firmas_contrato (documento_id);

-- Con una firma puesta, el texto ya no cambia (ni desde la app ni con la llave de servicio).
create or replace function public.documento_contrato_bloqueado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.contenido is distinct from old.contenido or new.hash is distinct from old.hash)
     and exists (select 1 from public.firmas_contrato f where f.documento_id = old.id and f.firmada_at is not null) then
    raise exception 'El contrato ya tiene firmas; su texto no se puede cambiar';
  end if;
  return new;
end;
$$;
drop trigger if exists documentos_contrato_bloqueo on public.documentos_contrato;
create trigger documentos_contrato_bloqueo before update on public.documentos_contrato
  for each row execute function public.documento_contrato_bloqueado();

alter table public.documentos_contrato enable row level security;
create policy "miembros leen" on public.documentos_contrato for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.documentos_contrato for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.documentos_contrato for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.documentos_contrato for delete to authenticated using (public.es_admin(organizacion_id));

-- Las firmas se ponen desde el link público (servidor con llave de servicio); la administradora solo las crea y las ve.
alter table public.firmas_contrato enable row level security;
create policy "miembros leen" on public.firmas_contrato for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.firmas_contrato for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros borran sin firmar" on public.firmas_contrato for delete to authenticated using (public.es_miembro(organizacion_id) and firmada_at is null);

-- 4) Solicitud de renta del interesado (para investigación / póliza)
create table if not exists public.solicitudes_renta (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  prospecto_id    uuid references public.prospectos(id) on delete set null,
  inquilino_id    uuid references public.inquilinos(id) on delete set null,
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  nombre          text not null,
  telefono        text,
  email           text,
  datos           jsonb not null default '{}',
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'recibida', 'en_revision', 'aprobada', 'rechazada')),
  recibida_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists solicitudes_renta_prop_idx on public.solicitudes_renta (propiedad_id, created_at desc);

create table if not exists public.solicitud_archivos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  solicitud_id    uuid not null references public.solicitudes_renta(id) on delete cascade,
  tipo            text not null check (tipo in ('identificacion', 'ingresos', 'domicilio', 'otro')),
  nombre          text,
  storage_path    text not null,
  created_at      timestamptz not null default now()
);
create index if not exists solicitud_archivos_idx on public.solicitud_archivos (solicitud_id);

alter table public.solicitudes_renta enable row level security;
create policy "miembros leen" on public.solicitudes_renta for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.solicitudes_renta for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.solicitudes_renta for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.solicitudes_renta for delete to authenticated using (public.es_admin(organizacion_id));
alter table public.solicitud_archivos enable row level security;
create policy "miembros leen" on public.solicitud_archivos for select to authenticated using (public.es_miembro(organizacion_id));
create policy "admins borran" on public.solicitud_archivos for delete to authenticated using (public.es_admin(organizacion_id));

-- ═════ 20261014140000_facturacion.sql ═════
-- Black Key · Facturación CFDI 4.0 de rentas (timbrado con Facturapi)
-- Cada dueño factura su renta con su propio certificado (CSD); Black Key solo arma y manda la factura.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter table public.duenos
  add column if not exists rfc text,
  add column if not exists razon_social text,
  add column if not exists regimen_fiscal text,
  add column if not exists cp_fiscal text,
  add column if not exists facturacion_lista boolean not null default false,
  add column if not exists csd_vence date;

alter table public.inquilinos
  add column if not exists rfc text,
  add column if not exists razon_social text,
  add column if not exists regimen_fiscal text,
  add column if not exists cp_fiscal text,
  add column if not exists uso_cfdi text,
  add column if not exists factura_automatica boolean not null default false;

alter table public.propiedades add column if not exists cuenta_predial text;

-- Llaves del emisor en Facturapi: solo el servidor (llave de servicio) las lee. Sin políticas = nadie más.
create table if not exists public.facturacion_duenos (
  dueno_id         uuid primary key references public.duenos(id) on delete cascade,
  organizacion_id  uuid not null references public.organizaciones(id) on delete cascade,
  facturapi_org_id text not null,
  api_key          text,
  created_at       timestamptz not null default now()
);
alter table public.facturacion_duenos enable row level security;

create table if not exists public.facturas (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  cobro_id        uuid not null references public.cobros_renta(id) on delete cascade,
  dueno_id        uuid references public.duenos(id) on delete set null,
  facturapi_id    text not null,
  uuid            text,
  folio           text,
  total           numeric(12,2),
  estado          text not null default 'valida' check (estado in ('valida', 'cancelada')),
  cancelada_at    timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists facturas_cobro_valida_idx on public.facturas (cobro_id) where estado = 'valida';
create index if not exists facturas_org_idx on public.facturas (organizacion_id, created_at desc);
alter table public.facturas enable row level security;
create policy "miembros leen" on public.facturas for select to authenticated using (public.es_miembro(organizacion_id));

-- ============ 16) Red de proveedores y agenda ============
-- Black Key · Red de proveedores verificados y agenda en línea
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

-- 1) Perfil del proveedor (para la red y para su agenda)
alter table public.proveedores
  add column if not exists descripcion text,
  add column if not exists experiencia_anios smallint check (experiencia_anios between 0 and 80),
  add column if not exists precio_desde numeric(12,2),
  add column if not exists verificado boolean not null default false,
  add column if not exists estado_red text check (estado_red in ('solicitud', 'aprobado', 'rechazado')),
  add column if not exists contacto text,
  add column if not exists foto_path text,
  add column if not exists fotos_trabajos text[] not null default '{}',
  add column if not exists documentos jsonb not null default '[]',
  -- {"dias":[1,2,3,4,5,6],"desde":"09:00","hasta":"18:00","duracion":60}
  add column if not exists horario jsonb not null default '{}';

-- Una solicitud a la red no tiene administradora ni es de la red todavía.
alter table public.proveedores drop constraint if exists proveedor_dueno;
alter table public.proveedores add constraint proveedor_dueno check (es_red or organizacion_id is not null or estado_red is not null);

-- 2) Link personal del proveedor a su portal (agenda, llegué/terminé). Aparte para que otras
--    administradoras que ven a un proveedor de la red no puedan ver su link.
create table if not exists public.proveedor_portal (
  proveedor_id uuid primary key references public.proveedores(id) on delete cascade,
  token        text not null unique default replace(gen_random_uuid()::text, '-', '')
);
insert into public.proveedor_portal (proveedor_id) select id from public.proveedores on conflict do nothing;
alter table public.proveedor_portal enable row level security;
create policy "miembros ven el de sus proveedores" on public.proveedor_portal for select to authenticated
  using (exists (select 1 from public.proveedores p where p.id = proveedor_id and not p.es_red and public.es_miembro(p.organizacion_id)));
create policy "miembros crean el de sus proveedores" on public.proveedor_portal for insert to authenticated
  with check (exists (select 1 from public.proveedores p where p.id = proveedor_id and not p.es_red and public.es_miembro(p.organizacion_id)));

create or replace function public.crear_portal_proveedor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.proveedor_portal (proveedor_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists proveedores_portal on public.proveedores;
create trigger proveedores_portal after insert on public.proveedores
  for each row execute function public.crear_portal_proveedor();

-- 3) Citas (visitas de proveedores)
create table if not exists public.citas (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  proveedor_id    uuid not null references public.proveedores(id) on delete cascade,
  ticket_id       uuid references public.tickets(id) on delete set null,
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  inicio          timestamptz,
  fin             timestamptz,
  estado          text not null default 'confirmada' check (estado in ('por_elegir', 'confirmada', 'cancelada', 'hecha')),
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  notas           text,
  llegada_at      timestamptz,
  salida_at       timestamptz,
  recordatorio_at timestamptz,
  created_at      timestamptz not null default now(),
  check (estado = 'por_elegir' or (inicio is not null and fin is not null and fin > inicio))
);
create index if not exists citas_proveedor_idx on public.citas (proveedor_id, inicio);
create index if not exists citas_org_idx on public.citas (organizacion_id, inicio);
create index if not exists citas_ticket_idx on public.citas (ticket_id);
-- Un proveedor no puede tener dos citas confirmadas que empiecen a la misma hora.
create unique index if not exists citas_sin_empalme_idx on public.citas (proveedor_id, inicio) where estado = 'confirmada';

alter table public.citas enable row level security;
create policy "miembros leen" on public.citas for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.citas for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.citas for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "miembros borran" on public.citas for delete to authenticated using (public.es_miembro(organizacion_id));
