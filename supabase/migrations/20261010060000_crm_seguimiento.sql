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
