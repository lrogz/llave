-- Black Key · Planes y suscripción
-- $110 MXN por propiedad al mes; gratis hasta 3 propiedades; 30 días de prueba sin límite.
-- Usa la columna `plan` que ya existe: 'inicio' (gratis / prueba) o 'pro' (suscripción activa).
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter table public.organizaciones
  add column if not exists prueba_hasta date not null default ((now() at time zone 'America/Mexico_City')::date + 30),
  add column if not exists suscripcion_estado text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists propiedades_cobradas integer;

-- Los datos de cobro solo los cambia el sistema (webhook de Stripe con la llave de servidor),
-- nunca una administradora desde la app.
create or replace function public.proteger_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.plan is distinct from old.plan
    or new.prueba_hasta is distinct from old.prueba_hasta
    or new.suscripcion_estado is distinct from old.suscripcion_estado
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.propiedades_cobradas is distinct from old.propiedades_cobradas
  ) then
    raise exception 'Los datos del plan solo se cambian desde el cobro';
  end if;
  return new;
end;
$$;

drop trigger if exists organizaciones_proteger_plan on public.organizaciones;
create trigger organizaciones_proteger_plan before update on public.organizaciones
  for each row execute function public.proteger_plan();
