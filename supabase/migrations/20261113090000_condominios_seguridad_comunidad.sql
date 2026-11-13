-- Black Key · Condominios (2): seguridad, comunidad, conciliación y equipos
-- Foto en cada entrada, lista de vetados y alertas, timbre por QR, rondines, placas (LPR), pluma y cuarto de
-- paquetes con PIN, votaciones y asambleas, conciliación bancaria, documentos, tablero vecinal y avisos push.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de 20261112120000_condominios.sql).

-- ─────────────────────────────────────────────────────────────
-- Utilidades
-- ─────────────────────────────────────────────────────────────
-- "José  Pérez-López" → "jose perez lopez" (para comparar nombres sin acentos ni signos).
create or replace function public.normaliza_nombre(t text)
returns text language sql immutable
set search_path = ''
as $$
  select trim(regexp_replace(lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', ' ', 'g'));
$$;
-- "uab-123 c" → "UAB123C"
create or replace function public.normaliza_placa(t text)
returns text language sql immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- ─────────────────────────────────────────────────────────────
-- Nuevos datos del condominio y de los accesos
-- ─────────────────────────────────────────────────────────────
alter table public.condominios
  add column if not exists timbre_token     text unique default public.token_opaco(16),   -- QR del timbre en la entrada
  add column if not exists kiosco_token     text unique default public.token_opaco(24),   -- tablet del cuarto de paquetes
  add column if not exists lpr_token        text unique default public.token_opaco(32),   -- cámara de placas
  add column if not exists pluma_url        text,                                         -- relevador del portón (HTTPS)
  add column if not exists pluma_auth       text,                                         -- encabezado Authorization para el relevador
  add column if not exists paquetes_url     text,                                         -- relevador de la puerta del cuarto de paquetes
  add column if not exists lpr_abre_visitas boolean not null default true;                -- placas de visitas con pase abren solas
update public.condominios set timbre_token = public.token_opaco(16) where timbre_token is null;
update public.condominios set kiosco_token = public.token_opaco(24) where kiosco_token is null;
update public.condominios set lpr_token = public.token_opaco(32) where lpr_token is null;
alter table public.condominios alter column timbre_token set not null, alter column kiosco_token set not null, alter column lpr_token set not null;

alter table public.viviendas add column if not exists indiviso numeric(7,4) check (indiviso is null or (indiviso > 0 and indiviso <= 100));

alter table public.accesos add column if not exists foto_path text;
alter table public.accesos drop constraint if exists accesos_metodo_check;
alter table public.accesos add constraint accesos_metodo_check check (metodo in ('qr', 'manual', 'sin_conexion', 'placa', 'timbre', 'pin'));

alter table public.avisos_condominio add column if not exists urgente boolean not null default false;

-- Los tokens nuevos tampoco se guardan en la bitácora.
create or replace function public.bitacora_cambio()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  fila jsonb := to_jsonb(coalesce(new, old));
  limpio jsonb := fila - array['token', 'codigo', 'pin', 'caseta_token', 'comite_token', 'alta_token', 'timbre_token', 'kiosco_token', 'lpr_token',
                               'pluma_auth', 'ine_frente_path', 'ine_reverso_path', 'selfie_path', 'sesion_hash', 'comprobante_path',
                               'clave_cliente', 'ref_cliente', 'telefono', 'email'];
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

-- ─────────────────────────────────────────────────────────────
-- Tablas nuevas
-- ─────────────────────────────────────────────────────────────
create table public.vetados (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  nombre          text,
  placa           text,
  motivo          text not null check (length(motivo) between 3 and 300),
  activo          boolean not null default true,
  creado_por      text,
  created_at      timestamptz not null default now(),
  check (coalesce(length(trim(nombre)), 0) >= 3 or coalesce(length(public.normaliza_placa(placa)), 0) >= 4)
);

create table public.alertas_condominio (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  tipo            text not null check (tipo in ('vetado', 'placa_desconocida', 'pin_fallido')),
  detalle         text not null,
  acceso_id       uuid references public.accesos(id) on delete set null,
  atendida_at     timestamptz,
  atendida_por    text,
  created_at      timestamptz not null default now()
);
create index alertas_cond_idx on public.alertas_condominio (condominio_id, created_at desc);

create table public.vehiculos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  placa           text not null check (length(placa) between 4 and 12),
  descripcion     text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (condominio_id, placa)
);

create table public.eventos_lpr (
  id              bigint generated always as identity primary key,
  organizacion_id uuid not null,
  condominio_id   uuid not null,
  placa           text not null,
  camara          text,
  resultado       text not null,
  acceso_id       uuid,
  created_at      timestamptz not null default now()
);
create index eventos_lpr_cond_idx on public.eventos_lpr (condominio_id, created_at desc);

create table public.aperturas (
  id              bigint generated always as identity primary key,
  organizacion_id uuid not null,
  condominio_id   uuid not null,
  puerta          text not null check (puerta in ('pluma', 'paquetes')),
  motivo          text not null,
  actor           text not null,
  resultado       text not null check (resultado in ('ok', 'error', 'simulado')),
  created_at      timestamptz not null default now()
);

create table public.llamadas_timbre (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  visitante       text not null check (length(visitante) between 2 and 120),
  motivo          text,
  foto_path       text,
  estado          text not null default 'esperando' check (estado in ('esperando', 'autorizada', 'rechazada')),
  respondio       text,
  pase_id         uuid references public.pases(id) on delete set null,
  token           text not null unique default public.token_opaco(24),
  created_at      timestamptz not null default now(),
  respondida_at   timestamptz
);
create index llamadas_viv_idx on public.llamadas_timbre (vivienda_id, created_at desc);

create table public.puntos_rondin (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  nombre          text not null check (length(nombre) between 2 and 80),
  codigo          text not null unique default public.token_opaco(12),
  orden           integer not null default 0,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table public.marcas_rondin (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  punto_id        uuid not null references public.puntos_rondin(id) on delete cascade,
  turno_id        uuid references public.turnos(id) on delete set null,
  guardia_id      uuid references public.guardias(id) on delete set null,
  nota            text,
  created_at      timestamptz not null default now()
);
create index marcas_rondin_idx on public.marcas_rondin (condominio_id, created_at desc);

create table public.pines_entrega (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  residente_id    uuid references public.residentes(id) on delete set null,
  pin             text not null check (pin ~ '^[0-9]{6}$'),
  descripcion     text,
  expira          timestamptz not null,
  usado_at        timestamptz,
  paquete_id      uuid references public.paquetes(id) on delete set null,
  created_at      timestamptz not null default now()
);
create unique index pines_activos_idx on public.pines_entrega (condominio_id, pin) where usado_at is null;

create table public.intentos_pin (
  id            bigint generated always as identity primary key,
  condominio_id uuid not null,
  created_at    timestamptz not null default now()
);
create index intentos_pin_idx on public.intentos_pin (condominio_id, created_at);

create table public.asambleas (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  titulo          text not null check (length(titulo) between 3 and 120),
  tipo            text not null default 'ordinaria' check (tipo in ('ordinaria', 'extraordinaria')),
  fecha           timestamptz not null,
  lugar           text,
  orden_del_dia   text,
  acta            text,
  estado          text not null default 'convocada' check (estado in ('convocada', 'celebrada', 'cancelada')),
  created_at      timestamptz not null default now()
);

create table public.acuerdos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  asamblea_id     uuid references public.asambleas(id) on delete set null,
  texto           text not null check (length(texto) between 3 and 500),
  responsable     text,
  fecha_limite    date,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'cumplido')),
  created_at      timestamptz not null default now()
);

