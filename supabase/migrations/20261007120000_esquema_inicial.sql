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
