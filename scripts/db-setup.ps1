# LUNA.OS — Aplica migrações + provas SQL + seeds de desenvolvimento (espelha o CI)
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

Write-Host "==> Shim do Supabase Auth"
Invoke-PsqlFile "supabase/tests/auth_shim.sql"

Get-ChildItem "supabase/migrations/*.sql" | Sort-Object Name | ForEach-Object {
  Write-Host "==> Migração $($_.Name)"
  Invoke-PsqlFile $_.FullName
}

Write-Host "==> Provas SQL (RLS, partilhas, papéis)"
Invoke-PsqlFile "supabase/tests/rls_asserts.sql"
Invoke-PsqlFile "supabase/tests/conta_asserts.sql"
Invoke-PsqlFile "supabase/tests/equipa_asserts.sql"
Invoke-PsqlFile "supabase/tests/dia_asserts.sql"
Invoke-PsqlFile "supabase/tests/app_asserts.sql"
Invoke-PsqlFile "supabase/tests/clientes_asserts.sql"
Invoke-PsqlFile "supabase/tests/ficha_asserts.sql"
Invoke-PsqlFile "supabase/tests/definicoes_asserts.sql"
Invoke-PsqlFile "supabase/tests/biblioteca_asserts.sql"
Invoke-PsqlFile "supabase/tests/treino_asserts.sql"
Invoke-PsqlFile "supabase/tests/treino2_asserts.sql"
Invoke-PsqlFile "supabase/tests/horario_asserts.sql"
Invoke-PsqlFile "supabase/tests/packs_asserts.sql"
Invoke-PsqlFile "supabase/tests/pt_asserts.sql"
Invoke-PsqlFile "supabase/tests/ao_vivo_asserts.sql"
Invoke-PsqlFile "supabase/tests/horario2_asserts.sql"
Invoke-PsqlFile "supabase/tests/metricas_asserts.sql"
Invoke-PsqlFile "supabase/tests/avaliacao_asserts.sql"
Invoke-PsqlFile "supabase/tests/grupos_asserts.sql"
Invoke-PsqlFile "supabase/tests/mensagens_asserts.sql"
Invoke-PsqlFile "supabase/tests/solo_asserts.sql"
Invoke-PsqlFile "supabase/tests/pagamentos_asserts.sql"

Write-Host "==> Seeds de desenvolvimento"
Invoke-PsqlFile "supabase/seed.sql"

Write-Host "✅ db-setup concluído com sucesso"