create table public.votaciones (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id       uuid not null references public.condominios(id) on delete cascade,
  asamblea_id         uuid references public.asambleas(id) on delete set null,
  pregunta            text not null check (length(pregunta) between 5 and 300),
  descripcion         text,
  opciones            text[] not null check (array_length(opciones, 1) between 2 and 8),
  abre                timestamptz not null default now(),
  cierra              timestamptz not null,
  solo_propietarios   boolean not null default true,
  resultados_en_vivo  boolean not null default false,
  created_at          timestamptz not null default now(),
  check (cierra > abre)
);

-- Un voto por vivienda. No se puede cambiar una vez emitido.
create table public.votos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  votacion_id     uuid not null references public.votaciones(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  residente_id    uuid references public.residentes(id) on delete set null,
  opcion          smallint not null check (opcion >= 0),
  created_at      timestamptz not null default now(),
  unique (votacion_id, vivienda_id)
);

create table public.movimientos_banco (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  fecha           date not null,
  descripcion     text,
  referencia      text,
  monto_centavos  bigint not null check (monto_centavos > 0),
  huella          text not null,                   -- evita duplicar el mismo renglón al volver a subir el estado de cuenta
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'conciliado', 'ignorado')),
  pago_id         uuid references public.pagos_condominio(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (condominio_id, huella)
);

create table public.documentos_condominio (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id      uuid not null references public.condominios(id) on delete cascade,
  titulo             text not null check (length(titulo) between 2 and 120),
  categoria          text not null default 'otro' check (categoria in ('reglamento', 'acta', 'poliza', 'contrato', 'estado_financiero', 'otro')),
  storage_path       text not null,
  visible_residentes boolean not null default true,
  created_at         timestamptz not null default now()
);

create table public.tablero (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  residente_id    uuid references public.residentes(id) on delete cascade,
  tipo            text not null check (tipo in ('venta', 'pregunta', 'recomendacion', 'perdido')),
  titulo          text not null check (length(titulo) between 3 and 100),
  texto           text not null check (length(texto) between 1 and 1000),
  oculto          boolean not null default false,
  created_at      timestamptz not null default now()
);
create table public.tablero_respuestas (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  publicacion_id  uuid not null references public.tablero(id) on delete cascade,
  residente_id    uuid references public.residentes(id) on delete cascade,
  texto           text not null check (length(texto) between 1 and 500),
  created_at      timestamptz not null default now()
);

