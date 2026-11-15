-- Black Key · Condominios (3): piloto "una app que coordina cada llegada"
-- Pases con contexto (visita, fiesta, mudanza, servicio) con acceso, instrucciones, cajón y trabajo autorizado;
-- fiestas con un pase revocable por invitado; estacionamiento de visitas; reglas de acceso por tipo; paquetería con
-- foto, ubicación, evidencia y recogida por tercero (PIN o link de un solo uso); incidentes agrupados; recepción del
-- turno; aclaraciones; indicadores del piloto; historial de equipos con QR; obras con cuota y avance; lista de espera
-- con oferta por plazo e inventario de amenidades.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de 20261113090000_condominios_seguridad_comunidad.sql).

-- ─────────────────────────────────────────────────────────────
-- Reglas de acceso por tipo de pase
-- ─────────────────────────────────────────────────────────────
create table public.reglas_acceso (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  motivo          text not null check (motivo in ('visita', 'fiesta', 'mudanza', 'servicio')),
  max_horas       integer check (max_horas is null or max_horas between 1 and 8784),
  hora_desde      time,                             -- horario permitido de entrada
  hora_hasta      time,
  acceso          text,                             -- "Entrada principal", "Acceso de servicio (calle Fresno)"
  instrucciones   text,                             -- lo que lee la visita en su pase
  max_invitados   integer check (max_invitados is null or max_invitados between 1 and 500),
  max_cajones     integer not null default 0 check (max_cajones between 0 and 50),
  unique (condominio_id, motivo)
);

-- Motivo de un pase a partir de su tipo.
create or replace function public.motivo_pase(tipo text)
returns text language sql immutable
set search_path = ''
as $$
  select case when tipo in ('fiesta', 'mudanza') then tipo when tipo in ('proveedor', 'servicio') then 'servicio' else 'visita' end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Cajones de visitas y fiestas
-- ─────────────────────────────────────────────────────────────
create table public.cajones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  nombre          text not null check (length(nombre) between 1 and 30),
  zona_id         uuid references public.zonas_condominio(id) on delete set null,
  activo          boolean not null default true,
  unique (condominio_id, nombre)
);

create table public.eventos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  residente_id    uuid references public.residentes(id) on delete set null,
  nombre          text not null check (length(nombre) between 2 and 120),
  inicio          timestamptz not null,
  fin             timestamptz not null,
  instrucciones   text,
  estado          text not null default 'activo' check (estado in ('activo', 'cancelado')),
  created_at      timestamptz not null default now(),
  check (fin > inicio)
);

-- Pases: contexto
alter table public.pases drop constraint if exists pases_tipo_visita_check;
alter table public.pases add constraint pases_tipo_visita_check
  check (tipo_visita in ('visita', 'proveedor', 'servicio', 'taxi', 'paqueteria', 'fiesta', 'mudanza'));
alter table public.pases
  add column if not exists folio             integer,
  add column if not exists acceso            text,
  add column if not exists instrucciones     text,
  add column if not exists trabajo           text,                 -- servicio: trabajo autorizado / orden de trabajo
  add column if not exists ticket_id         uuid references public.tickets(id) on delete set null,
  add column if not exists cajon_id          uuid references public.cajones(id) on delete set null,
  add column if not exists evento_id         uuid references public.eventos(id) on delete cascade,
  add column if not exists recursos          text[],               -- mudanza: zona_carga, elevador
  add column if not exists primer_intento_at timestamptz;          -- primera vez que se presentó en caseta
alter table public.condominios add column if not exists ultimo_folio_pase integer not null default 0;
create unique index if not exists pases_folio_idx on public.pases (condominio_id, folio);
create index if not exists pases_evento_idx on public.pases (evento_id);

alter table public.accesos
  add column if not exists cajon_id   uuid references public.cajones(id) on delete set null,
  add column if not exists llegada_at timestamptz;                 -- cuándo llegó (para medir el tiempo hasta validar)

-- Folio corto por condominio (para buscar si la cámara falla) y valores por omisión de las reglas.
create or replace function public.pases_antes_de_insertar()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  rg public.reglas_acceso%rowtype;
  local_ini time;
begin
  update public.condominios set ultimo_folio_pase = ultimo_folio_pase + 1 where id = new.condominio_id returning ultimo_folio_pase into new.folio;
  select * into rg from public.reglas_acceso where condominio_id = new.condominio_id and motivo = public.motivo_pase(new.tipo_visita);
  if found then
    new.acceso := coalesce(new.acceso, rg.acceso);
    new.instrucciones := coalesce(new.instrucciones, rg.instrucciones);
    -- Las reglas aplican a lo que crean los residentes (no a lo que aprueba la administración).
    if new.residente_id is not null and current_setting('bk.sin_reglas', true) is distinct from 'si' then
      if rg.max_horas is not null and new.modalidad = 'unico' and new.hasta - new.desde > make_interval(hours => rg.max_horas) then
        raise exception 'Este tipo de pase dura máximo % horas', rg.max_horas;
      end if;
      local_ini := (new.desde at time zone 'America/Mexico_City')::time;
      if new.modalidad = 'unico' and rg.hora_desde is not null and rg.hora_hasta is not null
         and (local_ini < rg.hora_desde or local_ini > rg.hora_hasta) then
        raise exception 'El horario permitido para este tipo de pase es de % a %', to_char(rg.hora_desde, 'HH24:MI'), to_char(rg.hora_hasta, 'HH24:MI');
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists pases_antes on public.pases;
create trigger pases_antes before insert on public.pases for each row execute function public.pases_antes_de_insertar();

-- Asigna el primer cajón libre en una ventana de tiempo. El candado sobre los cajones evita que dos pases tomen el mismo.
create or replace function public.asignar_cajon(p_condominio uuid, p_desde timestamptz, p_hasta timestamptz)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare c uuid;
begin
  perform 1 from public.cajones where condominio_id = p_condominio for update;
  select k.id into c from public.cajones k
   where k.condominio_id = p_condominio and k.activo
     and not exists (
       select 1 from public.pases p
        where p.cajon_id = k.id and p.estado = 'activo' and p.desde < p_hasta and p.hasta > p_desde
          -- un pase de un uso que ya salió deja libre su cajón
          and not (p.max_usos is not null and p.usos >= p.max_usos
                   and exists (select 1 from public.accesos e join public.accesos s on s.entrada_id = e.id where e.pase_id = p.id)))
     and not exists (select 1 from public.accesos e where e.cajon_id = k.id and e.tipo = 'entrada'
                       and not exists (select 1 from public.accesos s where s.entrada_id = e.id) and e.ocurrio_at > now() - interval '24 hours')
   order by length(k.nombre), k.nombre limit 1;
  return c;
end;
$$;

-- Entrada con pase (misma regla para QR, lista, timbre y placas). Ahora también: cajón, llegada y primer intento.
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
  cajon text;
  llegada timestamptz;
  nuevo uuid;
  info jsonb;
begin
  if p_turno is not null then select * into t from public.turnos where id = p_turno; end if;
  select * into p from public.pases where (codigo = upper(trim(p_codigo)) or (p_codigo ~ '^#?[0-9]{1,7}$' and folio = ltrim(p_codigo, '#')::int))
     and condominio_id = p_condominio for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;

  select v.numero into viv from public.viviendas v where v.id = p.vivienda_id;
  select k.nombre into cajon from public.cajones k where k.id = p.cajon_id;
  info := jsonb_build_object('visitante', p.visitante, 'vivienda', viv, 'folio', p.folio, 'tipo_visita', p.tipo_visita, 'acceso', p.acceso,
                             'instrucciones', p.instrucciones, 'trabajo', p.trabajo, 'cajon', cajon, 'recursos', p.recursos, 'placa', p.placa);
  if p.modalidad = 'unico' and p.primer_intento_at is null then
    update public.pases set primer_intento_at = p_ahora where id = p.id;
  end if;
  if p.estado = 'cancelado' then
    return info || jsonb_build_object('ok', false, 'motivo', 'cancelado');
  end if;
  if p_ahora < p.desde then return info || jsonb_build_object('ok', false, 'motivo', 'aun_no_vigente', 'desde', p.desde); end if;
  if p_ahora > p.hasta then return info || jsonb_build_object('ok', false, 'motivo', 'vencido', 'hasta', p.hasta); end if;
  if p.modalidad = 'recurrente' and (
       (p.dias is not null and not (extract(isodow from local)::smallint = any (p.dias)))
    or (p.hora_desde is not null and local::time < p.hora_desde)
    or (p.hora_hasta is not null and local::time > p.hora_hasta)) then
    return info || jsonb_build_object('ok', false, 'motivo', 'fuera_de_horario');
  end if;
  if p.max_usos is not null and p.usos >= p.max_usos then return info || jsonb_build_object('ok', false, 'motivo', 'ya_usado'); end if;
  vt := public.buscar_vetado(p.condominio_id, p.visitante, p.placa);
  if vt.id is not null then
    insert into public.alertas_condominio (organizacion_id, condominio_id, tipo, detalle)
    values (p.organizacion_id, p.condominio_id, 'vetado', p.visitante || coalesce(' · ' || p.placa, '') || ' intentó entrar a ' || viv || '. Motivo: ' || vt.motivo);
    return info || jsonb_build_object('ok', false, 'motivo', 'vetado', 'detalle', vt.motivo, 'alerta', true);
  end if;

  -- Llegada: cuando tocó el timbre, o la primera vez que se presentó con este pase.
  llegada := least(p_ahora, coalesce((select l.created_at from public.llamadas_timbre l where l.pase_id = p.id limit 1), p.primer_intento_at, p_ahora));
  update public.pases set usos = usos + 1 where id = p.id;
  select coalesce(r.nombre, 'Residente') into quien from public.residentes r where r.id = p.residente_id;
  perform set_config('bk.actor', 'caseta', true);
  insert into public.accesos (organizacion_id, condominio_id, vivienda_id, pase_id, tipo, visitante, placa, metodo, autorizo, guardia_id, turno_id,
                              ocurrio_at, cajon_id, llegada_at)
  values (p.organizacion_id, p.condominio_id, p.vivienda_id, p.id, 'entrada', p.visitante, p.placa, p_metodo,
          coalesce(quien, 'Residente') || case p_metodo when 'placa' then ' (pase con placa)' when 'timbre' then ' (por timbre)' else ' (pase QR)' end,
          t.guardia_id, t.id, p_ahora, p.cajon_id, llegada)
  returning id into nuevo;

  return info || jsonb_build_object('ok', true, 'motivo', 'autorizado', 'acceso_id', nuevo, 'vivienda_id', p.vivienda_id,
                                    'autorizo', quien, 'modalidad', p.modalidad, 'hasta', p.hasta);
