# LunaOS v3

A plataforma de quem treina pessoas: do PT independente ao ginásio. Este repositório é a base da v3 (decisão D19): o monorepo `luna-os-v3` com a base de dados refeita segundo `docs/11-modelo-de-dados.md` do pacote de especificação.

## Estrutura

| Pasta | O que é |
| --- | --- |
| `apps/coach` | Gestão (Vite, React, PWA, Capacitor): Hoje, Clientes, Grupos, Horário, Treino |
| `apps/athlete` | App do cliente (por construir nas tarefas seguintes) |
| `packages/core` | Acesso aos dados (Supabase tipado), sessão, organização ativa, fuso horário |
| `packages/ui`, `packages/tokens`, `packages/icons` | Design system |
| `packages/contracts` | Esquemas zod partilhados (modalidade, payloads das funções) |
| `packages/modalidades` | Configuração versionada das modalidades (fitness v1) |
| `supabase/migrations` | Esquema, regras de acesso e funções (PostgreSQL 15+) |
| `supabase/tests` | Provas SQL de RLS e regras, com casos negativos |
| `supabase/seed.sql` | Dados de desenvolvimento (nunca em produção) |

## Arrancar

```bash
npx pnpm@9.15.9 install
cp .env.example .env   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npx pnpm@9.15.9 dev
```

Sem `.env`, a app mostra um erro claro em vez de ficar a carregar.

Verificações (as mesmas do CI):

```bash
npx pnpm@9.15.9 turbo typecheck build test lint
npx pnpm@9.15.9 audit:tokens
npx pnpm@9.15.9 secret-scan
bash scripts/db-setup.sh     # precisa de PostgreSQL 16 e psql
```

## Modelo de dados

- **Pessoa** (`persons`): uma só conta por pessoa. Um cliente acrescentado pelo PT existe sem conta, gerido pela organização até a pessoa ter conta.
- **Organização**, **Unidade** (com fuso horário e salas), **Papel** e **Membro**: quem trabalha onde e com que permissões. Os papéis vivem só em `membership_roles`; ninguém edita os seus.
- **Ligação** (`links`) e **partilhas por categoria** (`link_shares`): a pessoa acompanhada por uma organização. Treino, medidas, fotos, check-ins e saúde só se leem com ligação ativa e a partilha ligada; revogar corta na leitura seguinte.
- **Modalidade** (`sports`, `org_sports`), **Subscrição**, **Direitos** (`entitlements`): o que cada organização usa decide-se pelos direitos do plano, nunca por `if plano == …`.
- Todas as tabelas de negócio têm `org_id`, RLS por organização e chaves compostas `(id, org_id)`, para nada se ligar entre organizações.

## Segurança (auditoria de 16 out, AUD-69 a 74)

- Conta nova não tem papel; só ganha um ao criar uma organização (`create_organization`) ou aceitar um convite (`accept_invite`).
- UPDATE limitado às colunas permitidas; nenhuma função `SECURITY DEFINER` confia num id sem verificar quem chama; `anon` não executa nada.
- Saúde só por `get_person_health`, que exige papel clínico e partilha, e regista cada leitura.
- `audit_log` só de acrescentar; tokens de integrações no Supabase Vault; convites guardados por hash.

## Supabase na cloud

1. Aplicar `supabase/migrations` por ordem numa base vazia (a v3 não migra a base antiga: ainda não há dados reais).
2. Authentication → Sign In / Providers → Email: **confirmação de email ligada**. O registo pode ficar aberto (o atleta usa a app de graça), porque uma conta nova não vê nada.
3. Enquanto a base antiga (`0001_luna_os.sql`) estiver alojada, manter o registo **desligado**: essa base ainda tem as falhas AUD-69 a 71.
4. Não correr `supabase/seed.sql` na cloud.

## Trabalho

Ordem das tarefas: `tasks/00-ordem.md` do pacote (o treinador primeiro, D17). Interface, commits e documentação em PT-PT; os nomes de papéis e coisas vêm do vocabulário da modalidade.