create table public.suscripciones_push_residentes (
  id            uuid primary key default gen_random_uuid(),
  residente_id  uuid not null references public.residentes(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  created_at    timestamptz not null default now(),
  ultimo_envio  timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['vetados', 'alertas_condominio', 'vehiculos', 'llamadas_timbre', 'puntos_rondin', 'marcas_rondin', 'pines_entrega',
                           'asambleas', 'acuerdos', 'votaciones', 'votos', 'movimientos_banco', 'documentos_condominio', 'tablero', 'tablero_respuestas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "miembros leen" on public.%I for select to authenticated using (public.es_miembro(organizacion_id))', t);
    execute format('create policy "miembros crean" on public.%I for insert to authenticated with check (public.es_miembro(organizacion_id))', t);
    execute format('create policy "miembros editan" on public.%I for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id))', t);
    execute format('create policy "admins borran" on public.%I for delete to authenticated using (public.es_admin(organizacion_id))', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.validar_condominio()', t || '_valida', t);
  end loop;
  foreach t in array array['vetados', 'vehiculos', 'votaciones', 'asambleas', 'acuerdos', 'movimientos_banco', 'documentos_condominio'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.bitacora_cambio()', t || '_bitacora', t);
  end loop;
end;
$$;
-- Los votos no se cambian ni se borran desde el navegador.
drop policy "miembros editan" on public.votos;
drop policy "admins borran" on public.votos;
drop policy "miembros crean" on public.votos;

alter table public.eventos_lpr enable row level security;
create policy "miembros leen" on public.eventos_lpr for select to authenticated using (public.es_miembro(organizacion_id));
alter table public.aperturas enable row level security;
create policy "miembros leen" on public.aperturas for select to authenticated using (public.es_miembro(organizacion_id));
alter table public.suscripciones_push_residentes enable row level security;  -- solo servidor
alter table public.intentos_pin enable row level security;                   -- solo servidor
revoke all on public.suscripciones_push_residentes, public.intentos_pin from anon, authenticated;

-- Las ligas del relevador solo las cambia propietaria/admin y solo pueden ser HTTPS.
create or replace function public.proteger_relevadores()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if (new.pluma_url is distinct from old.pluma_url or new.pluma_auth is distinct from old.pluma_auth or new.paquetes_url is distinct from old.paquetes_url)
     and current_user in ('authenticated', 'anon') and not public.es_admin(new.organizacion_id) then
    raise exception 'Solo la propietaria o un admin puede configurar los relevadores';
  end if;
  if coalesce(new.pluma_url, 'https://') !~ '^https://' or coalesce(new.paquetes_url, 'https://') !~ '^https://' then
    raise exception 'La liga del relevador debe empezar con https://';
  end if;
  return new;
end;
$$;
drop trigger if exists condominios_relevadores on public.condominios;
create trigger condominios_relevadores before update on public.condominios for each row execute function public.proteger_relevadores();

-- ─────────────────────────────────────────────────────────────
-- Vetados y alertas
-- ─────────────────────────────────────────────────────────────
create or replace function public.buscar_vetado(p_condominio uuid, p_nombre text, p_placa text)
returns public.vetados language sql stable security definer
set search_path = ''
as $$
  select v.* from public.vetados v
   where v.condominio_id = p_condominio and v.activo
     and ((v.placa is not null and length(public.normaliza_placa(v.placa)) >= 4 and public.normaliza_placa(v.placa) = public.normaliza_placa(p_placa))
       or (v.nombre is not null and length(public.normaliza_nombre(v.nombre)) >= 3
           and (' ' || public.normaliza_nombre(p_nombre) || ' ') like ('% ' || public.normaliza_nombre(v.nombre) || ' %')))
   limit 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- Entrada con pase: misma regla para QR, lista, timbre y placas
-- ─────────────────────────────────────────────────────────────
create or replace function public.registrar_entrada_pase(p_condominio uuid, p_codigo text, p_turno uuid, p_metodo text, p_ahora timestamptz default now())
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype;
  p public.pases%rowtype;
  vt public.vetados%rowtype;
  local timestamp := p_ahora at time zone 'America/Mexico_City';
  quien text;
  viv text;
  nuevo uuid;
begin
  if p_turno is not null then select * into t from public.turnos where id = p_turno; end if;
  select * into p from public.pases where codigo = upper(trim(p_codigo)) and condominio_id = p_condominio for update;
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
  -- Lista de vetados: aunque traiga pase, no entra y se avisa a la administración.
  vt := public.buscar_vetado(p.condominio_id, p.visitante, p.placa);
  if vt.id is not null then
    insert into public.alertas_condominio (organizacion_id, condominio_id, tipo, detalle)
    values (p.organizacion_id, p.condominio_id, 'vetado', p.visitante || coalesce(' · ' || p.placa, '') || ' intentó entrar a ' || viv || '. Motivo: ' || vt.motivo);
    return jsonb_build_object('ok', false, 'motivo', 'vetado', 'visitante', p.visitante, 'vivienda', viv, 'detalle', vt.motivo, 'alerta', true);
  end if;

  update public.pases set usos = usos + 1 where id = p.id;
  select coalesce(r.nombre, 'Residente') into quien from public.residentes r where r.id = p.residente_id;
  perform set_config('bk.actor', 'caseta', true);
  insert into public.accesos (organizacion_id, condominio_id, vivienda_id, pase_id, tipo, visitante, placa, metodo, autorizo, guardia_id, turno_id, ocurrio_at)
  values (p.organizacion_id, p.condominio_id, p.vivienda_id, p.id, 'entrada', p.visitante, p.placa, p_metodo,
          coalesce(quien, 'Residente') || case p_metodo when 'placa' then ' (pase con placa)' when 'timbre' then ' (por timbre)' else ' (pase QR)' end,
          t.guardia_id, t.id, p_ahora)
  returning id into nuevo;

  return jsonb_build_object('ok', true, 'motivo', 'autorizado', 'acceso_id', nuevo, 'visitante', p.visitante,
                            'vivienda', viv, 'vivienda_id', p.vivienda_id, 'tipo_visita', p.tipo_visita, 'placa', p.placa,
                            'autorizo', quien, 'modalidad', p.modalidad, 'hasta', p.hasta);
end;
$$;

create or replace function public.caseta_registrar_entrada(p_turno uuid, p_codigo text, p_ahora timestamptz default now())
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype;
begin
  select * into t from public.turnos where id = p_turno and fin is null;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'sin_turno'); end if;
  return public.registrar_entrada_pase(t.condominio_id, p_codigo, t.id, 'qr', p_ahora);
end;
$$;

-- Registro manual: si coincide con la lista de vetados no se registra (en línea) y se alerta.
-- Si llegó sin conexión (ya ocurrió), se registra igual y se alerta.
create or replace function public.caseta_manual(p_turno uuid, p_hash text, p_vivienda uuid, p_tipo text, p_visitante text,
                                                p_placa text, p_autorizo text, p_metodo text, p_ocurrio_at timestamptz, p_ref text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
  vt public.vetados%rowtype;
  nuevo uuid;
begin
  if p_metodo not in ('manual', 'sin_conexion') then raise exception 'Método no válido'; end if;
  if length(trim(coalesce(p_visitante, ''))) < 2 then raise exception 'Escribe el nombre de quien entra'; end if;
  if length(trim(coalesce(p_autorizo, ''))) < 2 then raise exception 'Escribe quién autorizó'; end if;
  if not exists (select 1 from public.viviendas where id = p_vivienda and condominio_id = t.condominio_id) then
    raise exception 'Vivienda no válida';
  end if;
  vt := case when p_tipo = 'entrada' then public.buscar_vetado(t.condominio_id, p_visitante, p_placa) end;
  if vt.id is not null and p_metodo = 'manual' then
    insert into public.alertas_condominio (organizacion_id, condominio_id, tipo, detalle)
    values (t.organizacion_id, t.condominio_id, 'vetado', trim(p_visitante) || coalesce(' · ' || nullif(trim(p_placa), ''), '') || ' intentó entrar (registro manual). Motivo: ' || vt.motivo);
    return jsonb_build_object('ok', false, 'motivo', 'vetado', 'visitante', trim(p_visitante), 'detalle', vt.motivo, 'alerta', true);
  end if;
  perform set_config('bk.actor', 'caseta', true);
  insert into public.accesos (organizacion_id, condominio_id, vivienda_id, tipo, visitante, placa, metodo, autorizo, guardia_id,
                              turno_id, revision, ref_cliente, ocurrio_at)
  values (t.organizacion_id, t.condominio_id, p_vivienda, p_tipo, left(trim(p_visitante), 120),
          nullif(upper(left(trim(coalesce(p_placa, '')), 12)), ''), p_metodo, left(trim(p_autorizo), 120), t.guardia_id, t.id,
          'pendiente', p_ref, least(coalesce(p_ocurrio_at, now()), now()))
  on conflict (condominio_id, ref_cliente) do nothing
  returning id into nuevo;
  if vt.id is not null and nuevo is not null then
    insert into public.alertas_condominio (organizacion_id, condominio_id, tipo, detalle, acceso_id)
    values (t.organizacion_id, t.condominio_id, 'vetado', trim(p_visitante) || ' entró sin conexión y está en la lista de vetados. Motivo: ' || vt.motivo, nuevo);
  end if;
  return jsonb_build_object('ok', true, 'repetido', nuevo is null, 'acceso_id', nuevo, 'alerta', vt.id is not null);
end;
$$;

-- Foto tomada por caseta al registrar la entrada.
create or replace function public.caseta_foto_acceso(p_turno uuid, p_hash text, p_acceso uuid, p_path text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  if p_path not like t.organizacion_id || '/condominios/' || t.condominio_id || '/accesos/%' then raise exception 'Foto no válida'; end if;
  update public.accesos set foto_path = p_path where id = p_acceso and condominio_id = t.condominio_id and foto_path is null;
  if not found then raise exception 'No encontramos ese acceso'; end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Placas (LPR) y pluma
-- ─────────────────────────────────────────────────────────────
-- Una cámara de placas reporta una lectura. Responde si se debe abrir la pluma.
create or replace function public.lpr_evento(p_token text, p_placa text, p_camara text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  c public.condominios%rowtype;
  v_placa text := public.normaliza_placa(p_placa);
  veh record;
  vt public.vetados%rowtype;
  pase text;
  r jsonb;
  nuevo uuid;
begin
  select * into c from public.condominios where lpr_token = p_token;
  if not found then raise exception 'link_invalido'; end if;
  if length(v_placa) < 4 then return jsonb_build_object('abrir', false, 'resultado', 'ilegible'); end if;
  -- Evita registrar la misma placa varias veces seguidas (la cámara la lee en cada cuadro).
  if exists (select 1 from public.eventos_lpr where condominio_id = c.id and placa = v_placa and resultado in ('residente', 'visita')
             and created_at > now() - interval '2 minutes') then
    return jsonb_build_object('abrir', true, 'resultado', 'repetido');
  end if;
  perform set_config('bk.actor', 'cámara de placas', true);

  vt := public.buscar_vetado(c.id, null, v_placa);
  if vt.id is not null then
    insert into public.alertas_condominio (organizacion_id, condominio_id, tipo, detalle)
    values (c.organizacion_id, c.id, 'vetado', 'Placa ' || v_placa || ' en la entrada (' || coalesce(p_camara, 'cámara') || '). Motivo: ' || vt.motivo);
    insert into public.eventos_lpr (organizacion_id, condominio_id, placa, camara, resultado) values (c.organizacion_id, c.id, v_placa, p_camara, 'vetado');
    return jsonb_build_object('abrir', false, 'resultado', 'vetado', 'motivo', vt.motivo);
  end if;

  select v.id, v.vivienda_id, w.numero into veh from public.vehiculos v join public.viviendas w on w.id = v.vivienda_id
   where v.condominio_id = c.id and v.activo and public.normaliza_placa(v.placa) = v_placa limit 1;
  if veh.id is not null then
    insert into public.accesos (organizacion_id, condominio_id, vivienda_id, tipo, visitante, placa, metodo, autorizo)
    values (c.organizacion_id, c.id, veh.vivienda_id, 'entrada', 'Residente · ' || v_placa, v_placa, 'placa', 'Vehículo registrado')
    returning id into nuevo;
    insert into public.eventos_lpr (organizacion_id, condominio_id, placa, camara, resultado, acceso_id) values (c.organizacion_id, c.id, v_placa, p_camara, 'residente', nuevo);
    return jsonb_build_object('abrir', true, 'resultado', 'residente', 'vivienda', veh.numero);
  end if;

  if c.lpr_abre_visitas then
    select p.codigo into pase from public.pases p
     where p.condominio_id = c.id and p.estado = 'activo' and public.normaliza_placa(p.placa) = v_placa
       and p.desde <= now() and p.hasta >= now() and (p.max_usos is null or p.usos < p.max_usos)
     order by p.created_at desc limit 1;
    if pase is not null then
      r := public.registrar_entrada_pase(c.id, pase, null, 'placa', now());
      insert into public.eventos_lpr (organizacion_id, condominio_id, placa, camara, resultado, acceso_id)
      values (c.organizacion_id, c.id, v_placa, p_camara, case when (r ->> 'ok')::boolean then 'visita' else 'rechazada' end, (r ->> 'acceso_id')::uuid);
      return jsonb_build_object('abrir', (r ->> 'ok')::boolean, 'resultado', case when (r ->> 'ok')::boolean then 'visita' else r ->> 'motivo' end,
                                'vivienda', r ->> 'vivienda', 'vivienda_id', r ->> 'vivienda_id', 'visitante', r ->> 'visitante');
    end if;
  end if;

  insert into public.alertas_condominio (organizacion_id, condominio_id, tipo, detalle)
  values (c.organizacion_id, c.id, 'placa_desconocida', 'Placa ' || v_placa || ' sin registro en ' || coalesce(p_camara, 'la entrada') || '. Caseta debe atenderla.');
  insert into public.eventos_lpr (organizacion_id, condominio_id, placa, camara, resultado) values (c.organizacion_id, c.id, v_placa, p_camara, 'desconocida');
  return jsonb_build_object('abrir', false, 'resultado', 'desconocida');
end;
$$;

-- Datos del relevador para que el servidor abra la pluma (solo con turno válido de caseta).
create or replace function public.caseta_relevador(p_turno uuid, p_hash text, p_puerta text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
  c public.condominios%rowtype;
begin
  select * into c from public.condominios where id = t.condominio_id;
  return jsonb_build_object('condominio_id', c.id, 'organizacion_id', c.organizacion_id,
    'url', case when p_puerta = 'paquetes' then c.paquetes_url else c.pluma_url end, 'auth', c.pluma_auth,
    'guardia', (select nombre from public.guardias where id = t.guardia_id));
end;
$$;

create or replace function public.relevador_por_lpr(p_token text)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('condominio_id', id, 'organizacion_id', organizacion_id, 'url', pluma_url, 'auth', pluma_auth)
    from public.condominios where lpr_token = p_token;
$$;

create or replace function public.registrar_apertura(p_condominio uuid, p_puerta text, p_motivo text, p_actor text, p_resultado text)
returns void language sql security definer
set search_path = ''
as $$
  insert into public.aperturas (organizacion_id, condominio_id, puerta, motivo, actor, resultado)
  select organizacion_id, id, p_puerta, left(p_motivo, 200), left(p_actor, 120), p_resultado from public.condominios where id = p_condominio;
$$;

-- ─────────────────────────────────────────────────────────────
-- Timbre por QR: la visita escanea el QR de la entrada, elige vivienda y el residente autoriza desde su portal.
-- Al autorizar se crea un pase de un solo uso por 30 minutos que la visita muestra en caseta.
-- ─────────────────────────────────────────────────────────────
create or replace function public.timbre_datos(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare c public.condominios%rowtype;
begin
  select * into c from public.condominios where timbre_token = p_token;
  if not found then raise exception 'link_invalido'; end if;
  return jsonb_build_object('condominio', c.nombre, 'condominio_id', c.id, 'organizacion_id', c.organizacion_id,
    'viviendas', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'numero', v.numero) order by length(v.numero), v.numero)
                           from public.viviendas v where v.condominio_id = c.id), '[]'));
end;
$$;

create or replace function public.timbre_llamar(p_token text, p_vivienda uuid, p_visitante text, p_motivo text, p_foto text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  c public.condominios%rowtype;
  l record;
begin
  select * into c from public.condominios where timbre_token = p_token;
  if not found then raise exception 'link_invalido'; end if;
  if not exists (select 1 from public.viviendas where id = p_vivienda and condominio_id = c.id) then raise exception 'Elige la vivienda'; end if;
  if length(trim(coalesce(p_visitante, ''))) < 2 then raise exception 'Escribe tu nombre'; end if;
  if p_foto is not null and p_foto not like c.organizacion_id || '/condominios/' || c.id || '/timbre/%' then raise exception 'Foto no válida'; end if;
  -- Freno contra timbrazos: máximo 3 llamadas en espera por vivienda en 10 minutos.
  if (select count(*) from public.llamadas_timbre where vivienda_id = p_vivienda and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Ya se avisó a esta vivienda. Espera su respuesta o habla con caseta';
  end if;
  insert into public.llamadas_timbre (organizacion_id, condominio_id, vivienda_id, visitante, motivo, foto_path)
  values (c.organizacion_id, c.id, p_vivienda, left(trim(p_visitante), 120), nullif(left(trim(coalesce(p_motivo, '')), 120), ''), p_foto)
  returning id, token into l;
  return jsonb_build_object('id', l.id, 'token', l.token);
end;
$$;

create or replace function public.timbre_estado(p_token text)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('estado', case when l.estado = 'esperando' and l.created_at < now() - interval '15 minutes' then 'sin_respuesta' else l.estado end,
         'visitante', l.visitante, 'vivienda', v.numero, 'condominio', c.nombre,
         'codigo', (select p.codigo from public.pases p where p.id = l.pase_id))
    from public.llamadas_timbre l join public.viviendas v on v.id = l.vivienda_id join public.condominios c on c.id = l.condominio_id
   where l.token = p_token;
$$;

create or replace function public.vecino_responder_timbre(p_token text, p_llamada uuid, p_autorizar boolean)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  l public.llamadas_timbre%rowtype;
  nuevo uuid;
begin
  select * into l from public.llamadas_timbre where id = p_llamada and vivienda_id = r.vivienda_id for update;
  if not found then raise exception 'No encontramos ese aviso'; end if;
  if l.estado <> 'esperando' then return jsonb_build_object('estado', l.estado, 'repetido', true); end if;
  if l.created_at < now() - interval '15 minutes' then raise exception 'Este aviso ya expiró'; end if;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  if p_autorizar then
    if not public.permiso_residente(r.tipo, r.permisos, 'pases') then raise exception 'sin_permiso'; end if;
    insert into public.pases (organizacion_id, condominio_id, vivienda_id, residente_id, visitante, tipo_visita, modalidad, desde, hasta, max_usos)
    values (r.organizacion_id, r.condominio_id, r.vivienda_id, r.id, l.visitante, 'visita', 'unico', now() - interval '1 minute', now() + interval '30 minutes', 1)
    returning id into nuevo;
  end if;
  update public.llamadas_timbre set estado = case when p_autorizar then 'autorizada' else 'rechazada' end, respondio = r.nombre,
         respondida_at = now(), pase_id = nuevo where id = l.id;
  return jsonb_build_object('estado', case when p_autorizar then 'autorizada' else 'rechazada' end);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Rondines
-- ─────────────────────────────────────────────────────────────
create or replace function public.caseta_marcar_punto(p_turno uuid, p_hash text, p_codigo text, p_nota text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
  p public.puntos_rondin%rowtype;
begin
  select * into p from public.puntos_rondin where codigo = upper(trim(p_codigo)) and condominio_id = t.condominio_id and activo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'punto_invalido'); end if;
  insert into public.marcas_rondin (organizacion_id, condominio_id, punto_id, turno_id, guardia_id, nota)
  values (t.organizacion_id, t.condominio_id, p.id, t.id, t.guardia_id, nullif(left(trim(coalesce(p_nota, '')), 300), ''));
  return jsonb_build_object('ok', true, 'motivo', 'punto_marcado', 'punto', p.nombre);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Cuarto de paquetes con PIN
-- ─────────────────────────────────────────────────────────────
create or replace function public.vecino_crear_pin(p_token text, p_descripcion text, p_dias integer)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  nuevo text;
  intento int := 0;
begin
  if (select count(*) from public.pines_entrega where vivienda_id = r.vivienda_id and usado_at is null and expira > now()) >= 10 then
    raise exception 'Tienes 10 códigos activos. Espera a que se usen o venzan';
  end if;
  loop
    intento := intento + 1;
    nuevo := lpad((get_byte(extensions.gen_random_bytes(1), 0) * 65536 + get_byte(extensions.gen_random_bytes(1), 0) * 256
                   + get_byte(extensions.gen_random_bytes(1), 0))::bigint % 1000000 || '', 6, '0');
    begin
      insert into public.pines_entrega (organizacion_id, condominio_id, vivienda_id, residente_id, pin, descripcion, expira)
      values (r.organizacion_id, r.condominio_id, r.vivienda_id, r.id, nuevo, nullif(left(trim(coalesce(p_descripcion, '')), 120), ''),
              now() + make_interval(days => least(greatest(coalesce(p_dias, 3), 1), 14)));
      exit;
    exception when unique_violation then
      if intento > 20 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('pin', nuevo);
end;
$$;

-- Usa un PIN de entrega (en la tablet del cuarto de paquetes o en caseta). Registra el paquete para la vivienda.
create or replace function public.usar_pin_entrega(p_condominio uuid, p_pin text, p_guardia uuid, p_paqueteria text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  e public.pines_entrega%rowtype;
  viv text;
  paq uuid;
begin
  -- Máximo 10 intentos fallidos por condominio cada 10 minutos (6 dígitos no se pueden adivinar a fuerza bruta).
  if (select count(*) from public.intentos_pin where condominio_id = p_condominio and created_at > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;
  select * into e from public.pines_entrega where condominio_id = p_condominio and pin = trim(coalesce(p_pin, '')) and usado_at is null for update;
  if not found or e.expira < now() then
    insert into public.intentos_pin (condominio_id) values (p_condominio);
    if (select count(*) from public.intentos_pin where condominio_id = p_condominio and created_at > now() - interval '10 minutes') = 10 then
      insert into public.alertas_condominio (organizacion_id, condominio_id, tipo, detalle)
      select organizacion_id, id, 'pin_fallido', '10 PIN de entrega incorrectos en 10 minutos. El teclado se bloqueó un rato.' from public.condominios where id = p_condominio;
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'pin_invalido');
  end if;
  select numero into viv from public.viviendas where id = e.vivienda_id;
  insert into public.paquetes (organizacion_id, condominio_id, vivienda_id, paqueteria, descripcion, recibio_id)
  values (e.organizacion_id, e.condominio_id, e.vivienda_id, nullif(left(trim(coalesce(p_paqueteria, '')), 60), ''),
          coalesce(e.descripcion, 'Entrega con PIN'), p_guardia)
  returning id into paq;
  update public.pines_entrega set usado_at = now(), paquete_id = paq where id = e.id;
  return jsonb_build_object('ok', true, 'motivo', 'pin_valido', 'vivienda', viv, 'vivienda_id', e.vivienda_id, 'paquete_id', paq);
end;
$$;

create or replace function public.kiosco_datos(p_token text)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('condominio', nombre, 'condominio_id', id, 'organizacion_id', organizacion_id, 'url', paquetes_url, 'auth', pluma_auth)
    from public.condominios where kiosco_token = p_token;
$$;

create or replace function public.caseta_usar_pin(p_turno uuid, p_hash text, p_pin text, p_paqueteria text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  return public.usar_pin_entrega(t.condominio_id, p_pin, t.guardia_id, p_paqueteria);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Votaciones (un voto por vivienda; resultado por viviendas y por indiviso)
-- ─────────────────────────────────────────────────────────────
create or replace function public.resultados_votacion(p_votacion uuid)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  with v as (select * from public.votaciones where id = p_votacion),
  total as (select count(*) n, coalesce(sum(indiviso), 0) ind from public.viviendas where condominio_id = (select condominio_id from v))
  select jsonb_build_object(
    'votos', (select count(*) from public.votos where votacion_id = p_votacion),
    'viviendas', (select n from total),
    'participacion_pct', (select case when n > 0 then round(100.0 * (select count(*) from public.votos where votacion_id = p_votacion) / n) end from total),
    'opciones', (select jsonb_agg(jsonb_build_object('opcion', o.txt, 'votos',
                    (select count(*) from public.votos x where x.votacion_id = p_votacion and x.opcion = o.i - 1),
                    'indiviso', (select coalesce(sum(w.indiviso), 0) from public.votos x join public.viviendas w on w.id = x.vivienda_id
                                  where x.votacion_id = p_votacion and x.opcion = o.i - 1)) order by o.i)
                 from v, unnest(v.opciones) with ordinality o(txt, i)));
$$;

create or replace function public.vecino_votar(p_token text, p_votacion uuid, p_opcion integer)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  v public.votaciones%rowtype;
begin
  select * into v from public.votaciones where id = p_votacion and condominio_id = r.condominio_id;
  if not found then raise exception 'No encontramos esa votación'; end if;
  if now() < v.abre or now() > v.cierra then raise exception 'La votación no está abierta'; end if;
  if v.solo_propietarios and r.tipo <> 'propietario' then raise exception 'En esta votación vota el propietario'; end if;
  if p_opcion < 0 or p_opcion >= array_length(v.opciones, 1) then raise exception 'Opción no válida'; end if;
  insert into public.votos (organizacion_id, condominio_id, votacion_id, vivienda_id, residente_id, opcion)
  values (r.organizacion_id, r.condominio_id, v.id, r.vivienda_id, r.id, p_opcion);
exception when unique_violation then
  raise exception 'Tu vivienda ya votó';
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Tablero vecinal, documentos, asambleas y votaciones para el residente
-- ─────────────────────────────────────────────────────────────
create or replace function public.vecino_comunidad(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  return jsonb_build_object(
    'votaciones', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'pregunta', v.pregunta, 'descripcion', v.descripcion, 'opciones', v.opciones,
        'abre', v.abre, 'cierra', v.cierra, 'abierta', now() between v.abre and v.cierra, 'solo_propietarios', v.solo_propietarios,
        'mi_voto', (select x.opcion from public.votos x where x.votacion_id = v.id and x.vivienda_id = r.vivienda_id),
        'resultados', case when v.resultados_en_vivo or now() > v.cierra then public.resultados_votacion(v.id) end) order by v.cierra desc)
        from public.votaciones v where v.condominio_id = r.condominio_id and v.cierra > now() - interval '60 days'), '[]'),
    'asambleas', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'titulo', a.titulo, 'tipo', a.tipo, 'fecha', a.fecha, 'lugar', a.lugar,
        'orden_del_dia', a.orden_del_dia, 'acta', a.acta, 'estado', a.estado) order by a.fecha desc)
        from public.asambleas a where a.condominio_id = r.condominio_id and a.fecha > now() - interval '365 days'), '[]'),
    'acuerdos', coalesce((select jsonb_agg(jsonb_build_object('texto', x.texto, 'responsable', x.responsable, 'fecha_limite', x.fecha_limite, 'estado', x.estado)
        order by x.estado <> 'cumplido' desc, x.fecha_limite nulls last)
        from public.acuerdos x where x.condominio_id = r.condominio_id and (x.estado <> 'cumplido' or x.created_at > now() - interval '120 days')), '[]'),
    'documentos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'titulo', d.titulo, 'categoria', d.categoria, 'path', d.storage_path,
        'fecha', d.created_at) order by d.categoria, d.titulo)
        from public.documentos_condominio d where d.condominio_id = r.condominio_id and d.visible_residentes), '[]'),
    'tablero', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select t.id, t.tipo, t.titulo, t.texto, t.created_at, t.residente_id = r.id as mio,
               coalesce(split_part(rr.nombre, ' ', 1), 'Vecino') as autor,
               coalesce((select jsonb_agg(jsonb_build_object('texto', q.texto, 'autor', coalesce(split_part(qq.nombre, ' ', 1), 'Vecino'),
                                                            'fecha', q.created_at) order by q.created_at)
                         from public.tablero_respuestas q left join public.residentes qq on qq.id = q.residente_id
                        where q.publicacion_id = t.id), '[]') as respuestas
          from public.tablero t left join public.residentes rr on rr.id = t.residente_id
         where t.condominio_id = r.condominio_id and not t.oculto and t.created_at > now() - interval '90 days'
         order by t.created_at desc limit 50) x), '[]'),
    'llamadas', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'visitante', l.visitante, 'motivo', l.motivo, 'foto_path', l.foto_path,
        'estado', l.estado, 'created_at', l.created_at) order by l.created_at desc)
        from public.llamadas_timbre l where l.vivienda_id = r.vivienda_id and l.created_at > now() - interval '15 minutes'), '[]'),
    'vehiculos', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'placa', v.placa, 'descripcion', v.descripcion, 'activo', v.activo))
        from public.vehiculos v where v.vivienda_id = r.vivienda_id), '[]'),
    'pines', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'pin', p.pin, 'descripcion', p.descripcion, 'expira', p.expira,
        'usado_at', p.usado_at) order by p.created_at desc)
        from public.pines_entrega p where p.vivienda_id = r.vivienda_id and (p.usado_at is null and p.expira > now() or p.usado_at > now() - interval '7 days')), '[]'));
