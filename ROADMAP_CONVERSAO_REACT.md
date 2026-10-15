# 🌑 LUNA.OS — Roadmap da conversão para React fiel

> **Norte:** converter o protótipo HTML único
> (`fase4…STUDIO_FORMS_ANALYTICS_DATAOS_LIVE_CALENDARIO_DASHBOARD_SETTINGS.html`)
> numa app React modular, **fiel ao visual e aos fluxos**, com dados reais (Supabase),
> sem hardcode (ADR-0003/0004) e sem código morto.
> Atualizado: **2026-06-17**.

## Princípios (não negociáveis)
1. **Fidelidade** ao HTML: mesmo layout, mesma "forma de chegar às funções", mesmo `luna-proto.css`.
2. **Fonte única de hex** = `@luna/tokens` ([ADR-0004](docs/adr/ADR-0004-proto-css-fidelidade.md)). `audit:tokens` = 0.
3. **Dados reais ou estado honesto** — nada de números inventados.
4. **Um módulo por fase**; o mock morre na fase; sem peso morto.
5. Cada módulo só fecha com **typecheck+build+lint+test+audit verdes** + sign-off visual 320/768/1440.

---

## Mapa de módulos do HTML de origem (render* → estado)

| Módulo origem (render*) | Rota | Estado React |
|---|---|---|
| `renderDashboardView` / `renderDashBoard` | `/dashboard` | ✅ feito (dados reais) |
| `renderCalendarView` / `renderCalBoard` | `/calendar` | ◐ feito, falta **Live** ligado |
| `renderAthletesShell` / `renderAthlete360Page` / `renderQA` (pesquisa avançada 360) | `/athletes` | ✅ feito |
| `renderGroupsView` / `renderGroup360Page` / `renderGroupCompareView` | `/groups` | ◐ feito; falta **comparar grupos** |
| `renderLiveView` / `renderLiveBoard` / `renderSet` | `/live` | 🔲 stub `<Soon>` |
| `renderStudioView` / `renderStudioBoard` / `renderFB` (formula builder) | `/studio` | 🔲 stub |
| `renderDataosView` / `renderData` | `/dataos` | 🔲 stub |
| `renderFormsView` / `renderFormsBoard` | `/forms` | 🔲 stub |
| `renderAnalyticsView` / `renderAnBoard` | `/analytics` | 🔲 stub |
| **Saúde** (suite — 539 refs; tab Saúde do Atleta 360 + agregados) | dentro de 360 + `/dataos` | ◐ parcial (tab Saúde existe) |
| `renderSettingsView` | `/settings` | 🔲 stub |

---

## ✅ Fase 0 — Reposição da governança (FEITA 2026-06-17)
- [x] Colapsar paleta: `:root` do `luna-proto.css` removido → **fonte única em `tokens.css`** (ponte de nomes + tints `--c-*`).
- [x] `luna-proto.css` → **0 hex** (98 substituídos por `var(--…)`); `#fff` do `Athlete360.tsx` tokenizado.
- [x] `audit:tokens` reescrito: hex=0 em todo o lado; `!important` só no proto ([ADR-0004](docs/adr/ADR-0004-proto-css-fidelidade.md)).
- [x] Verificado: **typecheck + build + lint + audit verdes**.

## 🔜 Fase 0.1 — Convergência `@luna/ui` ↔ proto (decisão + arrumação)
**Problema:** o design system testado (`@luna/ui`: Modal/ResponsiveShell/LayoutContext/primitivas, 14/14 + axe)
está **órfão** — as páginas reais usam `luna-proto.css` + `ProtoModal/ProtoDrawer/CoachShell`.
**Decisão (caminho "React fiel"):** o proto-CSS é a camada visual; `@luna/ui` fica como **biblioteca de
comportamento/a11y** (focus-trap, ESC, aria), **estilizada pelas classes do proto**.
- [ ] `ProtoModal` passa a embrulhar o `Modal` de `@luna/ui` (trap/ESC/foco testados) com classes `.modal-*`.
- [ ] `CoachShell` reusa `ResponsiveShell`/`LayoutContext` (slots) em vez de re-implementar ESC/scroll-lock à mão.
- [ ] Retirar **código morto**: `Hello.tsx` + rota `/hello`; rever exports de `@luna/ui` sem uso real.
- [ ] Code-split do bundle (build avisa: chunk 748 kB) — `React.lazy` por rota de módulo.
- [ ] Saldar `!important`: cada bloco refatorado para componente perde os seus `!important`.

