-- Black Key · Anuncios de casas vacías
-- Cada propiedad puede tener un anuncio público (link /v/<token>) con fotos, características
-- y un botón "Me interesa" que deja al prospecto en la app.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter table public.propiedades
  add column if not exists recamaras smallint check (recamaras between 0 and 50),
  add column if not exists banos numeric(3,1) check (banos between 0 and 50),
  add column if not exists m2 numeric(8,2) check (m2 > 0),
  add column if not exists estacionamientos smallint check (estacionamientos between 0 and 50),
  add column if not exists amueblada boolean not null default false,
  add column if not exists mascotas boolean not null default false,
  add column if not exists descripcion_anuncio text,
  add column if not exists requisitos text,
  add column if not exists anuncio_whatsapp text,
  add column if not exists anuncio_publicado boolean not null default false,
  add column if not exists anuncio_token text unique default replace(gen_random_uuid()::text, '-', '');

update public.propiedades set anuncio_token = replace(gen_random_uuid()::text, '-', '') where anuncio_token is null;
alter table public.propiedades alter column anuncio_token set not null;

create table if not exists public.fotos_propiedad (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  storage_path    text not null,
  created_at      timestamptz not null default now()
);
create index if not exists fotos_propiedad_idx on public.fotos_propiedad (propiedad_id, created_at);

create table if not exists public.prospectos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  nombre          text not null check (length(nombre) between 1 and 120),
  telefono        text not null check (length(telefono) between 7 and 30),
  email           text,
  mensaje         text check (length(mensaje) <= 1000),
  mudanza         date,
  estado          text not null default 'nuevo' check (estado in ('nuevo', 'contactado', 'visita', 'descartado', 'rentado')),
  created_at      timestamptz not null default now()
);
create index if not exists prospectos_propiedad_idx on public.prospectos (propiedad_id, created_at desc);

alter table public.fotos_propiedad enable row level security;
create policy "miembros leen" on public.fotos_propiedad for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.fotos_propiedad for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros borran" on public.fotos_propiedad for delete to authenticated using (public.es_miembro(organizacion_id));

-- Los prospectos llegan desde el anuncio público (servidor con la llave de servicio); la administradora los ve y les da seguimiento.
alter table public.prospectos enable row level security;
create policy "miembros leen" on public.prospectos for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.prospectos for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.prospectos for delete to authenticated using (public.es_admin(organizacion_id));
