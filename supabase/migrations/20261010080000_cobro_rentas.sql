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