end;
$$;

-- Crear pase con contexto desde el portal (un solo paso, atómico).
-- p_datos: visitante, tipo_visita, modalidad, desde, hasta, dias, hora_desde, hora_hasta, placa, servicio, metodo,
--          instrucciones, trabajo, ticket_id, cajon (bool)
create or replace function public.vecino_crear_pase_ctx(p_token text, p_datos jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  d jsonb := p_datos;
  res jsonb;
  pase public.pases%rowtype;
  rg public.reglas_acceso%rowtype;
  cajon uuid;
  ticket uuid := nullif(d ->> 'ticket_id', '')::uuid;
begin
  if d ->> 'tipo_visita' in ('fiesta', 'mudanza') then raise exception 'Usa la opción de fiesta o mudanza'; end if;
  res := public.vecino_crear_pase(p_token, d ->> 'visitante', coalesce(d ->> 'tipo_visita', 'visita'), coalesce(d ->> 'modalidad', 'unico'),
           (d ->> 'desde')::timestamptz, (d ->> 'hasta')::timestamptz,
           case when jsonb_typeof(d -> 'dias') = 'array' then array(select jsonb_array_elements_text(d -> 'dias')::smallint) end,
           nullif(d ->> 'hora_desde', '')::time, nullif(d ->> 'hora_hasta', '')::time, d ->> 'placa', d ->> 'servicio', coalesce(d ->> 'metodo', 'qr'));
  select * into pase from public.pases where id = (res ->> 'id')::uuid;
  if ticket is not null and not exists (select 1 from public.tickets where id = ticket and condominio_id = r.condominio_id) then ticket := null; end if;
  if coalesce((d ->> 'cajon')::boolean, false) then
    select * into rg from public.reglas_acceso where condominio_id = r.condominio_id and motivo = public.motivo_pase(pase.tipo_visita);
    if found and rg.max_cajones = 0 then raise exception 'Este tipo de pase no incluye cajón de visitas'; end if;
    cajon := public.asignar_cajon(r.condominio_id, pase.desde, pase.hasta);
    if cajon is null then raise exception 'No hay cajones de visita libres en ese horario'; end if;
  end if;
  update public.pases set instrucciones = coalesce(nullif(left(trim(coalesce(d ->> 'instrucciones', '')), 500), ''), instrucciones),
         trabajo = nullif(left(trim(coalesce(d ->> 'trabajo', '')), 300), ''), ticket_id = ticket, cajon_id = cajon
   where id = pase.id;
  return res || jsonb_build_object('folio', pase.folio);
end;
$$;

-- Fiesta: un pase de un solo uso por invitado (cada uno revocable) y cajones para los primeros.
create or replace function public.vecino_crear_evento(p_token text, p_nombre text, p_inicio timestamptz, p_fin timestamptz,
                                                      p_invitados text[], p_cajones integer, p_instrucciones text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  rg public.reglas_acceso%rowtype;
  ev uuid;
begin
  if not public.permiso_residente(r.tipo, r.permisos, 'pases') then raise exception 'sin_permiso'; end if;
  select * into rg from public.reglas_acceso where condominio_id = r.condominio_id and motivo = 'fiesta';
  if coalesce(array_length(p_invitados, 1), 0) = 0 then raise exception 'Agrega al menos un invitado'; end if;
  if rg.max_invitados is not null and array_length(p_invitados, 1) > rg.max_invitados then
    raise exception 'El máximo de invitados por fiesta es %', rg.max_invitados;
  end if;
  if coalesce(p_cajones, 0) > coalesce(rg.max_cajones, 0) then raise exception 'Puedes apartar hasta % cajones', coalesce(rg.max_cajones, 0); end if;
  if p_fin <= p_inicio or p_fin < now() then raise exception 'Revisa el horario de la fiesta'; end if;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  insert into public.eventos (organizacion_id, condominio_id, vivienda_id, residente_id, nombre, inicio, fin, instrucciones)
  values (r.organizacion_id, r.condominio_id, r.vivienda_id, r.id, left(trim(p_nombre), 120), p_inicio, p_fin, nullif(left(trim(coalesce(p_instrucciones, '')), 500), ''))
  returning id into ev;
  perform public.agregar_invitados(ev, p_invitados, coalesce(p_cajones, 0));
  return ev;
end;
$$;

create or replace function public.agregar_invitados(p_evento uuid, p_invitados text[], p_cajones integer)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  e public.eventos%rowtype;
  nombre text;
  n integer := 0;
  nuevo uuid;
  cajon uuid;
begin
  select * into e from public.eventos where id = p_evento and estado = 'activo';
  if not found then raise exception 'La fiesta ya no está activa'; end if;
  foreach nombre in array p_invitados loop
    nombre := left(trim(nombre), 120);
    continue when length(nombre) < 2;
    n := n + 1;
    insert into public.pases (organizacion_id, condominio_id, vivienda_id, residente_id, visitante, tipo_visita, modalidad, desde, hasta, max_usos, evento_id, instrucciones)
    values (e.organizacion_id, e.condominio_id, e.vivienda_id, e.residente_id, nombre, 'fiesta', 'unico',
            e.inicio - interval '30 minutes', e.fin, 1, e.id, e.instrucciones)
    returning id into nuevo;
    if n <= p_cajones then
      cajon := public.asignar_cajon(e.condominio_id, e.inicio - interval '30 minutes', e.fin);
      if cajon is null then raise exception 'Solo quedan % cajones libres para ese horario', n - 1; end if;
      update public.pases set cajon_id = cajon where id = nuevo;
    end if;
  end loop;
end;
$$;

create or replace function public.vecino_agregar_invitados(p_token text, p_evento uuid, p_invitados text[])
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  rg public.reglas_acceso%rowtype;
  total integer;
begin
  if not exists (select 1 from public.eventos where id = p_evento and vivienda_id = r.vivienda_id) then raise exception 'No encontramos esa fiesta'; end if;
  select * into rg from public.reglas_acceso where condominio_id = r.condominio_id and motivo = 'fiesta';
  select count(*) + coalesce(array_length(p_invitados, 1), 0) into total from public.pases where evento_id = p_evento and estado = 'activo';
  if rg.max_invitados is not null and total > rg.max_invitados then raise exception 'El máximo de invitados por fiesta es %', rg.max_invitados; end if;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  perform public.agregar_invitados(p_evento, p_invitados, 0);
end;
$$;

create or replace function public.vecino_cancelar_evento(p_token text, p_evento uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  update public.eventos set estado = 'cancelado' where id = p_evento and vivienda_id = r.vivienda_id and estado = 'activo';
  if not found then raise exception 'No encontramos esa fiesta'; end if;
  update public.pases set estado = 'cancelado', cancelado_at = now() where evento_id = p_evento and estado = 'activo';
end;
$$;

create or replace function public.vecino_eventos(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'inicio', e.inicio, 'fin', e.fin, 'estado', e.estado,
      'instrucciones', e.instrucciones,
      'invitados', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.visitante, 'codigo', p.codigo, 'folio', p.folio,
                      'estado', p.estado, 'usos', p.usos, 'cajon', (select k.nombre from public.cajones k where k.id = p.cajon_id)) order by p.created_at), '[]')
                    from public.pases p where p.evento_id = e.id)) order by e.inicio desc)
    from public.eventos e where e.vivienda_id = r.vivienda_id and e.fin > now() - interval '7 days'), '[]');
end;
$$;

