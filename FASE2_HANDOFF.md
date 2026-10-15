# F2 — Handoff (ações humanas → agente)

**Data:** 2026-06-13  
**Estado:** `.env` ligado · schema cloud aplicado (`db push` + seeds) · **P2.8/P2.9/P2.11 implementados e a build/testes verdes**. Falta sign-off humano (KPIs visíveis, gates G-DB/G1/G2).

## O que foi preparado automaticamente

| Item | Ficheiro / comando |
|------|-------------------|
| Config Supabase | [supabase/config.toml](supabase/config.toml) |
| DB local (espelha CI) | `pnpm db:setup` → [scripts/db-setup.ps1](scripts/db-setup.ps1) |
| DB cloud push | `pnpm db:cloud` → [scripts/supabase-cloud.ps1](scripts/supabase-cloud.ps1) |
| Checklist cloud | [docs/setup-supabase-cloud.md](docs/setup-supabase-cloud.md) |
| `.env` template | [.env.example](.env.example) + [.env](.env) (preencher URL + anon key) |
| Client Supabase | [apps/coach/src/lib/supabase.ts](apps/coach/src/lib/supabase.ts) |
| Validação G1 auto | `pnpm validate:g1` → testes 320/1440 + axe na POC |
| Chromatic | [docs/chromatic-setup.md](docs/chromatic-setup.md) |
| Spikes device | [docs/spikes/device-measurement.md](docs/spikes/device-measurement.md) — preencher em device |
| Capacitor | `apps/coach/android/` + `ios/` adicionados |

## Já feito (agente + humano)

- `supabase db push` (0001+0002) no projeto `lzitwvmmlutmtemrqetp` ✅
- Seeds aplicados + user `coach@luna.os` criado ✅
- Vite a ler `.env` da raiz (`envDir`) ✅
- P2.8 login real, P2.9 observabilidade base, P2.11 dashboard com dados reais ✅
- `turbo typecheck build test` 8/8 · `lint` 3/3 · `audit:tokens` 0 ✅

## O que o humano ainda deve fazer

1. **Validar visualmente:** `npx pnpm dev` → `/login` (`coach@luna.os` + password) → `/dashboard`; confirmar KPIs (Hoje/Pendentes/Atletas) com valores dos seeds
2. **Se KPIs = 0:** reconfirmar seeds — `select count(*) from public.athletes;` no SQL Editor (deve dar ≥ 3)
3. **Gate G-DB cloud:** backups/PITR + 1 restore + pooler/statement_timeout no dashboard Supabase
4. **Gate G1:** abrir `/poc` a 320px e 1440px e dar OK visual
5. **Sign-off G2:** confirmar que o dashboard com dados reais é aceitável para avançar

## Próximo passo do agente (após sign-off)

- Arrancar **F3 — Calendário** (primeiro módulo "app de treinador": 5 vistas, conflitos, lista de espera)
