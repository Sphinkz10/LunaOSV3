# 🎨 LUNA.OS — Roadmap UX página-a-página (refactor "limpar sem apagar funções")

> Baseado no *Relatório de Refactorização UX/UI P0* (2026-06-21) + estado real do código.
> **Regra de ouro:** nenhuma função desaparece — se sai do cartão/linha, ganha novo destino
> (menu Mais · drawer · modal · board contextual · toolbar de seleção · 360 · danger zone).
> Complementa [ROADMAP_CONVERSAO_REACT.md](ROADMAP_CONVERSAO_REACT.md) (governança/build).
> Atualizado: **2026-06-22**.

## Método (por página, sempre igual)
1. **Inventário** "função antiga → novo destino" a partir do código real (este doc).
2. **Maquetes** (2–3 versões) → utilizador escolhe/adapta. *Nunca avançar às escuras.*
3. **Implementação** React com paridade + verdes (`typecheck build lint test` + `audit:tokens=0`).
4. **Sign-off** visual 320 / 768 / 1440 → página seguinte.

## Ordem das páginas
**1) Atletas → 2) Atleta 360 → 3) App Shell → 4) Grupos/Grupo 360 → 5) Calendário → 6) Dashboard → 7) Studio/Forms → 8) Analytics/Data.OS/Live/Settings.**

---

## Página 1 — Atletas  ·  estado: 🔨 em implementação (increment 1 ✅)

**Direção escolhida:** estrutura **C** (lista leve + board contextual + danger zone) · unidade
mobile = **cartão limpo A** · **vista-tabela B** como alternância de densidade opcional.
**Decisão danger zone:** Arquivar agora (soft-delete reversível) · Eliminar definitivo depois.

### Progresso
- [x] **Increment 1 — Arquivar (danger zone)** ✅ 2026-06-22 · verdes (typecheck/build/lint/audit)
  - core: `archiveAthlete`/`unarchiveAthlete` (sem migração — `archived_at`+enum `archived` já existiam; `fetchAthletes` já filtrava).
  - UI: board estados 1 e N ganharam **Zona de risco** (`.board-danger`) → `ConfirmArchiveModal` (confirmação reversível, 1 e em massa).
- [ ] **Increment 2 — reorganização visual**: menu "Mais" por linha/cartão (recolher ações secundárias), cartão limpo A em mobile, vista-tabela B opcional, polish responsivo 320/768/1440.
- [ ] **Increment 3 — restaurar arquivados**: vista/filtro "Arquivados" + `unarchiveAthlete` na UI.

### Contrato função → destino (do `Athletes.tsx` atual)

| Função atual (código) | Hoje | Novo destino (C+A) |
|---|---|---|
| Pesquisar (`search`) | toolbar | toolbar (mantém) |
| Ordenar (`sort` select) | toolbar | toolbar (mantém) |
| Pesquisa avançada / "Mais filtros" (`setAdvOpen`, ⚙) | toolbar + modal | toolbar → **modal "Mais filtros"** (mantém) |
| Limpar filtros | toolbar | toolbar (mantém) |
| Stats clicáveis (Total/Sem plano/Pendências/Bloqueios/RTP) | filtros rápidos | **chips de filtro** no topo (mantém) |
| Filter chips (`handleFilterChip`, incl. Forms/Docs/Pendentes desativados) | filter-row | chips; desativados ficam com tooltip "módulo próprio" (mantém) |
| Vistas guardadas (`saveView`/`applySavedView`) | toolbar + board | toolbar (Guardar vista) + chips de vistas (mantém) |
| **+ Atleta** (`setCreateOpen`) | topbar + page-head | **CTA primário** topo (mantém) → modal "Novo Atleta" |
| Atribuir conteúdo (`openAssign`) | page-head + board | board (1/N) + toolbar de seleção → modal "Atribuir" (mantém) |
| Checkbox seleção | linha | linha (mantém) |
| Abrir Atleta 360 (clicar linha / `onOpen360`) | linha + board + modal | **"Ver 360" CTA** na linha/cartão (mantém) |
| Ver detalhes (`setDetailAthlete`) | botão linha → modal | **board contextual** (1 selecionado) — substitui o modal em desktop; em mobile = drawer |
| Ações por linha (`handleRowAction`: Rever bloqueio / Atribuir plano / Abrir 360) | chip na linha | board contextual + **menu "Mais"** da linha |
| Alterar/Guardar estado | modal detalhe | board contextual → "Alterar estado" (mantém) |
| **Board 0 sel.** "Hoje exige atenção" (Ver sem plano/bloqueios/forms; Guardar vista; Abrir vista) | board | board estado-0 (mantém) |
| **Board 1 sel.** (Abrir 360, Atribuir, Pedir documento, Enviar form, Atribuir coach, Criar tarefa, Mensagem, Limpar) | board | board estado-1: primárias visíveis + resto em **menu Mais** |
| **Board N sel.** (Atribuir, Pedir documentos, Enviar form, Criar tarefa, Criar grupo, Atribuir coach, Exportar, Limpar) | board | **toolbar de seleção** contextual (estado-N) |
| Stubs: Pedir documento(s), Enviar form, Atribuir coach, Criar tarefa, Mensagem, Exportar (`stubModuleAction`) | botões stub | mantêm-se como stub honesto até ao módulo próprio (Forms/Data.OS) |
| Mobile: abrir board (`setBoardOpen`), `mobileAssign` | mobile-actions | drawer do board (sobe ao tocar) + CTA atribuir |

### ⚠️ Funções NOVAS pedidas pelo relatório (não existem hoje — decisão tua)
- **Eliminar / Arquivar atleta** (danger zone + `ConfirmDialog`). Hoje **não há** delete/archive.
  Precisa de backend: *soft-delete*/`archived_at` ou `status='archived'` + RLS. → marcar se entra no P0.
- Cartão "≤2 alertas · 3 métricas (readiness/carga/forms)": **readiness/carga** vêm do **Data.OS** (F4);
  até lá mostram **estado honesto** ("—"), não números inventados.

### Testes de aceitação (paridade)
Pesquisar · filtrar (chips+avançado) · ordenar · selecionar 1 e N · cada ação do board nos 3 estados ·
abrir 360 do atleta certo · criar atleta · atribuir plano · alterar estado · (novo) eliminar com confirmação ·
mobile preserva pesquisa/filtros/Ver 360/Mais/seleção/danger.

---

## Páginas 2–8 — a preencher quando lá chegarmos
*(cada uma recebe o mesmo bloco: direção escolhida + contrato função→destino + testes.)*
- **2 Atleta 360** — header + KPIs + tabs Principal/Saúde/Analítica/Forms/Sessões/Métricas/Timeline + board.
- **3 App Shell** — sidebar/topbar/main/board/modal global/drawer global/toast + estados loading/empty/error.
- **4 Grupos / Grupo 360** — grelha + 360 + comparar grupos.
- **5 Calendário** — vistas + Live ligado.
- **6 Dashboard** — só depois dos módulos base (dados estáveis).
- **7 Studio / Forms** — builders.
- **8 Analytics / Data.OS / Live / Settings** — avançado + danger/logs.
