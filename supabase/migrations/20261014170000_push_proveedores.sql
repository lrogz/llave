-- Black Key · Notificaciones push para proveedores (su portal /pro instalado como app)
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter table public.suscripciones_push
  alter column user_id drop not null,
  alter column organizacion_id drop not null,
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete cascade;
alter table public.suscripciones_push drop constraint if exists suscripcion_de_alguien;
alter table public.suscripciones_push add constraint suscripcion_de_alguien
  check ((user_id is not null and organizacion_id is not null) or proveedor_id is not null);
create index if not exists suscripciones_push_proveedor_idx on public.suscripciones_push (proveedor_id);
-- Las de proveedores no tienen user_id: nadie del equipo las ve (la política es user_id = auth.uid()).
