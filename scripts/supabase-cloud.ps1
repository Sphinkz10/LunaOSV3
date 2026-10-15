# LUNA.OS — Push migrações para o projeto Supabase cloud (Gate G-DB)
# Pré-requisitos: npm i -g supabase (ou npx supabase), supabase login, supabase link
# Depois: criar utilizador em Auth → Add user (coach@luna.os) → correr seeds via SQL Editor ou db-setup remoto

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "==> supabase db push (migrações 0001 + 0002)"
npx --yes supabase db push

Write-Host ""
Write-Host "Próximos passos MANUAIS no dashboard Supabase:"
Write-Host "  1. Auth → Users → Add user: coach@luna.os (copiar UUID)"
Write-Host "  2. SQL Editor → correr supabase/seed_base.sql e seed_extended.sql"
Write-Host "     (ou garantir que existe perfil em public.profiles)"
Write-Host "  3. Settings → Database → Backups + PITR → ativar"
Write-Host "  4. Fazer 1 restore de teste"
Write-Host "  5. Settings → Database → Connection pooling → ativar pooler"
Write-Host "  6. Colar URL + anon key em .env (ver .env.example)"
Write-Host ""
Write-Host "Opcional: correr provas G-DB com psql remoto ou supabase db execute -f supabase/tests/gdb_asserts.sql"