---

## 🟢 Fase 3 (fechar) — Calendário + **Live**
> Live é o último item da F3 e desbloqueia o fluxo "Iniciar treino" do FAB.
- [ ] `/live/:bookingId` — `renderLiveView/Board`: **timer** sobre timestamps (spike já provado), **registo de sets** (peso/reps/RPE — `renderSet`), descanso, anotações.
- [ ] Core: `liveService` (sessão, sets, RPE) + tabelas/seed; `LiveButton` (já em `@luna/ui`) ligado.
- [ ] Ligar **lista de espera ↔ `class_booking_id`** concreto; modal dedicado de **conflito**.
- [ ] **Comparar grupos** (`renderGroupCompareView`) — fecha o resto de Grupos.
- **Gate G3:** Calendário+Live fiéis, dados reais, 320/768/1440 OK.

## 🟣 Fase 4 — Data.OS + Studio
- [ ] **Studio** (`/studio`): biblioteca de Exercícios/Treinos/Planos/Aulas; **Formula Builder** (`renderFB`); board contextual. Core `studioService` (CRUD planos → liga ao "Atribuir" já existente).
- [ ] **Data.OS** (`/dataos`): métricas/leituras de dispositivo; alimenta os agregados de **Saúde** (readiness/sono) hoje em "estado honesto" no Atleta 360.
- **Gate G4:** Studio cria planos reais; Data.OS popula Saúde com dados reais (fim dos placeholders de gráficos).

## 🟠 Fase 5 (resto) — Forms + Analytics + Saúde-suite
- [ ] **Forms.OS** (`/forms`): construtor/lista de formulários, respostas; reativa chips "Forms/Docs" hoje desligados em Atletas.
- [ ] **Analytics.OS** (`/analytics`): `renderAnalyticsView/AnBoard` — relatórios reais a partir de Data.OS/Forms.
- [ ] **Saúde-suite**: consolidar a tab Saúde do Atleta 360 + agregados de grupo (alergias/documentos/readiness) com dados de Data.OS.
- **Gate G5:** Forms e Analytics fiéis e com dados reais; Saúde sem números fictícios.

## ⚙️ Fase 6 — Definições
- [ ] `/settings` (`renderSettingsView`): perfil, tema/densidade/acento (tokens já suportam `data-density`/`data-text-scale`/acento por módulo), notificações, conta.
- **Gate G6.**

## 📱 Fases 7+ — Nativo / lojas / app do Atleta
- Conforme roadmap imperial original (F7 nativo Capacitor, F8 hardening, F9 lojas, F10 app do Atleta, F11).

---

## Faixa transversal (a cada fase)
- **Responsivo**: validar 320 / 768 / 1440 (breakpoints do [GUIA_HTML_RESPONSIVO](docs/referencia/GUIA_HTML_RESPONSIVO.md)).
- **A11y**: axe 0 critical/serious; foco visível; `prefers-reduced-motion`.
- **Verdes**: `typecheck build test lint` + `audit:tokens=0` antes de fechar.
- **Honestidade dos docs**: o estado escrito = estado verificado (lição da correção 2026-06-17).

## Ordem recomendada
**0.1 convergência → 3 Live → 4 Studio/Data.OS → 5 Forms/Analytics/Saúde → 6 Definições.**
A convergência (0.1) primeiro evita propagar o padrão duplicado para os módulos novos.
