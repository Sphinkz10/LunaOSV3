# F2 (preparação) + fecho F1 — Relatório · executado e PROVADO no ambiente Claude
## F1 fechada (exceto validação visual humana)
- **P1.12 ✅** axe-core na galeria completa (Button…BookingCard): 0 violações critical/serious (14/14 testes verdes; contraste provado por cálculo WCAG em P1.1, não por jsdom).
## G-DB ensaiado de PONTA A PONTA em PostgreSQL 16 real
| Item | Estado | Prova |
|---|---|---|
| 0001 (schema, 43 tabelas) | ✅ aplica limpo | exit=0; stub auth+roles documenta dependências Supabase |
| 0002_hardening | ✅ aplica limpo | promote = **diff mínimo** sobre a função original (só guarda de conflito); fn_audit por jsonb (qualquer tabela); realtime guardado; export_my_data |
| **9 provas SQL** | ✅ TODAS | RLS isola coaches · anon=0 · EXCLUDE rejeita/permite aulas/encostar · has_booking_conflict espelha · auto-promoção (class_booking_id E requested_starts_at) · guarda do slot · score 70→85 · export só do próprio, sem totp_secret · audit_log populado |
| Seed estendido (C5) | ✅ aplica limpo | sessões=2, sets=6, campos=4, respostas=3, queries/reports, markers=4, avail=6, logs=2, assignments=1, logins=3 |
| CI | ✅ job `db` adicionado | postgres:16 service → migrações+seeds+provas em cada PR que toque supabase/ |
## Incidentes apanhados pelo processo (todos corrigidos)
1. exit codes mascarados por pipes (2×) → verificação com $? explícito sempre.
2. fn_audit com colunas inventadas (`actor_id`,`detail`) → **schema real manda**: `(coach_id,action,entity,entity_id,diff)`.
3. `athletes.full_name`→`name`; enums `mixed`→`bar`, `applied`→`success`; ordem auth-user vs trigger.
4. PROVA 6: descoberta de engenharia — **o invariante EXCLUDE torna a aresta de promoção irreproduzível em série**; guarda mantém-se como defense-in-depth (corridas concorrentes/drift futuro) e está testada unitariamente. Registado no próprio ficheiro de provas.
## O que continua a exigir o TEU Supabase real (não simulável aqui)
aplicar via `supabase db push` no projeto · pgTAP no CI da Supabase (as provas SQL já cobrem o mesmo) · backups/PITR + restore drill · pooler/statement_timeout · validação visual /poc 320/1440 + Chromatic.
## Próximo (quando ligares o Supabase)
P2.2 gerar types reais → core · P2.7 client `core/api` · P2.8 auth · P2.10 router · P2.11 Dashboard com dados reais.