-- Mudanzas: el pase lleva los recursos e instrucciones (reemplaza la del módulo anterior).
create or replace function public.decidir_mudanza(p_mudanza uuid, p_aprobar boolean, p_nota text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  m public.mudanzas%rowtype;
  quien text := coalesce(auth.jwt() ->> 'email', 'administradora');
  pase uuid;
  rg public.reglas_acceso%rowtype;
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
    select * into rg from public.reglas_acceso where condominio_id = m.condominio_id and motivo = 'mudanza';
    insert into public.pases (organizacion_id, condominio_id, vivienda_id, residente_id, visitante, tipo_visita, modalidad, desde, hasta, placa, servicio, recursos, instrucciones)
    values (m.organizacion_id, m.condominio_id, m.vivienda_id, null, m.empresa, 'mudanza', 'recurrente',
            m.inicio - interval '30 minutes', m.fin + interval '1 hour', m.placa, 'Mudanza (' || m.tipo || ')', m.recursos,
            coalesce(rg.instrucciones, 'Presenta este pase en caseta.') ||
            case when m.recursos @> array['zona_carga'] then ' Zona de carga apartada.' else '' end ||
            case when m.recursos @> array['elevador'] then ' Elevador de servicio apartado.' else '' end)
    returning id into pase;
    update public.pases set residente_id = m.residente_id where id = pase;
  end if;
  update public.mudanzas set estado = case when p_aprobar then 'aprobada' else 'rechazada' end, pase_id = pase,
         nota = nullif(left(trim(coalesce(p_nota, '')), 300), ''), revisado_por = quien, revisado_at = now()
   where id = m.id;
end;
$$;

-- Pase público: solo los datos de acceso de esa persona.
create or replace function public.pase_publico(p_codigo text)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('codigo', p.codigo, 'folio', p.folio, 'visitante', p.visitante, 'desde', p.desde, 'hasta', p.hasta, 'estado', p.estado,
           'usos', p.usos, 'max_usos', p.max_usos, 'modalidad', p.modalidad, 'metodo_acceso', p.metodo_acceso, 'tipo_visita', p.tipo_visita,
           'acceso', p.acceso, 'instrucciones', p.instrucciones, 'trabajo', p.trabajo, 'recursos', p.recursos,
           'cajon', (select k.nombre from public.cajones k where k.id = p.cajon_id),
           'evento', (select e.nombre from public.eventos e where e.id = p.evento_id),
           'condominio', c.nombre, 'direccion', c.direccion)
    from public.pases p join public.condominios c on c.id = p.condominio_id
   where p.codigo = upper(p_codigo);
$$;

-- ─────────────────────────────────────────────────────────────
-- Paquetería: foto, ubicación, evidencia, tiempo de registro y recogida por tercero
-- ─────────────────────────────────────────────────────────────
alter table public.paquetes
  add column if not exists foto_path          text,
  add column if not exists ubicacion          text,
  add column if not exists entrega_foto_path  text,
  add column if not exists entrega_metodo     text check (entrega_metodo in ('residente', 'tercero')),
  add column if not exists registro_segundos  integer check (registro_segundos is null or registro_segundos between 0 and 86400);

create table public.autorizaciones_recogida (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  vivienda_id     uuid not null references public.viviendas(id) on delete cascade,
  residente_id    uuid references public.residentes(id) on delete set null,
  paquete_id      uuid references public.paquetes(id) on delete cascade,  -- null = todos los pendientes de la vivienda
  nombre          text not null check (length(nombre) between 2 and 120),
  pin             text not null check (pin ~ '^[0-9]{6}$'),
  token           text not null unique default public.token_opaco(24),
  expira          timestamptz not null,
  usado_at        timestamptz,
  revocado_at     timestamptz,
  created_at      timestamptz not null default now()
);
create unique index recogida_pin_activo_idx on public.autorizaciones_recogida (condominio_id, pin) where usado_at is null and revocado_at is null;

create or replace function public.caseta_paquete_detalle(p_turno uuid, p_hash text, p_paquete uuid, p_foto text, p_ubicacion text, p_segundos integer)
returns void language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  if p_foto is not null and p_foto not like t.organizacion_id || '/condominios/' || t.condominio_id || '/paquetes/%' then raise exception 'Foto no válida'; end if;
  update public.paquetes set foto_path = coalesce(p_foto, foto_path), ubicacion = coalesce(nullif(left(trim(coalesce(p_ubicacion, '')), 60), ''), ubicacion),
         registro_segundos = coalesce(registro_segundos, least(greatest(p_segundos, 0), 86400))
   where id = p_paquete and condominio_id = t.condominio_id;
end;
$$;

-- Entrega al residente (con evidencia). Dos guardias no pueden confirmar el mismo paquete: gana el primero.
create or replace function public.caseta_entregar_paquete(p_turno uuid, p_hash text, p_paquete uuid, p_entregado_a text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  if length(trim(coalesce(p_entregado_a, ''))) < 2 then raise exception 'Escribe quién lo recogió'; end if;
  update public.paquetes set entregado_a = left(trim(p_entregado_a), 80), entrego_id = t.guardia_id, entregado_at = now(), entrega_metodo = 'residente'
   where id = p_paquete and condominio_id = t.condominio_id and entregado_at is null;
  if not found then raise exception 'Ese paquete ya se entregó'; end if;
end;
$$;

create or replace function public.caseta_evidencia_entrega(p_turno uuid, p_hash text, p_paquete uuid, p_foto text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  if p_foto not like t.organizacion_id || '/condominios/' || t.condominio_id || '/paquetes/%' then raise exception 'Foto no válida'; end if;
  update public.paquetes set entrega_foto_path = p_foto where id = p_paquete and condominio_id = t.condominio_id and entregado_at is not null;
end;
$$;

create or replace function public.vecino_autorizar_recogida(p_token text, p_paquete uuid, p_nombre text, p_horas integer)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  pin text;
  intento int := 0;
  a public.autorizaciones_recogida%rowtype;
begin
  if p_paquete is not null and not exists (select 1 from public.paquetes where id = p_paquete and vivienda_id = r.vivienda_id and entregado_at is null) then
    raise exception 'Ese paquete ya se entregó';
  end if;
  if length(trim(coalesce(p_nombre, ''))) < 2 then raise exception 'Escribe el nombre de quien va a recoger'; end if;
  loop
    intento := intento + 1;
    pin := lpad(((get_byte(extensions.gen_random_bytes(1), 0) * 65536 + get_byte(extensions.gen_random_bytes(1), 0) * 256
                 + get_byte(extensions.gen_random_bytes(1), 0))::bigint % 1000000)::text, 6, '0');
    begin
      insert into public.autorizaciones_recogida (organizacion_id, condominio_id, vivienda_id, residente_id, paquete_id, nombre, pin, expira)
      values (r.organizacion_id, r.condominio_id, r.vivienda_id, r.id, p_paquete, left(trim(p_nombre), 120), pin,
              now() + make_interval(hours => least(greatest(coalesce(p_horas, 24), 1), 168)))
      returning * into a;
      exit;
    exception when unique_violation then
      if intento > 20 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('id', a.id, 'pin', a.pin, 'token', a.token);
end;
$$;

create or replace function public.vecino_revocar_recogida(p_token text, p_autorizacion uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  update public.autorizaciones_recogida set revocado_at = now()
   where id = p_autorizacion and vivienda_id = r.vivienda_id and usado_at is null and revocado_at is null;
end;
$$;

-- Lo que ve la persona autorizada al abrir su link (sin datos del residente).
create or replace function public.recogida_publica(p_token text)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('nombre', a.nombre, 'pin', case when a.usado_at is null and a.revocado_at is null and a.expira > now() then a.pin end,
           'estado', case when a.usado_at is not null then 'usada' when a.revocado_at is not null then 'revocada' when a.expira < now() then 'vencida' else 'activa' end,
           'vivienda', v.numero, 'condominio', c.nombre, 'expira', a.expira,
           'paquetes', (select count(*) from public.paquetes k where k.vivienda_id = a.vivienda_id and k.entregado_at is null
                          and (a.paquete_id is null or k.id = a.paquete_id)))
    from public.autorizaciones_recogida a join public.viviendas v on v.id = a.vivienda_id join public.condominios c on c.id = a.condominio_id
   where a.token = p_token;
$$;

-- Caseta entrega a un tercero con su PIN (un solo uso, con límite de intentos).
create or replace function public.caseta_entregar_tercero(p_turno uuid, p_hash text, p_pin text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
  a public.autorizaciones_recogida%rowtype;
  viv text;
  n integer;
begin
  if (select count(*) from public.intentos_pin where condominio_id = t.condominio_id and created_at > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;
  select * into a from public.autorizaciones_recogida
   where condominio_id = t.condominio_id and pin = trim(coalesce(p_pin, '')) and usado_at is null and revocado_at is null for update;
  if not found or a.expira < now() then
    insert into public.intentos_pin (condominio_id) values (t.condominio_id);
    return jsonb_build_object('ok', false, 'motivo', 'pin_invalido');
  end if;
  select numero into viv from public.viviendas where id = a.vivienda_id;
  perform set_config('bk.actor', 'caseta', true);
  update public.paquetes set entregado_a = a.nombre || ' (autorizado por el residente)', entrego_id = t.guardia_id, entregado_at = now(), entrega_metodo = 'tercero'
   where vivienda_id = a.vivienda_id and entregado_at is null and (a.paquete_id is null or id = a.paquete_id);
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'motivo', 'sin_paquetes', 'vivienda', viv); end if;
  update public.autorizaciones_recogida set usado_at = now() where id = a.id;
  return jsonb_build_object('ok', true, 'motivo', 'recogida', 'nombre', a.nombre, 'vivienda', viv, 'vivienda_id', a.vivienda_id, 'paquetes', n,
    'ids', (select jsonb_agg(id) from public.paquetes where vivienda_id = a.vivienda_id and entrego_id = t.guardia_id and entregado_at > now() - interval '5 seconds'));
end;
$$;

create or replace function public.vecino_recogidas(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  return jsonb_build_object(
    'autorizaciones', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'pin', a.pin, 'token', a.token, 'paquete_id', a.paquete_id,
        'expira', a.expira, 'usado_at', a.usado_at, 'revocado_at', a.revocado_at) order by a.created_at desc)
        from public.autorizaciones_recogida a where a.vivienda_id = r.vivienda_id and a.created_at > now() - interval '14 days'), '[]'),
    'paquetes', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'foto_path', k.foto_path, 'ubicacion', k.ubicacion,
        'entrega_foto_path', k.entrega_foto_path, 'entrega_metodo', k.entrega_metodo))
        from public.paquetes k where k.vivienda_id = r.vivienda_id and (k.entregado_at is null or k.entregado_at > now() - interval '14 days')), '[]'));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Incidentes agrupados
