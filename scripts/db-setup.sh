#!/usr/bin/env bash
# LUNA.OS — Aplica migrações + seeds + provas G-DB (espelha CI)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PGPASSWORD="${PGPASSWORD:-postgres}"
HOST="${DB_HOST:-localhost}"
PORT="${DB_PORT:-5432}"
USER="${DB_USER:-postgres}"

psql -h "$HOST" -p "$PORT" -U "$USER" <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key, email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
do $b$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $b$;
grant usage on schema auth to authenticated, anon;
SQL

psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_luna_os.sql
psql -h "$HOST" -p "$PORT" -U "$USER" -c "insert into auth.users (id,email) values ('00000000-0000-0000-0000-00000000c0a0','coach@luna.os') on conflict (id) do nothing;"
psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_hardening.sql
psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1 -f supabase/seed_base.sql
psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1 -f supabase/seed_extended.sql
psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1 -f supabase/tests/gdb_asserts.sql
echo "✅ db-setup concluído com sucesso"