end;
$$;

create or replace function public.vecino_publicar(p_token text, p_tipo text, p_titulo text, p_texto text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  if (select count(*) from public.tablero where residente_id = r.id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Máximo 5 publicaciones al día';
  end if;
  insert into public.tablero (organizacion_id, condominio_id, residente_id, tipo, titulo, texto)
  values (r.organizacion_id, r.condominio_id, r.id, p_tipo, left(trim(p_titulo), 100), left(trim(p_texto), 1000));
end;
$$;

create or replace function public.vecino_responder(p_token text, p_publicacion uuid, p_texto text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  if not exists (select 1 from public.tablero where id = p_publicacion and condominio_id = r.condominio_id and not oculto) then
    raise exception 'No encontramos esa publicación';
  end if;
  insert into public.tablero_respuestas (organizacion_id, condominio_id, publicacion_id, residente_id, texto)
  values (r.organizacion_id, r.condominio_id, p_publicacion, r.id, left(trim(p_texto), 500));
end;
$$;

create or replace function public.vecino_borrar_publicacion(p_token text, p_publicacion uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  update public.tablero set oculto = true where id = p_publicacion and residente_id = r.id;
end;
$$;

create or replace function public.vecino_vehiculo(p_token text, p_placa text, p_descripcion text, p_borrar uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  if p_borrar is not null then
    delete from public.vehiculos where id = p_borrar and vivienda_id = r.vivienda_id;
    return;
  end if;
  if length(public.normaliza_placa(p_placa)) < 4 then raise exception 'Escribe la placa completa'; end if;
  if (select count(*) from public.vehiculos where vivienda_id = r.vivienda_id) >= 6 then raise exception 'Máximo 6 vehículos por vivienda'; end if;
  insert into public.vehiculos (organizacion_id, condominio_id, vivienda_id, placa, descripcion)
  values (r.organizacion_id, r.condominio_id, r.vivienda_id, public.normaliza_placa(p_placa), nullif(left(trim(coalesce(p_descripcion, '')), 60), ''));
exception when unique_violation then
  raise exception 'Esa placa ya está registrada en el condominio';
end;
$$;

-- El residente ve sus documentos permitidos: el servidor firma la liga solo si el documento es visible.
create or replace function public.vecino_documento(p_token text, p_documento uuid)
returns text language sql stable security definer
set search_path = ''
as $$
  select d.storage_path from public.documentos_condominio d join public.residentes r on r.condominio_id = d.condominio_id
   where r.token = p_token and r.activo and d.id = p_documento and d.visible_residentes;
$$;

-- ─────────────────────────────────────────────────────────────
-- Conciliación bancaria
-- ─────────────────────────────────────────────────────────────
-- Sugerencias: 1) un pago pendiente con el mismo monto y fecha cercana (±5 días); 2) el número de vivienda en el concepto.
create or replace function public.sugerencias_conciliacion(p_condominio uuid)
returns table (movimiento_id uuid, pago_id uuid, vivienda_id uuid, vivienda text, razon text)
language plpgsql stable security definer
set search_path = ''
as $$
declare org uuid;
begin
  select organizacion_id into org from public.condominios where id = p_condominio;
  if org is null or not public.es_miembro(org) then raise exception 'Sin permiso'; end if;
  return query
  select m.id,
         pg.id,
         coalesce(pg.vivienda_id, vv.id),
         coalesce(pv.numero, vv.numero),
         case when pg.id is not null then 'Pago por revisar del mismo monto' when vv.id is not null then 'El concepto menciona ' || vv.numero end
    from public.movimientos_banco m
    left join lateral (
      select p.id, p.vivienda_id from public.pagos_condominio p
       where p.condominio_id = m.condominio_id and p.estado = 'pendiente' and p.monto_centavos = m.monto_centavos
         and abs(p.pagado_el - m.fecha) <= 5
         and not exists (select 1 from public.movimientos_banco o where o.pago_id = p.id)
       order by abs(p.pagado_el - m.fecha), p.created_at limit 1) pg on true
    left join public.viviendas pv on pv.id = pg.vivienda_id
    left join lateral (
      select v.id, v.numero from public.viviendas v
       where v.condominio_id = m.condominio_id
         and (' ' || public.normaliza_nombre(coalesce(m.descripcion, '') || ' ' || coalesce(m.referencia, '')) || ' ')
             like ('% ' || public.normaliza_nombre(v.numero) || ' %')
       order by length(v.numero) desc limit 1) vv on true
   where m.condominio_id = p_condominio and m.estado = 'pendiente';
end;
$$;

-- Concilia un movimiento: con un pago por revisar (lo confirma) o creando el pago de una vivienda. Repetirlo no duplica.
create or replace function public.conciliar_movimiento(p_movimiento uuid, p_pago uuid, p_vivienda uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  m public.movimientos_banco%rowtype;
  pg public.pagos_condominio%rowtype;
  quien text := coalesce(auth.jwt() ->> 'email', 'administradora');
  nuevo uuid;
  r jsonb;
begin
  select * into m from public.movimientos_banco where id = p_movimiento for update;
  if not found or not public.es_miembro(m.organizacion_id) then raise exception 'No encontramos el movimiento'; end if;
  if m.estado = 'conciliado' then return jsonb_build_object('ok', true, 'repetido', true); end if;
  perform set_config('bk.actor', quien, true);
  if p_pago is not null then
    select * into pg from public.pagos_condominio where id = p_pago and condominio_id = m.condominio_id for update;
    if not found then raise exception 'No encontramos el pago'; end if;
    if pg.monto_centavos <> m.monto_centavos then raise exception 'El monto del pago no coincide con el depósito'; end if;
    nuevo := pg.id;
  else
    if not exists (select 1 from public.viviendas where id = p_vivienda and condominio_id = m.condominio_id) then raise exception 'Elige la vivienda'; end if;
    insert into public.pagos_condominio (organizacion_id, condominio_id, vivienda_id, monto_centavos, referencia, pagado_el, registrado_por, clave_cliente)
    values (m.organizacion_id, m.condominio_id, p_vivienda, m.monto_centavos, coalesce(m.referencia, left(m.descripcion, 60)), m.fecha,
            'conciliación bancaria', 'banco:' || m.id)
    on conflict (condominio_id, clave_cliente) do nothing
    returning id into nuevo;
    if nuevo is null then select id into nuevo from public.pagos_condominio where condominio_id = m.condominio_id and clave_cliente = 'banco:' || m.id; end if;
  end if;
  r := public.confirmar_pago_condominio(nuevo);
  update public.movimientos_banco set estado = 'conciliado', pago_id = nuevo where id = m.id;
  return jsonb_build_object('ok', true, 'pago_id', nuevo, 'folio', r ->> 'folio');
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Entrega de turno y datos de caseta con lo nuevo
-- ─────────────────────────────────────────────────────────────
create or replace function public.caseta_extra(p_turno uuid, p_hash text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  return jsonb_build_object(
    'alertas', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'detalle', a.detalle, 'created_at', a.created_at) order by a.created_at desc)
        from public.alertas_condominio a where a.condominio_id = t.condominio_id and a.atendida_at is null and a.created_at > now() - interval '24 hours'), '[]'),
    'timbre', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'visitante', l.visitante, 'vivienda', v.numero, 'estado', l.estado,
        'respondio', l.respondio, 'created_at', l.created_at, 'pase_id', l.pase_id,
        'usado', (select p.usos > 0 from public.pases p where p.id = l.pase_id)) order by l.created_at desc)
        from public.llamadas_timbre l join public.viviendas v on v.id = l.vivienda_id
       where l.condominio_id = t.condominio_id and l.created_at > now() - interval '60 minutes'), '[]'),
    'rondin', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre,
        'ultima', (select max(m.created_at) from public.marcas_rondin m where m.punto_id = p.id),
        'en_mi_turno', (select count(*) from public.marcas_rondin m where m.punto_id = p.id and m.turno_id = t.id)) order by p.orden, p.nombre)
        from public.puntos_rondin p where p.condominio_id = t.condominio_id and p.activo), '[]'),
    'tiene_pluma', (select pluma_url is not null from public.condominios where id = t.condominio_id),
    'vetados', coalesce((select jsonb_agg(jsonb_build_object('nombre', v.nombre, 'placa', v.placa, 'motivo', v.motivo) order by v.created_at desc)
        from public.vetados v where v.condominio_id = t.condominio_id and v.activo), '[]'));
