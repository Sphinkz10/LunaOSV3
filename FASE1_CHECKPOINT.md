# F1 — Checkpoint 2 (P1.13) · executado no ambiente Claude
## Estado por passo (Roadmap P1.x)
| Passo | Estado | Prova verificada |
|---|---|---|
| P1.1 tokens + AA | ✅ | tokens.css = Guia §3; WCAG calculado: text-muted 7.0–8.3:1; keyframes (pulse/livepulse) + reduced-motion |
| P1.2 preset Tailwind | ✅ | lê só vars; build verde |
| P1.3 Layout trocável | ✅ | slots+estratégia; 3 testes (breakpoints + override persistido) |
| P1.4 pré-paint | ✅ | script inline; persistência |
| P1.5/P1.6 base | ✅ | Button/Card/Input/Badge/Avatar/Skeleton/Toggle/EmptyState — tokens-only testado |
| P1.7 feedback | ✅ | **Toast: store central no core (zustand) + Toaster aria-live — testado**; Tooltip (Radix) |
| P1.8 overlays | ✅ | Modal/BottomSheet: trap+ESC+devolve foco — testado |
| P1.9 estrutura | ✅ | Tabs (Radix), Stepper, ProgressRing (SVG), ErrorBoundary |
| P1.10 dados | ◐ | SearchInput (debounce testado), DataTable (sort testado, paginação; virtualização→F5), KpiCard; **Chart adiado para F3** (1.º uso real, evita peso morto) |
| P1.11 domínio | ◐ | **DayCell 9 estados (testado: cor+ícone+texto)**, SwipeableCard (**⋮ testado**), BookingCard, **RestTimer/SessionClock sobre timestamps (lógica testada 3×)**, LiveButton, AllergyBanner, SecurityGauge, SourcePill, RpeSlider. Faltam: FormulaBuilder/LogRow/GroupSelector (→F4/F5, 1.º uso), CalendarGrid completo (→F3) |
| P1.12 a11y base | ◐ | focus-visible, reduced-motion, touch-min, roles/aria em tudo; axe formal + leitor de ecrã → fecho da F1 |
| P1.14 POC G1 | ◐ | /poc completa: 2 layouts por config + densidade + Modal/Sheet + KPIs + swipe + 9 estados + timers + gauge + toasts. **Pendente: validação visual humana 320/1440 + Chromatic (máquina)** |
## Verificações globais (exit codes explícitos)
turbo typecheck+build = 0 (5/5) · testes = 0 (**13/13**) · audit:tokens = 0 violações
## Incidentes apanhados pelo processo (e corrigidos)
1. Keyframes `luna-pulse` em falta (bug meu) → adicionados nos tokens com reduced-motion.
2. Fake timers a vazar entre testes → beforeEach/afterEach + fireEvent determinístico.
3. Warning act() no teste do shell → corrigido.
## Decisão de checkpoint
Núcleo da F1 provado. Restante da fase: componentes "1.º uso" (Chart/FormulaBuilder/CalendarGrid) ficam na fase que os usa — decisão alinhada com "mock morre na fase" e evita código morto. Próximo: fechar P1.12 (axe) e arrancar F2 (G-DB precisa do teu projeto Supabase → único ponto que exige ação tua).