-- ─────────────────────────────────────────────────────────────
create table public.incidentes (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id    uuid not null references public.condominios(id) on delete cascade,
  zona_id          uuid references public.zonas_condominio(id) on delete set null,
  categoria        text,
  titulo           text not null check (length(titulo) between 3 and 120),
  estado           text not null default 'abierto' check (estado in ('abierto', 'en_proceso', 'resuelto')),
  responsable      text,
  fecha_compromiso date,
  resolucion       text,
  primer_aviso_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.tickets add column if not exists incidente_id uuid references public.incidentes(id) on delete set null;
create index if not exists tickets_incidente_idx on public.tickets (incidente_id);

-- Sugerencias: reportes abiertos sin agrupar de la misma categoría y zona en las últimas 48 h (2 o más), o que encajan en un incidente abierto.
create or replace function public.sugerencias_incidentes(p_condominio uuid)
returns table (ticket_id uuid, folio bigint, titulo text, categoria text, zona_id uuid, zona text, vivienda text, created_at timestamptz,
               grupo text, incidente_id uuid)
language plpgsql stable security definer
set search_path = ''
as $$
declare org uuid;
begin
  select organizacion_id into org from public.condominios where id = p_condominio;
  if org is null or not public.es_miembro(org) then raise exception 'Sin permiso'; end if;
  return query
  with base as (
    select t.id, t.folio, t.titulo, t.categoria, v.zona_id, z.nombre as zona, v.numero, t.created_at
      from public.tickets t left join public.viviendas v on v.id = t.vivienda_id left join public.zonas_condominio z on z.id = v.zona_id
     where t.condominio_id = p_condominio and t.incidente_id is null and not t.sensible
       and t.estado not in ('resuelto', 'cancelado') and t.created_at > now() - interval '48 hours'),
  grupos as (select b.categoria, b.zona_id from base b group by b.categoria, b.zona_id having count(*) >= 2)
  select b.id, b.folio, b.titulo, b.categoria, b.zona_id, b.zona, b.numero, b.created_at,
         coalesce(b.categoria, 'otro') || ' · ' || coalesce(b.zona, 'sin zona'),
         (select i.id from public.incidentes i where i.condominio_id = p_condominio and i.estado <> 'resuelto'
            and i.categoria is not distinct from b.categoria and i.zona_id is not distinct from b.zona_id order by i.created_at desc limit 1)
    from base b
   where exists (select 1 from grupos g where g.categoria is not distinct from b.categoria and g.zona_id is not distinct from b.zona_id)
      or exists (select 1 from public.incidentes i where i.condominio_id = p_condominio and i.estado <> 'resuelto'
                   and i.categoria is not distinct from b.categoria and i.zona_id is not distinct from b.zona_id)
   order by 9, b.created_at;
end;
$$;

-- Agrupa reportes en un incidente nuevo o existente. Cada reporte conserva su folio.
create or replace function public.agrupar_reportes(p_condominio uuid, p_tickets uuid[], p_incidente uuid, p_titulo text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  org uuid;
  inc uuid := p_incidente;
  quien text := coalesce(auth.jwt() ->> 'email', 'administradora');
  cat text;
  zona uuid;
begin
  select organizacion_id into org from public.condominios where id = p_condominio;
  if org is null or not public.es_miembro(org) then raise exception 'Sin permiso'; end if;
  if coalesce(array_length(p_tickets, 1), 0) = 0 then raise exception 'Elige los reportes'; end if;
  if exists (select 1 from public.tickets where id = any (p_tickets) and (condominio_id is distinct from p_condominio or sensible)) then
    raise exception 'Solo se agrupan reportes no privados de este condominio';
  end if;
  perform set_config('bk.actor', quien, true);
  if inc is null then
    select t.categoria, v.zona_id into cat, zona from public.tickets t left join public.viviendas v on v.id = t.vivienda_id where t.id = p_tickets[1];
    insert into public.incidentes (organizacion_id, condominio_id, zona_id, categoria, titulo)
    values (org, p_condominio, zona, cat,
            coalesce(nullif(left(trim(coalesce(p_titulo, '')), 120), ''), (select titulo from public.tickets where id = p_tickets[1])))
    returning id into inc;
  elsif not exists (select 1 from public.incidentes where id = inc and condominio_id = p_condominio) then
    raise exception 'Incidente no válido';
  end if;
  update public.tickets set incidente_id = inc where id = any (p_tickets);
  insert into public.ticket_historial (organizacion_id, ticket_id, actor, nota)
  select org, t.id, quien, 'Se agrupó con otros reportes del mismo problema. Recibirás el seguimiento general aquí.' from public.tickets t where t.id = any (p_tickets);
  return inc;
end;
$$;

create or replace function public.desagrupar_reporte(p_ticket uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare t public.tickets%rowtype;
begin
  select * into t from public.tickets where id = p_ticket;
  if not found or not public.es_miembro(t.organizacion_id) then raise exception 'Sin permiso'; end if;
  perform set_config('bk.actor', coalesce(auth.jwt() ->> 'email', 'administradora'), true);
  update public.tickets set incidente_id = null where id = p_ticket;
  insert into public.ticket_historial (organizacion_id, ticket_id, actor, nota)
  values (t.organizacion_id, t.id, coalesce(auth.jwt() ->> 'email', 'administradora'), 'Este reporte se atiende por separado.');
end;
$$;

-- Avance general: se copia al seguimiento de cada reporte (sin datos de otras viviendas). Devuelve las viviendas a avisar.
create or replace function public.publicar_avance_incidente(p_incidente uuid, p_nota text, p_estado text, p_responsable text, p_fecha date)
returns uuid[] language plpgsql security definer
set search_path = ''
as $$
declare
  i public.incidentes%rowtype;
  quien text := coalesce(auth.jwt() ->> 'email', 'administradora');
  estado_ticket public.estado_ticket;
  viviendas uuid[];
begin
  select * into i from public.incidentes where id = p_incidente for update;
  if not found or not public.es_miembro(i.organizacion_id) then raise exception 'Sin permiso'; end if;
  if p_estado not in ('abierto', 'en_proceso', 'resuelto') then raise exception 'Estado no válido'; end if;
  if length(trim(coalesce(p_nota, ''))) < 3 then raise exception 'Escribe el avance'; end if;
  perform set_config('bk.actor', quien, true);
  update public.incidentes set estado = p_estado, responsable = nullif(left(trim(coalesce(p_responsable, '')), 80), ''), fecha_compromiso = p_fecha,
         resolucion = case when p_estado = 'resuelto' then left(trim(p_nota), 500) else resolucion end,
         primer_aviso_at = coalesce(primer_aviso_at, now()), updated_at = now()
   where id = i.id;
  estado_ticket := case p_estado when 'resuelto' then 'resuelto' when 'en_proceso' then 'en_proceso' else 'reportado' end;
  update public.tickets set estado = estado_ticket, responsable = nullif(left(trim(coalesce(p_responsable, '')), 80), ''), fecha_compromiso = p_fecha,
         resolucion = case when p_estado = 'resuelto' then left(trim(p_nota), 500) else resolucion end,
         resuelto_at = case when p_estado = 'resuelto' then coalesce(resuelto_at, now()) end
   where incidente_id = i.id and estado <> 'cancelado';
  insert into public.ticket_historial (organizacion_id, ticket_id, actor, a_estado, nota)
  select i.organizacion_id, t.id, quien, estado_ticket::text, 'Avance general: ' || left(trim(p_nota), 500) from public.tickets t where t.incidente_id = i.id;
  select array_agg(distinct t.vivienda_id) into viviendas from public.tickets t where t.incidente_id = i.id and t.vivienda_id is not null;
  return coalesce(viviendas, '{}');
end;
$$;

-- Para el residente: si su reporte forma parte de un incidente (título, estado y cuántas viviendas; nunca cuáles).
create or replace function public.vecino_incidentes(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  return coalesce((select jsonb_object_agg(t.id, jsonb_build_object('titulo', i.titulo, 'estado', i.estado, 'responsable', i.responsable,
           'fecha_compromiso', i.fecha_compromiso, 'afectados', (select count(distinct x.vivienda_id) from public.tickets x where x.incidente_id = i.id)))
    from public.tickets t join public.incidentes i on i.id = t.incidente_id where t.residente_id = r.id), '{}');
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Turnos: recepción confirmada, aclaraciones e incidencias en la entrega
-- ─────────────────────────────────────────────────────────────
alter table public.turnos
  add column if not exists recepcion_at    timestamptz,
  add column if not exists recepcion_notas text;

create table public.aclaraciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  turno_id        uuid references public.turnos(id) on delete set null,
  guardia_id      uuid references public.guardias(id) on delete set null,
  vivienda_id     uuid references public.viviendas(id) on delete set null,
  motivo          text not null check (length(motivo) between 2 and 200),
  created_at      timestamptz not null default now()
);

create or replace function public.caseta_aclaracion(p_turno uuid, p_hash text, p_vivienda uuid, p_motivo text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  if p_vivienda is not null and not exists (select 1 from public.viviendas where id = p_vivienda and condominio_id = t.condominio_id) then
    raise exception 'Vivienda no válida';
  end if;
  insert into public.aclaraciones (organizacion_id, condominio_id, turno_id, guardia_id, vivienda_id, motivo)
  values (t.organizacion_id, t.condominio_id, t.id, t.guardia_id, p_vivienda, left(trim(coalesce(p_motivo, 'Llamada para aclarar una visita')), 200));
end;
$$;

create or replace function public.caseta_confirmar_recepcion(p_turno uuid, p_hash text, p_notas text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  update public.turnos set recepcion_at = coalesce(recepcion_at, now()), recepcion_notas = nullif(left(trim(coalesce(p_notas, '')), 1000), '')
   where id = t.id;
end;
$$;

-- Tiempo de llegada en registros manuales (cuando el guardia empezó a atender).
create or replace function public.caseta_llegada(p_turno uuid, p_hash text, p_acceso uuid, p_llegada timestamptz)
returns void language plpgsql security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  update public.accesos set llegada_at = p_llegada
   where id = p_acceso and condominio_id = t.condominio_id and llegada_at is null
     and p_llegada <= ocurrio_at and p_llegada > ocurrio_at - interval '2 hours';
end;
$$;

create or replace function public.entrega_turno(p_condominio uuid)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'dentro', coalesce((select jsonb_agg(x order by x.ocurrio_at) from (
        select a.id, a.visitante, a.placa, a.ocurrio_at, v.numero as vivienda, a.metodo, k.nombre as cajon from public.accesos a
          join public.viviendas v on v.id = a.vivienda_id left join public.cajones k on k.id = a.cajon_id
         where a.condominio_id = p_condominio and a.tipo = 'entrada' and a.ocurrio_at > now() - interval '24 hours'
           and a.visitante not like 'Residente · %'
           and not exists (select 1 from public.accesos s where s.entrada_id = a.id)) x), '[]'),
    'chats_pendientes', coalesce((select jsonb_agg(x order by x.ultimo_at) from (
        select ch.vivienda_id, v.numero as vivienda, ch.ultimo_at,
               (select m.texto from public.caseta_mensajes m where m.chat_id = ch.id order by m.created_at desc limit 1) as ultimo
          from public.caseta_chats ch join public.viviendas v on v.id = ch.vivienda_id
         where ch.condominio_id = p_condominio and ch.pendiente) x), '[]'),
    'paquetes', coalesce((select jsonb_agg(x order by x.recibido_at) from (
        select k.id, v.numero as vivienda, k.paqueteria, k.descripcion, k.recibido_at, k.avisado_at, k.ubicacion from public.paquetes k
          join public.viviendas v on v.id = k.vivienda_id
         where k.condominio_id = p_condominio and k.entregado_at is null) x), '[]'),
    'esperados', coalesce((select jsonb_agg(x order by x.desde) from (
        select p.id, p.folio, p.visitante, p.tipo_visita, v.numero as vivienda, p.desde, p.hasta, p.placa, p.acceso, p.trabajo,
               (select k.nombre from public.cajones k where k.id = p.cajon_id) as cajon,
               (select e.nombre from public.eventos e where e.id = p.evento_id) as evento
          from public.pases p join public.viviendas v on v.id = p.vivienda_id
         where p.condominio_id = p_condominio and p.estado = 'activo' and p.modalidad = 'unico' and p.usos = 0
           and p.desde < now() + interval '12 hours' and p.hasta > now()
         limit 200) x), '[]'),
    'incidencias', coalesce((select jsonb_agg(x order by x.created_at) from (
        select 'incidente' as tipo, i.titulo, i.estado, z.nombre as zona, i.created_at,
               (select count(*) from public.tickets t where t.incidente_id = i.id) as reportes
          from public.incidentes i left join public.zonas_condominio z on z.id = i.zona_id
         where i.condominio_id = p_condominio and i.estado <> 'resuelto'
        union all
        select 'reporte', '#' || t.folio || ' ' || t.titulo, t.estado::text, null, t.created_at, 1
          from public.tickets t
         where t.condominio_id = p_condominio and t.incidente_id is null and not t.sensible and t.estado not in ('resuelto', 'cancelado')
           and t.vivienda_id is null) x), '[]'),
    'manuales_pendientes', (select count(*) from public.accesos where condominio_id = p_condominio and revision = 'pendiente'),
    'turno_anterior', (select jsonb_build_object('guardia', g.nombre, 'inicio', t.inicio, 'fin', t.fin, 'notas', t.notas)
                         from public.turnos t join public.guardias g on g.id = t.guardia_id
                        where t.condominio_id = p_condominio and t.fin is not null order by t.fin desc limit 1)
  );
$$;

-- Estado de cajones para caseta.
create or replace function public.caseta_cajones(p_turno uuid, p_hash text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare t public.turnos%rowtype := public.turno_valido(p_turno, p_hash);
begin
  return jsonb_build_object(
    'cajones', coalesce((select jsonb_agg(jsonb_build_object('nombre', k.nombre,
        'ocupado_por', (select e.visitante || ' · ' || v.numero from public.accesos e join public.viviendas v on v.id = e.vivienda_id
                          where e.cajon_id = k.id and e.tipo = 'entrada' and e.ocurrio_at > now() - interval '24 hours'
                            and not exists (select 1 from public.accesos s where s.entrada_id = e.id) limit 1),
        'apartado_para', (select p.visitante || ' · ' || to_char(p.desde at time zone 'America/Mexico_City', 'HH24:MI') from public.pases p
                           where p.cajon_id = k.id and p.estado = 'activo' and p.usos = 0 and p.hasta > now() and p.desde < now() + interval '12 hours'
                           order by p.desde limit 1)) order by length(k.nombre), k.nombre)
        from public.cajones k where k.condominio_id = t.condominio_id and k.activo), '[]'),
    'recepcion_at', t.recepcion_at);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Indicadores del piloto
-- ─────────────────────────────────────────────────────────────
create or replace function public.calcular_indicadores(p_condominio uuid, p_desde timestamptz, p_hasta timestamptz)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  with acc as (select * from public.accesos where condominio_id = p_condominio and tipo = 'entrada' and ocurrio_at >= p_desde and ocurrio_at < p_hasta),
  acl as (select count(*) n from public.aclaraciones where condominio_id = p_condominio and created_at >= p_desde and created_at < p_hasta),
  paq as (select * from public.paquetes where condominio_id = p_condominio and recibido_at >= p_desde and recibido_at < p_hasta),
  tur as (select * from public.turnos where condominio_id = p_condominio and fin >= p_desde and fin < p_hasta and entrega is not null),
  tic as (select * from public.tickets where condominio_id = p_condominio and created_at >= p_desde and created_at < p_hasta)
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'accesos', (select count(*) from acc),
    'accesos_por_metodo', coalesce((select jsonb_object_agg(metodo, n) from (select metodo, count(*) n from acc group by metodo) x), '{}'),
    'aclaraciones', (select n from acl),
    'aclaraciones_por_100', (select case when (select count(*) from acc) > 0 then round(100.0 * (select n from acl) / (select count(*) from acc), 1) end),
    'mediana_validacion_seg', (select round(extract(epoch from percentile_cont(0.5) within group (order by ocurrio_at - llegada_at))) from acc where llegada_at is not null),
    'paquetes', (select count(*) from paq),
    'mediana_registro_paquete_seg', (select percentile_cont(0.5) within group (order by registro_segundos) from paq where registro_segundos is not null),
    'paquetes_pendientes_cambio_turno', (select coalesce(sum(jsonb_array_length(entrega -> 'paquetes')), 0) from tur),
    'cambios_turno', (select count(*) from tur),
    'cambios_turno_confirmados', (select count(*) from public.turnos where condominio_id = p_condominio and inicio >= p_desde and inicio < p_hasta and recepcion_at is not null),
    'reportes', (select count(*) from tic),
    'reportes_agrupados', (select count(*) from tic where incidente_id is not null),
    'incidentes', (select count(*) from public.incidentes where condominio_id = p_condominio and created_at >= p_desde and created_at < p_hasta),
    'mediana_primer_aviso_min', (select round(extract(epoch from percentile_cont(0.5) within group (order by primer_aviso_at - created_at)) / 60)
                                   from public.incidentes where condominio_id = p_condominio and created_at >= p_desde and created_at < p_hasta and primer_aviso_at is not null),
    'mediana_primer_aviso_reporte_min', (select round(extract(epoch from percentile_cont(0.5) within group (order by h.primera - t.created_at)) / 60)
        from tic t cross join lateral (select min(x.created_at) primera from public.ticket_historial x
                                        where x.ticket_id = t.id and x.actor not like 'residente:%' and x.nota is distinct from 'Reporte creado' and x.created_at > t.created_at) h
       where h.primera is not null)
  );
$$;

create or replace function public.indicadores_piloto(p_condominio uuid, p_desde timestamptz, p_hasta timestamptz)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare org uuid;
begin
  select organizacion_id into org from public.condominios where id = p_condominio;
  if org is null or not public.es_miembro(org) then raise exception 'Sin permiso'; end if;
  return jsonb_build_object('actual', public.calcular_indicadores(p_condominio, p_desde, p_hasta),
                            'anterior', public.calcular_indicadores(p_condominio, p_desde - (p_hasta - p_desde), p_desde));
end;
$$;

create or replace function public.comite_indicadores(p_token text, p_desde timestamptz, p_hasta timestamptz)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare c public.condominios%rowtype;
begin
  select * into c from public.condominios where comite_token = p_token;
  if not found then raise exception 'link_invalido'; end if;
  return jsonb_build_object('actual', public.calcular_indicadores(c.id, p_desde, p_hasta),
                            'anterior', public.calcular_indicadores(c.id, p_desde - (p_hasta - p_desde), p_desde));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Historial de equipos (QR en el elevador, la bomba o el portón)
-- ─────────────────────────────────────────────────────────────
create table public.equipos_condominio (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  nombre          text not null check (length(nombre) between 2 and 80),
  tipo            text not null default 'otro',
  ubicacion       text,
  marca           text,
  modelo          text,
  serie           text,
  instalado       date,
  garantia_hasta  date,
  proveedor_id    uuid references public.proveedores(id) on delete set null,
  notas           text,
  codigo          text not null unique default public.token_opaco(12),
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);
alter table public.tickets add column if not exists equipo_id uuid references public.equipos_condominio(id) on delete set null;
alter table public.gastos_condominio add column if not exists equipo_id uuid references public.equipos_condominio(id) on delete set null;

-- ─────────────────────────────────────────────────────────────
-- Obras con cuota: aprobado, recaudado y avance pagado
-- ─────────────────────────────────────────────────────────────
create table public.obras (
  id                   uuid primary key default gen_random_uuid(),
  organizacion_id      uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id        uuid not null references public.condominios(id) on delete cascade,
  nombre               text not null check (length(nombre) between 3 and 120),
  descripcion          text,
  presupuesto_centavos bigint not null check (presupuesto_centavos > 0),
  proveedor_id         uuid references public.proveedores(id) on delete set null,
  asamblea_id          uuid references public.asambleas(id) on delete set null,
  estado               text not null default 'aprobada' check (estado in ('aprobada', 'en_curso', 'terminada')),
  created_at           timestamptz not null default now()
);
create table public.etapas_obra (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  condominio_id   uuid not null references public.condominios(id) on delete cascade,
  obra_id         uuid not null references public.obras(id) on delete cascade,
  orden           integer not null default 0,
  nombre          text not null check (length(nombre) between 2 and 120),
  monto_centavos  bigint not null check (monto_centavos > 0),
  avance_pct      integer not null default 0 check (avance_pct between 0 and 100),
  gasto_id        uuid references public.gastos_condominio(id) on delete set null,   -- pago al proveedor
  created_at      timestamptz not null default now()
);
alter table public.cargos_condominio add column if not exists obra_id uuid references public.obras(id) on delete set null;

-- Cuánto de cada cargo está pagado, aplicando abonos (pagos y saldos a favor) a lo más antiguo primero.
create or replace function public.cargos_pagados(p_condominio uuid)
returns table (cargo_id uuid, vivienda_id uuid, obra_id uuid, monto bigint, pagado bigint)
language sql stable security definer
set search_path = ''
as $$
  with abonos as (
    select v.id vivienda_id,
           coalesce((select sum(p.monto_centavos) from public.pagos_condominio p where p.vivienda_id = v.id and p.estado = 'confirmado'), 0)
         + coalesce((select sum(-a.monto_centavos) from public.ajustes_saldo a where a.vivienda_id = v.id and a.monto_centavos < 0), 0) total
      from public.viviendas v where v.condominio_id = p_condominio),
  deudas as (
    select a.id, a.vivienda_id, null::uuid obra_id, a.monto_centavos monto, '1900-01-01'::date periodo, a.created_at
      from public.ajustes_saldo a where a.condominio_id = p_condominio and a.monto_centavos > 0
    union all
    select c.id, c.vivienda_id, c.obra_id, c.monto_centavos, c.periodo, c.created_at
      from public.cargos_condominio c where c.condominio_id = p_condominio),
  acum as (
    select d.*, coalesce(sum(d.monto) over (partition by d.vivienda_id order by d.periodo, d.created_at, d.id rows between unbounded preceding and 1 preceding), 0) antes
      from deudas d)
  select x.id, x.vivienda_id, x.obra_id, x.monto, least(x.monto, greatest(0, ab.total - x.antes))::bigint
    from acum x join abonos ab on ab.vivienda_id = x.vivienda_id;
$$;

create or replace function public.resumen_obras(p_condominio uuid)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nombre', o.nombre, 'descripcion', o.descripcion, 'estado', o.estado,
      'aprobado_centavos', o.presupuesto_centavos,
      'proveedor', (select pr.nombre from public.proveedores pr where pr.id = o.proveedor_id),
      'asamblea', (select a.titulo || ' · ' || to_char(a.fecha at time zone 'America/Mexico_City', 'DD/MM/YYYY') from public.asambleas a where a.id = o.asamblea_id),
      'cuota_cargada_centavos', (select coalesce(sum(c.monto_centavos), 0) from public.cargos_condominio c where c.obra_id = o.id),
      'recaudado_centavos', (select coalesce(sum(cp.pagado), 0) from public.cargos_pagados(o.condominio_id) cp where cp.obra_id = o.id),
      'pagado_proveedor_centavos', (select coalesce(sum(g.monto_centavos), 0) from public.etapas_obra e join public.gastos_condominio g on g.id = e.gasto_id where e.obra_id = o.id),
      'avance_pct', (select case when sum(e.monto_centavos) > 0 then round(sum(e.monto_centavos * e.avance_pct)::numeric / sum(e.monto_centavos)) else 0 end
                       from public.etapas_obra e where e.obra_id = o.id),
      'etapas', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'monto_centavos', e.monto_centavos, 'avance_pct', e.avance_pct,
                   'pagada', e.gasto_id is not null) order by e.orden, e.created_at), '[]') from public.etapas_obra e where e.obra_id = o.id)) order by o.created_at desc), '[]')
    from public.obras o where o.condominio_id = p_condominio;
