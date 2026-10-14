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
