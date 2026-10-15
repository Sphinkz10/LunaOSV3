# F0 — Relatório de execução
| Passo | Estado | Prova |
|---|---|---|
| P0.1 monorepo | ✅ | pnpm-workspace + turbo + 5 packages + 2 apps + supabase/ |
| P0.2 lint anti-hardcode | ✅ | regra `luna/no-hardcoded-visuals` falha com hex/!important; stylelint config; audit:tokens = 0 violações |
| P0.3 governança/docs | ✅ | CODEOWNERS, ADR-0001/2/3, onboarding |
| P0.4 app coach | ✅ | Vite+React+Router+Tailwind(preset dos tokens); build de produção verde |
| P0.5 Capacitor+PWA | ◐ | capacitor.config.ts + PWA gerada (sw.js); `cap add ios/android` na máquina com Xcode/Android Studio |
| P0.6 CI | ◐ | workflow com affected+secret-scan+audit; remote cache liga-se com token Vercel/Turbo |
| P0.7 Storybook+Chromatic | ◔ | adiado para arranque da F1 (instalação pesada; tokens/ui já preparados) |
| P0.8 spike timer | ◐ | protótipo timestamps pronto e documentado; medição exige device real |
| P0.9 spike offline | ◐ | decisões por entidade fechadas e documentadas; validação SQLite em device |
**GATE G0:** pronto para sign-off com 3 pendências de máquina/device (P0.5 add nativo, P0.7 instalação, P0.8/9 medições).
