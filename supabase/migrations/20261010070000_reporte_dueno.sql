-- Black Key · Reporte mensual al dueño
-- Un link por dueño y mes: renta cobrada, trabajos con fotos de antes y después, gastos y saldo.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

create table public.reportes_dueno (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  dueno_id        uuid not null references public.duenos(id) on delete cascade,
  periodo         date not null check (extract(day from periodo) = 1),
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  visto_at        timestamptz,
  created_at      timestamptz not null default now(),
  unique (dueno_id, periodo)
);
create index reportes_dueno_org_idx on public.reportes_dueno (organizacion_id, periodo);

alter table public.reportes_dueno enable row level security;
create policy "miembros leen" on public.reportes_dueno for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.reportes_dueno for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.reportes_dueno for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.reportes_dueno for delete to authenticated using (public.es_admin(organizacion_id));
