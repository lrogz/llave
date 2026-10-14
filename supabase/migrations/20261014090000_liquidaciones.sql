-- Black Key · Liquidación al dueño
-- Cada mes: renta cobrada − comisión − mantenimiento − cargos + abonos = lo que se le transfiere al dueño.
-- `movimientos_dueno`: cargos y abonos manuales (predial pagado por la administración, devolución, etc.).
-- `liquidaciones`: foto de cómo quedó el mes cuando se marca como transferido.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter table public.duenos
  add column if not exists banco text,
  add column if not exists clabe text check (clabe is null or clabe ~ '^[0-9]{18}$');

create table if not exists public.movimientos_dueno (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  dueno_id        uuid not null references public.duenos(id) on delete cascade,
  propiedad_id    uuid references public.propiedades(id) on delete set null,
  periodo         date not null check (extract(day from periodo) = 1),
  tipo            text not null check (tipo in ('cargo', 'abono')),
  concepto        text not null check (length(concepto) between 1 and 160),
  monto           numeric(12,2) not null check (monto > 0),
  created_at      timestamptz not null default now()
);
create index if not exists movimientos_dueno_idx on public.movimientos_dueno (dueno_id, periodo);

create table if not exists public.liquidaciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  dueno_id        uuid not null references public.duenos(id) on delete cascade,
  periodo         date not null check (extract(day from periodo) = 1),
  renta_cobrada   numeric(12,2) not null,
  comision        numeric(12,2) not null,
  mantenimiento   numeric(12,2) not null,
  cargos          numeric(12,2) not null,
  abonos          numeric(12,2) not null,
  total           numeric(12,2) not null,
  pagada_el       date not null,
  referencia      text,
  comprobante_path text,
  created_at      timestamptz not null default now(),
  unique (dueno_id, periodo)
);
create index if not exists liquidaciones_org_idx on public.liquidaciones (organizacion_id, periodo);

alter table public.movimientos_dueno enable row level security;
create policy "miembros leen" on public.movimientos_dueno for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.movimientos_dueno for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros borran" on public.movimientos_dueno for delete to authenticated using (public.es_miembro(organizacion_id));

alter table public.liquidaciones enable row level security;
create policy "miembros leen" on public.liquidaciones for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.liquidaciones for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.liquidaciones for delete to authenticated using (public.es_admin(organizacion_id));

