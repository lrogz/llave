-- Llave · folio de ticket por administradora (#1, #2, … para cada una) en vez de un contador global.
-- Cómo correrlo: Supabase › SQL Editor › pegar este archivo › Run (después del esquema inicial).

alter table public.tickets alter column folio drop identity if exists;
alter table public.tickets alter column folio drop not null;

create or replace function public.asignar_folio()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  -- Un candado por administradora evita folios repetidos si llegan dos reportes al mismo tiempo.
  perform pg_advisory_xact_lock(hashtextextended(new.organizacion_id::text, 0));
  select coalesce(max(t.folio), 0) + 1 into new.folio
  from public.tickets t
  where t.organizacion_id = new.organizacion_id;
  return new;
end;
$$;

drop trigger if exists tickets_folio on public.tickets;
create trigger tickets_folio before insert on public.tickets
  for each row execute function public.asignar_folio();

-- Renumera los tickets que ya existan, en orden de creación, dentro de cada administradora.
with orden as (
  select id, row_number() over (partition by organizacion_id order by created_at, id) as n
  from public.tickets
)
update public.tickets t set folio = o.n from orden o where o.id = t.id;

alter table public.tickets alter column folio set not null;
create unique index if not exists tickets_folio_org_idx on public.tickets (organizacion_id, folio);
