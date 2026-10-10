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