$$;

create or replace function public.obras_condominio(p_condominio uuid)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare org uuid;
begin
  select organizacion_id into org from public.condominios where id = p_condominio;
  if org is null or not public.es_miembro(org) then raise exception 'Sin permiso'; end if;
  return public.resumen_obras(p_condominio);
end;
$$;

create or replace function public.vecino_obras(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare r public.residentes%rowtype := public.residente_por_token(p_token);
begin
  return public.resumen_obras(r.condominio_id);
end;
$$;

create or replace function public.comite_obras(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare c public.condominios%rowtype;
begin
  select * into c from public.condominios where comite_token = p_token;
  if not found then raise exception 'link_invalido'; end if;
  return public.resumen_obras(c.id);
end;
$$;

-- Cuota de la obra a todas las viviendas (o prorrateada por indiviso). No se duplica al repetir.
create or replace function public.cargar_cuota_obra(p_obra uuid, p_total_centavos bigint, p_periodo date, p_vence date, p_por_indiviso boolean)
returns integer language plpgsql security definer
set search_path = ''
as $$
declare
  o public.obras%rowtype;
  n integer;
  viviendas integer;
  suma_ind numeric;
begin
  select * into o from public.obras where id = p_obra;
  if not found or not public.es_miembro(o.organizacion_id) then raise exception 'Sin permiso'; end if;
  if coalesce(p_total_centavos, 0) <= 0 then raise exception 'Escribe el total a recaudar'; end if;
  select count(*), sum(indiviso) into viviendas, suma_ind from public.viviendas where condominio_id = o.condominio_id;
  if p_por_indiviso and coalesce(suma_ind, 0) = 0 then raise exception 'Carga primero el indiviso de las viviendas'; end if;
  perform set_config('bk.actor', coalesce(auth.jwt() ->> 'email', 'administradora'), true);
  insert into public.cargos_condominio (organizacion_id, condominio_id, vivienda_id, concepto, descripcion, periodo, monto_centavos, vence, creado_por, obra_id)
  select o.organizacion_id, o.condominio_id, v.id, 'extraordinaria', 'Obra: ' || o.nombre, date_trunc('month', p_periodo)::date,
         greatest(1, case when p_por_indiviso then round(p_total_centavos * coalesce(v.indiviso, 0) / suma_ind) else round(p_total_centavos::numeric / viviendas) end)::bigint,
         p_vence, auth.jwt() ->> 'email', o.id
    from public.viviendas v where v.condominio_id = o.condominio_id and (not p_por_indiviso or coalesce(v.indiviso, 0) > 0)
  on conflict (vivienda_id, concepto, periodo, descripcion) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Lista de espera con oferta por plazo e inventario de amenidades
-- ─────────────────────────────────────────────────────────────
alter table public.amenidades
  add column if not exists minutos_oferta integer not null default 120 check (minutos_oferta between 10 and 2880),
  add column if not exists inventario     text;
alter table public.reservas drop constraint if exists reservas_estado_check;
alter table public.reservas add constraint reservas_estado_check check (estado in ('confirmada', 'solicitada', 'espera', 'ofrecida', 'rechazada', 'cancelada'));
alter table public.reservas
  add column if not exists oferta_expira    timestamptz,
  add column if not exists inventario_nota  text;

-- Ofrece el lugar libre al primero en espera que quepa. Las ofertas vencidas pasan al siguiente. Devuelve las reservas ofrecidas.
create or replace function public.procesar_lista_espera(p_amenidad uuid)
returns uuid[] language plpgsql security definer
set search_path = ''
as $$
declare
  a public.amenidades%rowtype;
  e record;
  ofrecidas uuid[] := '{}';
begin
  select * into a from public.amenidades where id = p_amenidad for update;
  update public.reservas set estado = 'cancelada', nota = 'La oferta venció sin respuesta'
   where amenidad_id = a.id and estado = 'ofrecida' and oferta_expira < now();
  if a.modo <> 'turnos' then return ofrecidas; end if;
  for e in select * from public.reservas w where w.amenidad_id = a.id and w.estado = 'espera' and w.inicio > now() order by w.created_at loop
    if (select coalesce(sum(c.personas), 0) from public.reservas c where c.amenidad_id = a.id and c.estado in ('confirmada', 'ofrecida')
        and c.inicio < e.fin and c.fin > e.inicio) + e.personas <= a.capacidad then
      update public.reservas set estado = 'ofrecida', oferta_expira = least(e.inicio, now() + make_interval(mins => a.minutos_oferta)),
             nota = 'Se liberó un lugar: confírmalo antes de que venza la oferta' where id = e.id;
      ofrecidas := ofrecidas || e.id;
    end if;
  end loop;
  return ofrecidas;
end;
$$;

drop function if exists public.vecino_cancelar_reserva(text, uuid);
create function public.vecino_cancelar_reserva(p_token text, p_reserva uuid)
returns uuid[] language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  x public.reservas%rowtype;
begin
  select * into x from public.reservas where id = p_reserva and vivienda_id = r.vivienda_id and estado in ('confirmada', 'solicitada', 'espera', 'ofrecida');
  if not found then raise exception 'No encontramos esa reserva'; end if;
  if x.deposito_estado = 'cargado' then raise exception 'Esta reserva ya tiene cargos; pide a la administración que la cancele'; end if;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  update public.reservas set estado = 'cancelada' where id = x.id;
  return public.procesar_lista_espera(x.amenidad_id);
end;
$$;

create or replace function public.vecino_responder_oferta(p_token text, p_reserva uuid, p_aceptar boolean)
returns uuid[] language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  x public.reservas%rowtype;
begin
  select * into x from public.reservas where id = p_reserva and vivienda_id = r.vivienda_id for update;
  if not found or x.estado <> 'ofrecida' then raise exception 'Esta oferta ya no está disponible'; end if;
  perform set_config('bk.actor', 'residente: ' || r.nombre, true);
  if x.oferta_expira < now() then
    perform public.procesar_lista_espera(x.amenidad_id);
    raise exception 'La oferta venció';
  end if;
  if p_aceptar then
    update public.reservas set estado = 'confirmada', oferta_expira = null, nota = 'Confirmada desde la lista de espera' where id = x.id;
    return '{}';
  end if;
  update public.reservas set estado = 'cancelada', nota = 'Rechazó la oferta' where id = x.id;
  return public.procesar_lista_espera(x.amenidad_id);
end;
$$;

-- Al reservar, primero se vencen ofertas viejas. Las ofrecidas ocupan lugar.
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
  perform public.procesar_lista_espera(p_amenidad);
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
    if exists (select 1 from public.reservas x where x.amenidad_id = a.id and x.vivienda_id = r.vivienda_id and x.estado in ('confirmada', 'espera', 'ofrecida')
               and x.inicio < v_fin and x.fin > p_inicio) then
      raise exception 'Ya tienes una reserva en ese horario';
    end if;
    select coalesce(sum(x.personas), 0) into ocupado from public.reservas x
     where x.amenidad_id = a.id and x.estado in ('confirmada', 'ofrecida') and x.inicio < v_fin and x.fin > p_inicio;
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

-- Lo que ve el residente en Amenidades (volátil: primero vence ofertas viejas).
create or replace function public.vecino_amenidades(p_token text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  r public.residentes%rowtype := public.residente_por_token(p_token);
  a uuid;
begin
  for a in select id from public.amenidades where condominio_id = r.condominio_id and activo and modo = 'turnos' loop
    perform public.procesar_lista_espera(a);
  end loop;
  return jsonb_build_object(
    'amenidades', coalesce((select jsonb_agg(jsonb_build_object('id', am.id, 'nombre', am.nombre, 'tipo', am.tipo, 'descripcion', am.descripcion,
        'reglas', am.reglas, 'inventario', am.inventario, 'foto_path', am.foto_path, 'modo', am.modo, 'capacidad', am.capacidad, 'hora_abre', am.hora_abre,
        'hora_cierra', am.hora_cierra, 'duraciones', am.duraciones, 'renta_centavos', am.renta_centavos, 'deposito_centavos', am.deposito_centavos,
        'ocupacion', coalesce((select jsonb_agg(jsonb_build_object('inicio', x.inicio, 'fin', x.fin, 'personas', x.personas, 'estado', x.estado))
                               from public.reservas x where x.amenidad_id = am.id and x.estado in ('confirmada', 'solicitada', 'ofrecida')
                                and x.fin > now() and x.inicio < now() + interval '14 days'), '[]')) order by am.nombre)
        from public.amenidades am where am.condominio_id = r.condominio_id and am.activo), '[]'),
    'reservas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'amenidad', am.nombre, 'inicio', x.inicio, 'fin', x.fin,
        'personas', x.personas, 'estado', x.estado, 'renta_centavos', x.renta_centavos, 'deposito_centavos', x.deposito_centavos,
        'deposito_estado', x.deposito_estado, 'nota', x.nota, 'oferta_expira', x.oferta_expira) order by x.inicio desc)
        from public.reservas x join public.amenidades am on am.id = x.amenidad_id
       where x.vivienda_id = r.vivienda_id and x.fin > now() - interval '30 days'), '[]'),
    'mudanzas', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'tipo', m.tipo, 'inicio', m.inicio, 'fin', m.fin, 'empresa', m.empresa,
        'placa', m.placa, 'recursos', m.recursos, 'estado', m.estado, 'nota', m.nota,
        'pase_codigo', (select p.codigo from public.pases p where p.id = m.pase_id and p.estado = 'activo')) order by m.inicio desc)
        from public.mudanzas m where m.vivienda_id = r.vivienda_id and m.fin > now() - interval '30 days'), '[]'));
