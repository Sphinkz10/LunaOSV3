# Setup Supabase Cloud (Gate G-DB) — checklist humano

Tempo estimado: **30–45 min**.

## 1. Criar projeto

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Região **EU** (recomendado para GDPR)
3. Guardar a **database password**

## 2. Ligar CLI

```powershell
npm i -g supabase
cd luna-os
supabase login
supabase link --project-ref <TEU_PROJECT_REF>
```

Ou usar o script: `.\scripts\supabase-cloud.ps1`

## 3. Aplicar migrações (nunca pelo SQL Editor manual para schema)

```powershell
supabase db push
```

Ficheiros aplicados:
- `supabase/migrations/0001_luna_os.sql`
- `supabase/migrations/0002_hardening.sql`

## 4. Criar utilizador coach

1. Dashboard → **Authentication** → **Users** → **Add user**
2. Email: `coach@luna.os` (ou o teu)
3. Copiar o **UUID** — o trigger cria `public.profiles` automaticamente

## 5. Seeds

No **SQL Editor** (corre como postgres, ignora RLS):

1. `supabase/seed_base.sql`
2. `supabase/seed_extended.sql`

## 6. Provas G-DB (opcional mas recomendado)

```powershell
# Com connection string do projeto:
$env:PGPASSWORD = "<db-password>"
psql "postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" -f supabase/tests/gdb_asserts.sql
```

## 7. Produção / G-DB

| Item | Onde |
|------|------|
| Backups + PITR | Settings → Database → Backups |
| 1 restore teste | Settings → Database → Restore |
| Connection pooler | Settings → Database → Connection pooling (Transaction mode) |
| statement_timeout | Settings → Database → ou via SQL `alter database postgres set statement_timeout = '30s';` |

## 8. Credenciais no repo

Copiar de Settings → API:

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

**Nunca** colocar `service_role` no cliente.
