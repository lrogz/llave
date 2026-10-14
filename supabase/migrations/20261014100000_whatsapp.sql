-- Black Key · WhatsApp automático
-- Los mensajes que llegan por WhatsApp se guardan en `mensajes` (Bandeja). Este índice evita
-- procesar dos veces el mismo mensaje cuando Meta reintenta el aviso.
--
-- Cómo correrlo: Supabase › SQL Editor › pegar todo este archivo › Run (después de los anteriores).

create unique index if not exists mensajes_externo_idx on public.mensajes (externo_id) where externo_id is not null;
