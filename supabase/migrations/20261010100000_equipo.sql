-- Black Key · Equipo
-- Invitar a más personas (asistente, socia) a la misma administradora.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

-- Correo visible de cada miembro (para la lista del equipo)
alter table public.miembros add column if not exists email text;
update public.miembros m set email = u.email from auth.users u where u.id = m.user_id and m.email is null;

create or replace function public.crear_organizacion(nombre text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  nueva uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere sesión';
  end if;
  insert into public.organizaciones (nombre) values (crear_organizacion.nombre) returning id into nueva;
  insert into public.miembros (organizacion_id, user_id, rol, email)
  values (nueva, (select auth.uid()), 'propietario', (select auth.jwt() ->> 'email'));
  return nueva;
end;
$$;

create table public.invitaciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  email           text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  rol             public.rol_miembro not null default 'staff' check (rol <> 'propietario'),
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  creada_por      uuid default auth.uid(),
  aceptada_at     timestamptz,
  created_at      timestamptz not null default now()
);
create unique index invitaciones_pendiente_idx on public.invitaciones (organizacion_id, lower(email)) where aceptada_at is null;

alter table public.invitaciones enable row level security;
create policy "admins ven invitaciones" on public.invitaciones for select to authenticated using (public.es_admin(organizacion_id));
create policy "admins invitan" on public.invitaciones for insert to authenticated with check (public.es_admin(organizacion_id));
create policy "admins cancelan" on public.invitaciones for delete to authenticated using (public.es_admin(organizacion_id));

-- Acepta una invitación con la sesión actual. El correo debe coincidir con el invitado.
create or replace function public.aceptar_invitacion(t text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  correo text := lower((select auth.jwt() ->> 'email'));
  inv public.invitaciones%rowtype;
begin
  if uid is null then
    raise exception 'Entra con tu correo para aceptar la invitación';
  end if;

  select * into inv from public.invitaciones where token = t;
  if not found or inv.aceptada_at is not null then
    raise exception 'Esta invitación ya no es válida';
  end if;
  if correo is distinct from lower(inv.email) then
    raise exception 'Esta invitación es para %. Entra con ese correo.', inv.email;
  end if;

  if exists (select 1 from public.miembros where user_id = uid and organizacion_id = inv.organizacion_id) then
    update public.invitaciones set aceptada_at = now() where id = inv.id;
    return inv.organizacion_id;
  end if;
  if exists (select 1 from public.miembros where user_id = uid) then
    raise exception 'Tu correo ya tiene su propia cuenta de Black Key. Pide que te inviten con otro correo.';
  end if;

  insert into public.miembros (organizacion_id, user_id, rol, email) values (inv.organizacion_id, uid, inv.rol, correo);
  update public.invitaciones set aceptada_at = now() where id = inv.id;
  return inv.organizacion_id;
end;
$$;

revoke all on function public.aceptar_invitacion(text) from public, anon;
grant execute on function public.aceptar_invitacion(text) to authenticated;