end;
$$;

-- Vista previa de una vivienda para notificar (servidor): residentes activos.
create or replace function public.residentes_de_vivienda(p_vivienda uuid)
returns table (id uuid, nombre text, telefono text, token text)
language sql stable security definer
set search_path = ''
as $$
  select r.id, r.nombre, r.telefono, r.token from public.residentes r where r.vivienda_id = p_vivienda and r.activo;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos de ejecución
-- ─────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'buscar_vetado(uuid, text, text)', 'registrar_entrada_pase(uuid, text, uuid, text, timestamptz)',
    'caseta_registrar_entrada(uuid, text, timestamptz)',
    'caseta_manual(uuid, text, uuid, text, text, text, text, text, timestamptz, text)', 'caseta_foto_acceso(uuid, text, uuid, text)',
    'lpr_evento(text, text, text)', 'caseta_relevador(uuid, text, text)', 'relevador_por_lpr(text)',
    'registrar_apertura(uuid, text, text, text, text)', 'timbre_datos(text)', 'timbre_llamar(text, uuid, text, text, text)',
    'timbre_estado(text)', 'vecino_responder_timbre(text, uuid, boolean)', 'caseta_marcar_punto(uuid, text, text, text)',
    'vecino_crear_pin(text, text, integer)', 'usar_pin_entrega(uuid, text, uuid, text)', 'kiosco_datos(text)',
    'caseta_usar_pin(uuid, text, text, text)', 'vecino_votar(text, uuid, integer)', 'vecino_comunidad(text)',
    'vecino_publicar(text, text, text, text)', 'vecino_responder(text, uuid, text)', 'vecino_borrar_publicacion(text, uuid)',
    'vecino_vehiculo(text, text, text, uuid)', 'vecino_documento(text, uuid)', 'caseta_extra(uuid, text)', 'residentes_de_vivienda(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['resultados_votacion(uuid)', 'sugerencias_conciliacion(uuid)', 'conciliar_movimiento(uuid, uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Datos de ejemplo de lo nuevo (en los condominios de ejemplo que ya existan)
-- ─────────────────────────────────────────────────────────────
create or replace function public.demo_condominios_extra(p_org uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  c record;
  a uuid;
begin
  if not public.es_admin(p_org) then raise exception 'Sin permiso'; end if;
  perform set_config('bk.actor', 'datos de ejemplo', true);
  for c in select id from public.condominios where organizacion_id = p_org and nombre like '%(ejemplo)' loop
    insert into public.puntos_rondin (organizacion_id, condominio_id, nombre, orden) values
      (p_org, c.id, 'Portón principal', 1), (p_org, c.id, 'Casa club', 2), (p_org, c.id, 'Cisterna y bombas', 3), (p_org, c.id, 'Barda norte', 4);
    insert into public.vetados (organizacion_id, condominio_id, nombre, placa, motivo, creado_por)
    values (p_org, c.id, 'Juan Ejemplo Vetado', 'XYZ-999-A', 'Robo de herramienta en obra (ejemplo)', 'datos de ejemplo');
    insert into public.asambleas (organizacion_id, condominio_id, titulo, tipo, fecha, lugar, orden_del_dia)
    values (p_org, c.id, 'Asamblea ordinaria anual', 'ordinaria', now() + interval '14 days', 'Casa club, 19:00 h',
            E'1. Lista de asistencia y quórum\n2. Informe de la administración\n3. Presupuesto del próximo año\n4. Asuntos generales')
    returning id into a;
    insert into public.votaciones (organizacion_id, condominio_id, asamblea_id, pregunta, descripcion, opciones, cierra, resultados_en_vivo)
    values (p_org, c.id, a, '¿Aprobamos cambiar las luminarias del andador a LED?', 'Cotización elegida: $48,000. Se paga con el fondo de reserva.',
            array['Sí', 'No', 'Me abstengo'], now() + interval '10 days', true);
    insert into public.acuerdos (organizacion_id, condominio_id, texto, responsable, fecha_limite)
    values (p_org, c.id, 'Instalar topes en la entrada', 'Administración', (now() + interval '30 days')::date);
    insert into public.tablero (organizacion_id, condominio_id, residente_id, tipo, titulo, texto)
    select p_org, c.id, r.id, 'recomendacion', 'Plomero de confianza', 'Don Memo nos arregló una fuga rápido y a buen precio. Les paso su número por aquí.'
      from public.residentes r where r.condominio_id = c.id order by r.created_at limit 1;
    insert into public.vehiculos (organizacion_id, condominio_id, vivienda_id, placa, descripcion)
    select p_org, c.id, r.vivienda_id, 'UAB' || lpad((row_number() over ())::text, 3, '0') || 'A', 'Auto (ejemplo)'
      from public.residentes r where r.condominio_id = c.id order by r.created_at limit 3
    on conflict do nothing;
    update public.viviendas set indiviso = round(100.0 / (select count(*) from public.viviendas where condominio_id = c.id), 4) where condominio_id = c.id;
  end loop;
end;
$$;
revoke execute on function public.demo_condominios_extra(uuid) from public, anon;
grant execute on function public.demo_condominios_extra(uuid) to authenticated;
