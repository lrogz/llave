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
