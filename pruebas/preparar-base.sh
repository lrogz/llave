#!/bin/bash
# Crea una base de prueba con un imitador mínimo de Supabase y TODAS las migraciones.
# Uso: DATABASE_URL=postgres://postgres@localhost:5432/postgres ./pruebas/preparar-base.sh bk_pruebas
set -euo pipefail
BASE="${1:-bk_pruebas}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
psql "$DATABASE_URL" -q -c "drop database if exists $BASE with (force)" -c "create database $BASE"
URL="${DATABASE_URL%/*}/$BASE"
psql "$URL" -q -v ON_ERROR_STOP=1 -f "$RAIZ/pruebas/supabase-shim.sql"
for f in "$RAIZ"/supabase/migrations/*.sql; do psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f" > /dev/null; done
echo "Lista: $URL"