end;
$$;

-- Cierre de depósito con nota de inventario (qué se revisó al entregar el espacio).
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
         nota = coalesce(nullif(left(trim(coalesce(p_nota, '')), 300), ''), nota),
         inventario_nota = coalesce(nullif(left(trim(coalesce(p_nota, '')), 300), ''), inventario_nota)
   where id = x.id;
end;
$$;

-- Portal del residente: los pases de fiesta se ven en "Fiestas"; paquetes con ubicación.
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
          from public.pases p where p.vivienda_id = v.id and p.evento_id is null and (p.hasta > now() - interval '7 days')
         order by p.created_at desc limit 30) x), '[]'),
    'accesos', coalesce((select jsonb_agg(x order by x.ocurrio_at desc) from (
        select a.tipo, a.visitante, a.metodo, a.ocurrio_at from public.accesos a
         where a.vivienda_id = v.id order by a.ocurrio_at desc limit 20) x), '[]'),
    'paquetes', coalesce((select jsonb_agg(x order by x.recibido_at desc) from (
        select k.id, k.paqueteria, k.descripcion, k.recibido_at, k.entregado_a, k.entregado_at, k.ubicacion, k.entrega_metodo from public.paquetes k
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

-- ─────────────────────────────────────────────────────────────
-- Seguridad de tablas nuevas
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['reglas_acceso', 'cajones', 'eventos', 'autorizaciones_recogida', 'incidentes', 'aclaraciones', 'equipos_condominio', 'obras', 'etapas_obra']
  loop
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

do $$
declare f text;
begin
  foreach f in array array[
    'pases_antes_de_insertar()', 'asignar_cajon(uuid, timestamptz, timestamptz)', 'vecino_crear_pase_ctx(text, jsonb)',
    'vecino_crear_evento(text, text, timestamptz, timestamptz, text[], integer, text)', 'agregar_invitados(uuid, text[], integer)',
    'vecino_agregar_invitados(text, uuid, text[])', 'vecino_cancelar_evento(text, uuid)', 'vecino_eventos(text)', 'pase_publico(text)',
    'caseta_paquete_detalle(uuid, text, uuid, text, text, integer)', 'caseta_evidencia_entrega(uuid, text, uuid, text)',
    'vecino_autorizar_recogida(text, uuid, text, integer)', 'vecino_revocar_recogida(text, uuid)', 'recogida_publica(text)',
    'caseta_entregar_tercero(uuid, text, text)', 'vecino_recogidas(text)', 'vecino_incidentes(text)', 'caseta_aclaracion(uuid, text, uuid, text)',
    'caseta_confirmar_recepcion(uuid, text, text)', 'caseta_llegada(uuid, text, uuid, timestamptz)', 'caseta_cajones(uuid, text)',
    'calcular_indicadores(uuid, timestamptz, timestamptz)', 'comite_indicadores(text, timestamptz, timestamptz)', 'cargos_pagados(uuid)',
    'resumen_obras(uuid)', 'vecino_obras(text)', 'comite_obras(text)', 'procesar_lista_espera(uuid)', 'vecino_cancelar_reserva(text, uuid)',
    'vecino_responder_oferta(text, uuid, boolean)', 'vecino_reservar(text, uuid, timestamptz, integer, integer)', 'vecino_amenidades(text)',
    'registrar_entrada_pase(uuid, text, uuid, text, timestamptz)', 'entrega_turno(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['sugerencias_incidentes(uuid)', 'agrupar_reportes(uuid, uuid[], uuid, text)', 'desagrupar_reporte(uuid)',
    'publicar_avance_incidente(uuid, text, text, text, date)', 'indicadores_piloto(uuid, timestamptz, timestamptz)', 'obras_condominio(uuid)',
    'cargar_cuota_obra(uuid, bigint, date, date, boolean)', 'decidir_mudanza(uuid, boolean, text)', 'cerrar_deposito(uuid, boolean, text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end;
$$;
-- El disparador del folio corre con los permisos de quien inserta pases (también desde la administración).
grant execute on function public.pases_antes_de_insertar() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Datos de ejemplo de "la prueba del sábado"
-- Fiesta de 20 invitados y una mudanza el mismo día, un paquete pendiente al cambio de turno y tres avisos de
-- falta de agua en la misma torre/calle (sin agrupar, para agruparlos en la demo). Más reglas, cajones, equipos y una obra.
-- ─────────────────────────────────────────────────────────────
create or replace function public.demo_condominios_piloto(p_org uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  c record;
  z uuid;
  r record;
  e uuid;
  o uuid;
  sabado timestamptz;
  i int;
  g uuid;
  invitados text[] := array['Andrea Gómez', 'Bruno Castillo', 'Carla Rivas', 'Daniel Ortiz', 'Elena Vega', 'Fabián Mora', 'Gabriela Soto',
                            'Héctor Ruiz', 'Irene Campos', 'Javier León', 'Karla Peña', 'Luis Navarro', 'Mónica Ibarra', 'Nicolás Paredes',
                            'Olivia Fuentes', 'Pedro Salas', 'Quetzalli Rangel', 'Rodrigo Aguilar', 'Sara Medina', 'Tomás Delgado'];
begin
  if not public.es_admin(p_org) then raise exception 'Sin permiso'; end if;
  perform set_config('bk.actor', 'datos de ejemplo', true);
  perform set_config('bk.sin_reglas', 'si', true);
  -- Próximo sábado a las 18:00 (hora de Querétaro).
  sabado := ((date_trunc('week', (now() at time zone 'America/Mexico_City')) + interval '5 days 18 hours') at time zone 'America/Mexico_City');
  if sabado < now() then sabado := sabado + interval '7 days'; end if;

  for c in select id, propiedad_id from public.condominios where organizacion_id = p_org and nombre like '%(ejemplo)' loop
    insert into public.reglas_acceso (organizacion_id, condominio_id, motivo, max_horas, hora_desde, hora_hasta, acceso, instrucciones, max_invitados, max_cajones) values
      (p_org, c.id, 'visita', 24, null, null, 'Entrada principal', 'Muestra tu QR en caseta. Respeta 20 km/h.', null, 1),
      (p_org, c.id, 'fiesta', 10, '12:00', '22:00', 'Entrada principal', 'Muestra tu QR personal. Estaciónate solo en el cajón asignado o fuera de la privada. Música hasta las 23:00.', 30, 6),
      (p_org, c.id, 'mudanza', 12, '08:00', '18:00', 'Acceso de servicio', 'Entra por el acceso de servicio. Protege muros y elevador. Máximo un camión.', null, 0),
      (p_org, c.id, 'servicio', 10, '07:00', '19:00', 'Acceso de servicio', 'Presenta identificación oficial. Solo el trabajo autorizado.', null, 1)
    on conflict (condominio_id, motivo) do nothing;
    for i in 1 .. 10 loop
      insert into public.cajones (organizacion_id, condominio_id, nombre) values (p_org, c.id, 'V-' || i) on conflict do nothing;
    end loop;
    -- Fiesta de 20 invitados con 4 cajones
    select rr.id, rr.vivienda_id, rr.token into r from public.residentes rr where rr.condominio_id = c.id and rr.tipo = 'propietario' order by rr.created_at limit 1;
    insert into public.eventos (organizacion_id, condominio_id, vivienda_id, residente_id, nombre, inicio, fin, instrucciones)
    values (p_org, c.id, r.vivienda_id, r.id, 'Cumpleaños (ejemplo)', sabado, sabado + interval '5 hours',
            'Muestra tu QR personal. Estaciónate en tu cajón asignado o fuera de la privada.')
    returning id into e;
    perform public.agregar_invitados(e, invitados, 4);
    -- Mudanza el mismo sábado por la mañana (aprobada con su pase)
    select rr.id, rr.vivienda_id into r from public.residentes rr where rr.condominio_id = c.id order by rr.created_at offset 1 limit 1;
    insert into public.mudanzas (organizacion_id, condominio_id, vivienda_id, residente_id, tipo, inicio, fin, empresa, placa, recursos, estado, revisado_por, revisado_at)
    values (p_org, c.id, r.vivienda_id, r.id, 'entrada', sabado - interval '9 hours', sabado - interval '6 hours', 'Mudanzas del Centro (ejemplo)', 'MDZ-123',
            array['zona_carga', 'elevador'], 'aprobada', 'datos de ejemplo', now());
    insert into public.pases (organizacion_id, condominio_id, vivienda_id, residente_id, visitante, tipo_visita, modalidad, desde, hasta, placa, servicio, recursos, instrucciones)
    values (p_org, c.id, r.vivienda_id, r.id, 'Mudanzas del Centro (ejemplo)', 'mudanza', 'recurrente', sabado - interval '9 hours 30 minutes', sabado - interval '5 hours',
            'MDZ-123', 'Mudanza (entrada)', array['zona_carga', 'elevador'], 'Entra por el acceso de servicio. Zona de carga y elevador de servicio apartados.');
    update public.mudanzas set pase_id = (select id from public.pases where condominio_id = c.id and tipo_visita = 'mudanza' order by created_at desc limit 1)
     where condominio_id = c.id and empresa = 'Mudanzas del Centro (ejemplo)';
    -- Servicio con trabajo autorizado
    insert into public.pases (organizacion_id, condominio_id, vivienda_id, residente_id, visitante, tipo_visita, modalidad, desde, hasta, max_usos, trabajo)
    values (p_org, c.id, r.vivienda_id, r.id, 'Técnico de internet (ejemplo)', 'servicio', 'unico', now(), now() + interval '8 hours', 1,
            'Instalación de módem en sala. Equipo: módem y cable. Orden de trabajo #OT-5521.');
    -- Turno anterior cerrado con un paquete pendiente
    select gg.id into g from public.guardias gg where gg.condominio_id = c.id order by gg.nombre desc limit 1;
    insert into public.paquetes (organizacion_id, condominio_id, vivienda_id, paqueteria, descripcion, ubicacion, recibio_id, registro_segundos)
    values (p_org, c.id, r.vivienda_id, 'DHL', 'Caja grande (ejemplo)', 'Anaquel B', g, 42);
    insert into public.turnos (organizacion_id, condominio_id, guardia_id, inicio, fin, notas, entrega)
    values (p_org, c.id, g, now() - interval '20 hours', now() - interval '8 hours', 'Quedó un paquete de DHL en el anaquel B.',
            public.entrega_turno(c.id));
    -- Tres avisos de falta de agua en la misma zona (sin agrupar todavía)
    select v.zona_id into z from public.viviendas v where v.condominio_id = c.id and v.zona_id is not null order by v.numero limit 1;
    for r in select rr.id, rr.vivienda_id from public.residentes rr join public.viviendas v on v.id = rr.vivienda_id
              where rr.condominio_id = c.id and v.zona_id = z order by rr.created_at limit 3 loop
      insert into public.tickets (organizacion_id, propiedad_id, condominio_id, vivienda_id, residente_id, titulo, categoria, ubicacion, canal_origen)
      values (p_org, c.propiedad_id, c.id, r.vivienda_id, r.id, 'No hay agua', 'plomeria', 'Toda la casa', 'vecino');
    end loop;
    -- Equipos con historial
    insert into public.equipos_condominio (organizacion_id, condominio_id, nombre, tipo, ubicacion, marca, instalado, garantia_hasta) values
      (p_org, c.id, 'Bomba de agua principal', 'bomba', 'Cuarto de cisterna', 'Evans (ejemplo)', current_date - 900, current_date + 200),
      (p_org, c.id, 'Portón de acceso', 'porton', 'Entrada principal', 'Accesspro (ejemplo)', current_date - 400, current_date - 35),
      (p_org, c.id, 'Elevador de servicio', 'elevador', 'Torre / núcleo de servicio', 'Otis (ejemplo)', current_date - 1500, null);
    insert into public.gastos_condominio (organizacion_id, condominio_id, categoria, descripcion, monto_centavos, fecha, creado_por, equipo_id)
    select p_org, c.id, 'Mantenimiento', 'Cambio de sello mecánico (ejemplo)', 380000, current_date - 60, 'datos de ejemplo', q.id
      from public.equipos_condominio q where q.condominio_id = c.id and q.tipo = 'bomba';
    -- Obra con cuota extraordinaria
    insert into public.obras (organizacion_id, condominio_id, nombre, descripcion, presupuesto_centavos, estado)
    values (p_org, c.id, 'Impermeabilización de áreas comunes (ejemplo)', 'Aprobada en asamblea. Se paga en dos etapas.', 9600000, 'en_curso')
    returning id into o;
    insert into public.etapas_obra (organizacion_id, condominio_id, obra_id, orden, nombre, monto_centavos, avance_pct) values
      (p_org, c.id, o, 1, 'Anticipo y preparación', 4800000, 100),
      (p_org, c.id, o, 2, 'Aplicación y garantía', 4800000, 30);
  end loop;
end;
$$;
revoke execute on function public.demo_condominios_piloto(uuid) from public, anon;
grant execute on function public.demo_condominios_piloto(uuid) to authenticated;
