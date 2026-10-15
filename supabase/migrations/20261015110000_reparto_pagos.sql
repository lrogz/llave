-- Black Key · Quién paga: "Otro" y "Compartido" por porcentajes (p. ej. 50% dueño, 50% inquilino)
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

alter type public.quien_paga add value if not exists 'otro';
alter type public.quien_paga add value if not exists 'compartido';

-- Reparto: {"dueno": 50, "inquilino": 50} (suma 100) y/o {"otro_nombre": "Junta de vecinos"}.
alter table public.tickets        add column if not exists reparto jsonb;
alter table public.servicios      add column if not exists reparto jsonb;
alter table public.mantenimientos add column if not exists reparto jsonb;
