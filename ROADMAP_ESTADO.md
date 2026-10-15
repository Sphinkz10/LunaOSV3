# 🌑 LUNA.OS — Estado do Roadmap (atualizado a cada entrega)
## ✅ FEITO E PROVADO (neste ambiente)
| Fase | Passos | Prova |
|---|---|---|
| F0 | P0.1–P0.4, P0.6◐, P0.8/9 (protótipo+desenho) | monorepo builda; lint anti-hardcode falha com hex (demonstrado); CI escrito; spike-timer testado 3× |
| F1 | P1.1–P1.12 núcleo, P1.13 | tokens=Guia §3; AA calculado (7.0–8.3:1); layout trocável (3 testes); Modal trap/ESC/foco; 14/14 testes ui; axe 0 critical/serious; audit:tokens=0 |
| F2 prep | **G-DB ensaiado ponta-a-ponta** (P2.1 ensaio, P2.3, P2.4, P2.5-equiv) | PG16 real: 0001+0002 aplicam limpo; **9/9 provas SQL** (RLS, EXCLUDE, auto-promoção, guarda, score, export, audit); seed estendido aplicado; job CI `db` |
| **F2 cloud (real)** | **db push + seeds no projeto do utilizador** | projeto `lzitwvmmlutmtemrqetp`: `supabase db push` (0001+0002) OK; seeds aplicados; user `coach@luna.os` criado |
| **F2 P2.8 auth** | login real + sessão | `bootstrapAuth` (onAuthStateChange + getSession) → `authStore`; `/login` com email/password; guarda `Protected` com splash |
| **F2 P2.9 obs** | Sentry/PostHog base | `initObservability` lazy (ativa só com `VITE_SENTRY_DSN`/`VITE_POSTHOG_KEY`); `captureEvent` |
| **F2 P2.11 dashboard** | dados reais | `/dashboard`: KPIs (hoje/pendentes/atletas) + marcações de hoje via `coachQuery` (coach_id explícito); nav real + logout; estados loading/empty/error |
| **F3 (em curso) Calendário** | 3 vistas + criar/confirmar/cancelar + atleta | `calendarService` no core (mês, marcadores, `computeDayStates`, `hasConflict` via RPC, `createBooking`, `setBookingStatus`, `fetchAthletesLite`); `/calendar` com **vistas Mês/Semana/Agenda** (Tabs), detalhe do dia, **modal nova marcação** (data/hora/duração/tipo/**atleta**) com deteção de conflito, **modal detalhe** com confirmar/cancelar |
| **F3 disponibilidade/férias** | marcar/remover dias | core `createDayMarker`/`deleteDayMarker` (+`id` em `DayMarker`); UI no dia selecionado: **Marcar dia** (folga/férias/feriado/indisponível/competição/viagem) com nota + **Remover marcador**; estado do dia reflete o marcador |
| **F3 lista de espera + auto-promoção** | gerir espera | core `fetchWaitlist`/`addToWaitlist`/`setWaitlistStatus`; aba **Lista de espera** (badge com nº em espera), **+ Adicionar** (atleta+horário+prioridade), **Remover**; trigger SQL promove o 1.º ao **cancelar** marcação (UI mostra **Promovido** após reload) |
| **F3 disponibilidade semanal** | horários recorrentes | core `fetchAvailability`/`createAvailabilitySlot`/`deleteAvailabilitySlot`; aba **Disponibilidade** (listar por dia, + adicionar, remover); vista **Dia** com blocos disponíveis |
| **F3 aulas c/ capacidade** | lotação | `createBooking` aceita `capacity` quando `type=class`; modal nova marcação mostra lotação; detalhe mostra lugares |
| **F3 Live — treino ao vivo** | sessão real série a série | core `api/live.ts` (`fetchLiveWorkouts`, `startLiveSession`, `recordLiveSet`, `finishLiveSession`, `fetchLastPerformance`, `computeSessionSummary` +2 testes); `/live` e `/live/:bookingId` fiéis à maquete Alpha4.8.1 (`.live-*` portado para `luna-proto.css` com tokens, 0 hex): pré-sessão (atleta + treino do Studio ou sessão livre, **retomar sessão em curso**), abas **Exercício / Lista / Resumo**, colunas Previsto / Real / Último treino (dados reais), **reps + kg + RPE** por série gravados logo na BD, **descanso** por timestamps (+30s, pausar, repor), pausa da sessão, adicionar exercício, nota por exercício, resumo (séries, volume, RPE médio) + nota/tags; finalizar fecha a sessão e marca a marcação como concluída; botão **Iniciar treino** no detalhe da marcação confirmada. Sem dados inventados (ajustes Data.OS, kcal, partilhar/PDF ficam para os módulos próprios). **Sign-off visual 320/768/1440 pendente (TU)** |
| **Referência HTML + responsivo** | guia futuro | HTML guardado em `docs/referencia/PROTOHTML_Fase5E1_1_Atletas_Grupos.html`; análise em `GUIA_HTML_RESPONSIVO.md` |
| **Viragem visual: fidelidade ao HTML** | porte do CSS real | decisão do utilizador: estilos **iguais** ao HTML, só wireframes/tamanhos mudam por responsividade. `apps/coach/src/luna-proto.css` porta fundo+fontes+`.topbar/.sidebar/.btn/.page-head/.chip/.badge`+todo o `.dash-*`; fontes Space Grotesk/Plus Jakarta no `index.html`; `Svg` com ícones reais; `CoachShell`=`.app>.topbar+.layout(.sidebar\|.main\|.board)`; **Dashboard** 100% `.dash-*` ligada a dados reais; placeholders "em construção" agora dentro do shell |
| **Navegação mobile (novo)** | bottom-nav + FAB | `MobileNav` (<960px): barra inferior por ícones **Início · Atletas · FAB · Studio · Definições**; FAB central abre menu radial **Novo atleta / Nova marcação / Iniciar treino**; marca (badge) clicável = **retorno visível** ao Início em todas as páginas |
| **F5 Atletas (phase3 HTML)** | vista principal + dados reais + responsivo | core `fetchAthletes`/`createAthlete`; `/athletes` espelha **phase3** do HTML: copy/estrutura/board/vistas guardadas (localStorage)/impact-grid/seleção múltipla; CSS phase3 + `@760/@1360/@1220`; truncagem; MobileNav + modal detalhe mobile; chips Forms/Docs desactivados (sem dados no core); **sign-off visual pendente (TU)** |
| **F5 Grupos — CONCLUÍDA** | lista + 360 + membros + atribuir | core `fetchGroupProfile`/`addGroupMembers`/`removeGroupMember`/`assignPlanToGroup`; `/groups` com stats clicáveis, filtros, seleção (checkbox nos cards), **+ Criar Grupo**, **Atribuir plano** (modal ProtoModal); `/groups/:id` **Grupo 360** com abas **Resumo / Membros / Atribuições** (dados reais), **+ Membros**, remover membro, **Atribuir plano** a todos; responsivo; modais consistentes |
| **F5 Atleta 360 (fiel + dados reais)** | dossier de consulta | core `fetchAthleteProfile` agrega **dados reais** (perfil + grupo + plano + alergias + documentos + métricas + marcações + atribuições); `/athletes/:id` com `.athlete360-head/.a360-tabs2/.athlete360-card` do HTML; abas **Principal / Saúde / Métricas / Sessões / Atribuições** ligadas à BD, com estados honestos onde ainda não há dados; **sem números inventados** (gráficos/readiness ficam para módulos próprios); botão "Abrir" na lista navega para o perfil; responsivo |
| **Modal partilhado (consistência)** | 1 sistema p/ toda a app | `ProtoModal` (portal + ESC + foco + scroll lock) com estilo/estrutura do HTML (`.modal-h/.modal-b/.modal-f`) e tamanhos padrão **sm/md/lg/wide**; classes `.proto-form/.field/.field-row` p/ inputs consistentes; **migrados**: Criar Atleta, Criar Grupo, Atribuir, **Calendário (5 modais)** |
| **F5 Atletas — Atribuir (real)** | atribuir plano | core `fetchPlans`/`assignPlanToAthletes` (insere `assignments` + atualiza `current_plan_id`); botão **+ Atribuir** (cabeçalho + board) abre modal: confirma seleção, escolhe **plano real** e atribui aos atletas selecionados |
| **F5 Atletas — CONCLUÍDA (extras)** | pesquisa avançada + ações por linha | **Mais filtros**; **ações por linha** phase3; **Alterar estado** real; modais `ProtoModal`; board completo (1 sel + multi sel); **sign-off visual 320/672/1440 pendente (TU)** |
## 🩹 Correção 2026-06-17 — anti-hardcode reposto (ADR-0004)
A "viragem visual" da F5 tinha introduzido **216 violações** ao ADR-0003 no `luna-proto.css`
(98 hex + 117 `!important` + `:root` duplicado) — o `audit:tokens` e o `lint` **falhariam**,
apesar de os docs dizerem "0/verde". Corrigido: `:root` do proto removido; **fonte única de hex
= `@luna/tokens/tokens.css`** (com ponte de nomes do protótipo + tints `--c-*`); proto usa só
`var(--…)` (**0 hex**); `!important` permitido **só** no `luna-proto.css` ([ADR-0004](docs/adr/ADR-0004-proto-css-fidelidade.md)).
Verificado: typecheck+build+lint+audit **verdes**. Plano de saldar a dívida dos 117 `!important`
em [ROADMAP_CONVERSAO_REACT.md](ROADMAP_CONVERSAO_REACT.md).

## 🔧 Verificação (este ambiente, Windows)
- `pnpm turbo typecheck build test lint` = **11/11 verde** (correr com `npx pnpm turbo …`; o turbo precisa do pnpm)
- `audit:tokens` = **0 violações** (reposto a 2026-06-17 — ver acima; via Git Bash; CI corre em Ubuntu)
- Correções de infra: `@luna/tokens` ganhou `typescript` devDep; `@luna/ui` ganhou `eslint`+parser; eslint ignora `__tests__`; Vite lê `.env` da raiz (`envDir`)
## 🔲 POR FAZER
| Bloqueio | Itens | Quem |
|---|---|---|
| **Validação visual** | confirmar `/login` → `/dashboard` com KPIs > 0 (depende dos seeds) | **TU** |
| **Gate G-DB cloud** | backups/PITR + 1 restore + pooler/statement_timeout no dashboard Supabase | **TU** |
| **Gate G1** | abrir `/poc` a 320/1440 e dar OK visual (testes auto ✅ em `pnpm validate:g1`) | **TU** |
| **Só na tua máquina** | Chromatic token · spikes timer/offline em device ([docs/spikes/device-measurement.md](docs/spikes/device-measurement.md)) | **TU** |
| Fechar **G2** | sign-off teu: dashboard com dados reais aceitável → avançar | **TU** |
| Fases seguintes | F3 Calendário → F4 Data.OS+Studio+Live → F5 360/Forms/Analytics → F6 Definições → F7 nativo → F8 → F9 lojas → F10 Atleta → F11 | eu (+gates teus) |
## F3 — Calendário (em curso)
| Feito | Por fazer (próximas entregas do agente) |
|---|---|
| Vistas **Mês/Semana/Agenda/Dia** com 9 estados reais; criar marcação (pendente) com conflito bloqueado; **seletor de atleta**; detalhe com confirmar/cancelar; navegação mês a mês; **marcadores de dia (folga/férias/feriado/…) CRUD**; **lista de espera + auto-promoção** na UI; **disponibilidade semanal recorrente**; **aulas com lotação**; **calendário 100% fiel ao HTML** (`.cal-root`: cabeçalho sky/cyan, abas Calendário/Disponibilidade/Lista de espera, nav mês + segmento de vistas + filtro de tipo, grelha com 9 estados/legenda, vistas semana/dia/agenda com `cal-evcard`); **5 modais em `ProtoModal`** (nova marcação, detalhe, marcar dia, lista de espera, horário semanal); responsivo por CSS | ~~Live~~ ✅ feito; modal dedicado de **conflito**; ligar lista de espera a `class_booking_id` concreto |

## Gates: G0 ◐ (cap nativo ✅; Chromatic/spikes pendentes) · G1 ◐ (auto ✅; sign-off visual pendente) · G-DB ◐ (schema cloud ✅; backups/pooler pendentes) · G2 ◐ (dashboard real ✅; sign-off pendente) · G3 🔲 (calendário em curso) · G4–G11 🔲
