# Onboarding LUNA.OS
1. `corepack enable && pnpm install`
2. Copiar `.env.example` → `.env` e preencher Supabase (ver `docs/setup-supabase-cloud.md`)
3. `pnpm dev` (apps/coach em http://localhost:5173) · `/poc` para gate G1
4. `pnpm build` · `pnpm lint` · `pnpm test` · `pnpm audit:tokens`
5. DB local (requer psql): `pnpm db:setup` · DB cloud: `pnpm db:cloud`
6. Nativo (na tua máquina): `cd apps/coach && npx cap add android && npx cap add ios && pnpm build && npx cap sync`
7. Lê: LUNA_OS_Guia_Definitivo_React.md (§1 hierarquia, §3 tokens, §14 DoD) e o Roadmap Passo a Passo.
**Regra nº1:** zero hex/px/!important fora de packages/tokens — o lint e o CI falham.
