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
