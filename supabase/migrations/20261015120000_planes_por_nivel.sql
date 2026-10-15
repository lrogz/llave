-- Black Key · Planes por nivel: un monto mensual que incluye hasta X propiedades (Inicial, Profesional, Agencia).
-- Gratis hasta 2 propiedades. Sustituye el cobro por propiedad y la prueba de 30 días.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter table public.organizaciones
  add column if not exists plan_nivel text check (plan_nivel in ('inicial', 'profesional', 'agencia'));

create or replace function public.proteger_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.plan is distinct from old.plan
    or new.plan_nivel is distinct from old.plan_nivel
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
