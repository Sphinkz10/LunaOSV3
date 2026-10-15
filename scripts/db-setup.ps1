# LUNA.OS — Aplica migrações + seeds + provas G-DB (espelha CI)
# Uso local (PostgreSQL 16): .\scripts\db-setup.ps1 -Host localhost -Port 5432 -User postgres -Password postgres
# Requer: psql no PATH

param(
  [string]$DbHost = "localhost",
  [int]$Port = 5432,
  [string]$User = "postgres",
  [string]$Password = "postgres",
  [string]$Database = "postgres"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$env:PGPASSWORD = $Password

function Invoke-Psql {
  param([string]$Sql)
  $Sql | psql -h $DbHost -p $Port -U $User -d $Database -v ON_ERROR_STOP=1
}

function Invoke-PsqlFile {
  param([string]$Path)
  psql -h $DbHost -p $Port -U $User -d $Database -v ON_ERROR_STOP=1 -f $Path
}

Write-Host "==> Stub auth (compatível com migrações Supabase)"
Invoke-Psql @"
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid
  language sql stable as `$`$ select nullif(current_setting('app.uid', true), '')::uuid `$`$;
do `$`$b`$`$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end `$`$b`$`$;
grant usage on schema auth to authenticated, anon;
"@

Write-Host "==> Migração 0001_luna_os.sql"
Invoke-PsqlFile "supabase/migrations/0001_luna_os.sql"

Write-Host "==> Utilizador CI/coach stub"
Invoke-Psql "insert into auth.users (id,email) values ('00000000-0000-0000-0000-00000000c0a0','coach@luna.os') on conflict (id) do nothing;"

Write-Host "==> Migração 0002_hardening.sql"
Invoke-PsqlFile "supabase/migrations/0002_hardening.sql"

Write-Host "==> Seeds"
Invoke-PsqlFile "supabase/seed_base.sql"
Invoke-PsqlFile "supabase/seed_extended.sql"

Write-Host "==> Provas G-DB (9 asserts)"
Invoke-PsqlFile "supabase/tests/gdb_asserts.sql"

Write-Host "✅ db-setup concluído com sucesso"
