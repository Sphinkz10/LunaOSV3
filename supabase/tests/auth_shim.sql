-- ============================================================
-- Shim do Supabase Auth para correr migrações e provas em PostgreSQL simples
-- (CI e scripts/db-setup). auth.uid() lê app.uid em vez do JWT.
-- ============================================================
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
do $b$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $b$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
