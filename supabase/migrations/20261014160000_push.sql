-- Black Key · App instalable: notificaciones push en el celular o la compu de cada persona del equipo
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

create table if not exists public.suscripciones_push (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  dispositivo     text,
  created_at      timestamptz not null default now(),
  ultimo_envio    timestamptz
);
create index if not exists suscripciones_push_org_idx on public.suscripciones_push (organizacion_id);

-- Cada quien ve y borra solo las suyas; el alta y el envío los hace el servidor.
alter table public.suscripciones_push enable row level security;
create policy "ver las mias" on public.suscripciones_push for select to authenticated using (user_id = auth.uid());
create policy "borrar las mias" on public.suscripciones_push for delete to authenticated using (user_id = auth.uid());
