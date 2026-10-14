-- Black Key · Facturación CFDI 4.0 de rentas (timbrado con Facturapi)
-- Cada dueño factura su renta con su propio certificado (CSD); Black Key solo arma y manda la factura.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter table public.duenos
  add column if not exists rfc text,
  add column if not exists razon_social text,
  add column if not exists regimen_fiscal text,
  add column if not exists cp_fiscal text,
  add column if not exists facturacion_lista boolean not null default false,
  add column if not exists csd_vence date;

alter table public.inquilinos
  add column if not exists rfc text,
  add column if not exists razon_social text,
  add column if not exists regimen_fiscal text,
  add column if not exists cp_fiscal text,
  add column if not exists uso_cfdi text,
  add column if not exists factura_automatica boolean not null default false;

alter table public.propiedades add column if not exists cuenta_predial text;

-- Llaves del emisor en Facturapi: solo el servidor (llave de servicio) las lee. Sin políticas = nadie más.
create table if not exists public.facturacion_duenos (
  dueno_id         uuid primary key references public.duenos(id) on delete cascade,
  organizacion_id  uuid not null references public.organizaciones(id) on delete cascade,
  facturapi_org_id text not null,
  api_key          text,
  created_at       timestamptz not null default now()
);
alter table public.facturacion_duenos enable row level security;

create table if not exists public.facturas (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  cobro_id        uuid not null references public.cobros_renta(id) on delete cascade,
  dueno_id        uuid references public.duenos(id) on delete set null,
  facturapi_id    text not null,
  uuid            text,
  folio           text,
  total           numeric(12,2),
  estado          text not null default 'valida' check (estado in ('valida', 'cancelada')),
  cancelada_at    timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists facturas_cobro_valida_idx on public.facturas (cobro_id) where estado = 'valida';
create index if not exists facturas_org_idx on public.facturas (organizacion_id, created_at desc);
alter table public.facturas enable row level security;
create policy "miembros leen" on public.facturas for select to authenticated using (public.es_miembro(organizacion_id));
