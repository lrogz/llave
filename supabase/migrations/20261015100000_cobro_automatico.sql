-- Black Key · Cobro automático de rentas con Stripe (cuenta de Stripe de cada administradora)
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

-- La cuenta de Stripe conectada de la administradora (el dinero de las rentas llega a ella, no a Black Key).
alter table public.organizaciones
  add column if not exists stripe_cuenta_id text unique,
  add column if not exists stripe_cuenta_lista boolean not null default false;

-- Pago automático por contrato: el inquilino guarda su tarjeta y la renta se cobra sola.
alter table public.contratos
  add column if not exists stripe_cliente_id text,
  add column if not exists stripe_metodo_id text,
  add column if not exists domiciliado boolean not null default false,
  add column if not exists tarjeta_texto text;   -- "Visa •••• 4242"

-- Rastro del cobro en Stripe para conciliar solo y no cobrar dos veces.
alter table public.cobros_renta
  add column if not exists stripe_pago_id text unique,
  add column if not exists intentos_cobro smallint not null default 0,
  add column if not exists ultimo_intento_at timestamptz,
  add column if not exists error_cobro text;
