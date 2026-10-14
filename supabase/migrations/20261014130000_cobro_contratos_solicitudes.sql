-- Black Key · Referencia de pago, contrato con firma electrónica, solicitudes de renta y póliza jurídica
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

-- 1) Referencia numérica por contrato (la pone el inquilino en su transferencia SPEI)
create sequence if not exists public.referencia_pago_seq start 1000001 maxvalue 9999999;
grant usage on sequence public.referencia_pago_seq to authenticated, service_role;
alter table public.contratos add column if not exists referencia text unique default (nextval('public.referencia_pago_seq'))::text;
update public.contratos set referencia = (nextval('public.referencia_pago_seq'))::text where referencia is null;

-- 2) Póliza jurídica / protección de renta del contrato (Morada Uno u otra)
alter table public.contratos
  add column if not exists poliza_proveedor text,
  add column if not exists poliza_numero text,
  add column if not exists poliza_vence date,
  add column if not exists poliza_costo numeric(12,2);

-- 3) Contrato de arrendamiento para firma electrónica
create table if not exists public.documentos_contrato (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  contrato_id     uuid not null references public.contratos(id) on delete cascade,
  contenido       text not null,
  hash            text,
  estado          text not null default 'borrador' check (estado in ('borrador', 'enviado', 'firmado')),
  enviado_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists documentos_contrato_idx on public.documentos_contrato (contrato_id);

create table if not exists public.firmas_contrato (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  documento_id    uuid not null references public.documentos_contrato(id) on delete cascade,
  rol             text not null check (rol in ('arrendador', 'arrendatario', 'fiador', 'administradora')),
  nombre          text not null,
  telefono        text,
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  firma_path      text,
  firmada_at      timestamptz,
  ip              text,
  dispositivo     text,
  created_at      timestamptz not null default now()
);
create index if not exists firmas_contrato_doc_idx on public.firmas_contrato (documento_id);

-- Con una firma puesta, el texto ya no cambia (ni desde la app ni con la llave de servicio).
create or replace function public.documento_contrato_bloqueado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.contenido is distinct from old.contenido or new.hash is distinct from old.hash)
     and exists (select 1 from public.firmas_contrato f where f.documento_id = old.id and f.firmada_at is not null) then
    raise exception 'El contrato ya tiene firmas; su texto no se puede cambiar';
  end if;
  return new;
end;
$$;
drop trigger if exists documentos_contrato_bloqueo on public.documentos_contrato;
create trigger documentos_contrato_bloqueo before update on public.documentos_contrato
  for each row execute function public.documento_contrato_bloqueado();

alter table public.documentos_contrato enable row level security;
create policy "miembros leen" on public.documentos_contrato for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.documentos_contrato for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.documentos_contrato for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.documentos_contrato for delete to authenticated using (public.es_admin(organizacion_id));

-- Las firmas se ponen desde el link público (servidor con llave de servicio); la administradora solo las crea y las ve.
alter table public.firmas_contrato enable row level security;
create policy "miembros leen" on public.firmas_contrato for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.firmas_contrato for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros borran sin firmar" on public.firmas_contrato for delete to authenticated using (public.es_miembro(organizacion_id) and firmada_at is null);

-- 4) Solicitud de renta del interesado (para investigación / póliza)
create table if not exists public.solicitudes_renta (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  prospecto_id    uuid references public.prospectos(id) on delete set null,
  inquilino_id    uuid references public.inquilinos(id) on delete set null,
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  nombre          text not null,
  telefono        text,
  email           text,
  datos           jsonb not null default '{}',
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'recibida', 'en_revision', 'aprobada', 'rechazada')),
  recibida_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists solicitudes_renta_prop_idx on public.solicitudes_renta (propiedad_id, created_at desc);

create table if not exists public.solicitud_archivos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  solicitud_id    uuid not null references public.solicitudes_renta(id) on delete cascade,
  tipo            text not null check (tipo in ('identificacion', 'ingresos', 'domicilio', 'otro')),
  nombre          text,
  storage_path    text not null,
  created_at      timestamptz not null default now()
);
create index if not exists solicitud_archivos_idx on public.solicitud_archivos (solicitud_id);

alter table public.solicitudes_renta enable row level security;
create policy "miembros leen" on public.solicitudes_renta for select to authenticated using (public.es_miembro(organizacion_id));
create policy "miembros crean" on public.solicitudes_renta for insert to authenticated with check (public.es_miembro(organizacion_id));
create policy "miembros editan" on public.solicitudes_renta for update to authenticated using (public.es_miembro(organizacion_id)) with check (public.es_miembro(organizacion_id));
create policy "admins borran" on public.solicitudes_renta for delete to authenticated using (public.es_admin(organizacion_id));
alter table public.solicitud_archivos enable row level security;
create policy "miembros leen" on public.solicitud_archivos for select to authenticated using (public.es_miembro(organizacion_id));
create policy "admins borran" on public.solicitud_archivos for delete to authenticated using (public.es_admin(organizacion_id));
