-- Black Key · Aumento de renta por inflación (INPC del INEGI)
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

-- 1) INPC mensual (base 2a quincena de julio 2018 = 100). Se actualiza solo desde la API del INEGI
--    si hay INEGI_TOKEN; estos valores iniciales son de referencia y se sobrescriben con los oficiales.
create table if not exists public.inpc (
  periodo    date primary key check (extract(day from periodo) = 1),
  valor      numeric(10,3) not null check (valor > 0),
  fuente     text not null default 'inegi',
  updated_at timestamptz not null default now()
);
alter table public.inpc enable row level security;
create policy "todos leen el inpc" on public.inpc for select to authenticated using (true);

insert into public.inpc (periodo, valor, fuente) values
  ('2024-01-01',133.555,'referencia'),('2024-02-01',133.681,'referencia'),('2024-03-01',134.065,'referencia'),
  ('2024-04-01',134.336,'referencia'),('2024-05-01',134.087,'referencia'),('2024-06-01',134.594,'referencia'),
  ('2024-07-01',136.003,'referencia'),('2024-08-01',136.013,'referencia'),('2024-09-01',136.080,'referencia'),
  ('2024-10-01',136.828,'referencia'),('2024-11-01',137.424,'referencia'),('2024-12-01',137.949,'referencia'),
  ('2025-01-01',138.343,'referencia'),('2025-02-01',138.726,'referencia'),('2025-03-01',139.161,'referencia'),
  ('2025-04-01',139.620,'referencia'),('2025-05-01',140.012,'referencia'),('2025-06-01',140.405,'referencia'),
  ('2025-07-01',140.780,'referencia'),('2025-08-01',140.867,'referencia'),('2025-09-01',141.197,'referencia'),
  ('2025-10-01',141.708,'referencia'),('2025-11-01',142.645,'referencia'),('2025-12-01',143.042,'referencia'),
  ('2026-01-01',143.588,'referencia'),('2026-02-01',144.307,'referencia'),('2026-03-01',145.544,'referencia'),
  ('2026-04-01',145.831,'referencia'),('2026-05-01',145.527,'referencia'),('2026-06-01',145.131,'referencia'),
  ('2026-07-01',145.169,'referencia'),('2026-08-01',145.462,'referencia'),('2026-09-01',146.075,'referencia')
on conflict (periodo) do nothing;

-- 2) Cómo sube la renta de cada contrato y la renta nueva que entra en una fecha futura.
alter table public.contratos
  add column if not exists ajuste_tipo text not null default 'inpc' check (ajuste_tipo in ('inpc', 'fijo', 'ninguno')),
  add column if not exists ajuste_pct numeric(5,2) not null default 0 check (ajuste_pct between 0 and 100),   -- fijo: % anual; inpc: puntos extra
  add column if not exists ajuste_tope numeric(5,2) check (ajuste_tope between 0 and 100),                   -- máximo % (opcional)
  add column if not exists renta_programada numeric(12,2) check (renta_programada > 0),
  add column if not exists renta_desde date;

-- 3) Historial de aumentos, con su link de aviso para el inquilino.
create table if not exists public.aumentos_renta (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references public.organizaciones(id) on delete cascade,
  contrato_id      uuid not null references public.contratos(id) on delete cascade,
  renta_anterior   numeric(12,2) not null,
  renta_nueva      numeric(12,2) not null,
  pct              numeric(6,3) not null,
  metodo           text not null check (metodo in ('inpc', 'fijo', 'manual')),
  inpc_inicial     numeric(10,3),
  inpc_final       numeric(10,3),
  periodo_inicial  date,
  periodo_final    date,
  desde            date not null,
  nuevo_fin        date,
  token            text not null unique default replace(gen_random_uuid()::text, '-', ''),
  avisado_at       timestamptz,
  visto_at         timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists aumentos_contrato_idx on public.aumentos_renta (contrato_id, created_at desc);
alter table public.aumentos_renta enable row level security;
create policy "miembros leen" on public.aumentos_renta for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.aumentos_renta for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.aumentos_renta for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));

-- 4) Los cobros usan la renta nueva desde su fecha: al llegar el mes, la renta programada pasa a ser la renta.
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
  -- Rentas ya generadas y sin pagar desde el mes en que entra la nueva toman el monto nuevo.
  update public.cobros_renta r
     set monto = c.renta_programada
    from public.contratos c
   where r.contrato_id = c.id and c.organizacion_id = org and c.renta_programada is not null and c.renta_desde <= fin_mes
     and r.estado = 'pendiente' and r.periodo >= date_trunc('month', c.renta_desde)::date;

  update public.contratos
     set renta = renta_programada, renta_programada = null, renta_desde = null
   where organizacion_id = org and renta_programada is not null and renta_desde <= fin_mes;

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
