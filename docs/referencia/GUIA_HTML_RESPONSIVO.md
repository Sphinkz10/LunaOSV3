# 🎨 Guia de Referência — HTML original "Atletas + Grupos" (Fase 5E.1.1)

> Fonte: HTML de protótipo entregue pelo utilizador (`data-refactor="final-clean-...advanced360-visible"`).
> **Objetivo:** guia de fidelidade visual e, sobretudo, **de responsividade**. Não copiar 100%; manter
> **a forma como se chega às funções** (fluxos), tornar a app LUNA.OS atual **mais responsiva** e
> **seguir sempre o roadmap (imperial)**.

O HTML completo está guardado em
[`PROTOHTML_Fase5E1_1_Atletas_Grupos.html`](PROTOHTML_Fase5E1_1_Atletas_Grupos.html)
(~1,5 MB — abrir no browser para comparar visual). Este documento extrai o que é **acionável**:
design tokens, breakpoints, estratégia de layout e padrões de componente, e compara-os com o sistema
React/`@luna/*` atual.

---

## 1. Design tokens do protótipo (CSS `:root`)

| Token | Valor | Equivalente no LUNA.OS |
|---|---|---|
| `--sky` | `#8ECAE6` | `@luna/tokens` semantic (a mapear) |
| `--teal` | `#209EBB` | idem |
| `--navy` | `#023047` | base do fundo |
| `--gold` | `#FFB701` | accent primário |
| `--orange` | `#FC8500` | accent secundário |
| `--danger` | `#E05555` | estado erro |
| `--success` | `#4CAF50` | estado ok |
| `--header` | `66px` | `--header-h` |
| `--side` | `222px` | `--side-w` |
| `--board` | `330px` | `--board-w` |
| `--display` | `"Space Grotesk"` | fonte títulos |
| `--font` | `"Plus Jakarta Sans"` | fonte corpo |
| raios | `--r8..--r22`, `--pill:999px` | escala de raios |
| `--t` | `.22s cubic-bezier(.2,.9,.35,1)` | transição padrão |

> **Nota anti-hardcode (ADR-0003):** estes valores devem entrar como **tokens** em `@luna/tokens`,
> nunca hex/px diretos nos componentes. O protótipo usa hex à mão — a app **não pode**.

---

## 2. Estrutura de layout (shell)

```
.app  → flex column, 100dvh
  .topbar (--header 66px)          → marca + ações
  .layout (grid: --side 1fr --board)
    .sidebar (--side 222px)        → navegação
    .main (scroll)                 → conteúdo (page-head, stats, toolbar, list-card)
    .board (--board 330px)         → painel de ação contextual
```

Mapeia diretamente para o `ResponsiveShell` atual (`nav` / `header` / `content` / `aside`).

---

## 3. ⭐ Breakpoints e estratégia responsiva (o núcleo deste guia)

### Breakpoints usados no HTML (ordenados)
`560 · 720 · 760 · 860 · 900 · 960 · 1020 · 1080 · 1100 · 1220 · 1360 · 1380 · 1500`

### Pontos de viragem estruturais (os que importam)

| Largura | Comportamento no protótipo |
|---|---|
| **> 1220** | layout completo: `--side 222` · conteúdo · `--board 330` |
| **≤ 1220** | reduz dimensões: `--side:190px; --board:300px`; `stats` 5→3 colunas; esconde colunas extra da lista |
| **≤ 960** | **colapsa para 1 coluna**: esconde `.sidebar` e `.board`; surge **barra de ações inferior** (`.mobile-actions` fixa em baixo); `stats` → 2 colunas; lista vira cartões empilhados |
| **≤ 760** | 360 detalhe empilha (header coluna, grids 1 coluna); tabelas com scroll-x; `a360` grids → 1 coluna |
| **≤ 560** | tudo 1 coluna: `stats`, `option-grid`, `field-grid`, `profile-grid`; `page-head h1` 1.9→1.55rem; `topbar` padding reduzido |
| `prefers-reduced-motion` | desliga animações/transições |

### Estratégia atual (`@luna/tokens/src/layout.ts`) — ✅ fiel ao HTML

```ts
defaultStrategyFor = (width) =>
  width >= 960 ? { shell:'sidebar', aside:'right',  density:'comfortable' }
               : { shell:'collapsed', aside:'hidden', density: width >= 560 ? 'comfortable' : 'compact' };
```

**Regra de ouro (decisão do utilizador):** atalhos, botões e ligações ficam **nos mesmos sítios** que no HTML phase3 (versão renderizada no browser).
Mobile <960: sidebar/board ocultos; **MobileNav** global (bottom bar + FAB); barra **`.mobile-actions` por página** acima da nav (offset `bottom: calc(72px + safe-area)`); navegação via sidebar (desktop) ou ⌘K + MobileNav.

### 🔍 Estado vs. HTML (HTML ↔ LUNA.OS)

| Tema | HTML protótipo | LUNA.OS | Estado |
|---|---|---|---|
| **Estrutura shell** | topbar full-width · grid side\|main\|board | `ResponsiveShell` igual | ✅ feito |
| **Colapso <960** | esconde sidebar+board; `.mobile-actions` | `collapsed` + `mobileActions` slot | ✅ feito |
| **Navegação mobile** | `.mobile-actions` fixa; sem bottom-nav global | `MobileNav` + `.mobile-actions` acima | ✅ feito |
| **Nav sidebar** | Principal + Sistema + Próximas fases | `CoachNav` com ícones/ordem iguais | ✅ feito |
| **Topbar** | brand + módulo + Tutorial | `CoachBrand` + `CoachTopActions` | ✅ feito |
| **page-head** | kicker+h1+head-actions | `PageHead` component | ✅ feito |
| **Dimensões <1220** | `--side/--board` narrow | media query em `tokens.css` | ✅ feito |

---

## 4. Padrões de componente a preservar (a "forma de chegar às funções")

- **page-head** com kicker + h1 + descrição + `info-dot` (tooltip) + `head-actions`.
- **stats** clicáveis que **filtram** a lista (cada card = filtro rápido).
- **toolbar**: pesquisa + sort + colunas (gear) + **Pesquisa Avançada** (painel inline).
- **list-card** com `list-head` em grelha e linhas `ath-row` (grelha igual ao header).
- **board** contextual: muda com 0 / 1 / N selecionados (alertas → contexto do item → ações em massa).
- **Wizards por passos** (`wizard-steps` / `step`) para Atribuir, Criar Grupo, etc.
- **Modal** (`modal-backdrop`/`modal` com trap/ESC) e **drawer** lateral para Perfil 360.
- **360 (Atleta/Grupo)**: dossier sticky + tabs + sub-tabs + cartões consultáveis.
- **toasts** efémeros; **command palette** (⌘K) e **atalhos** (`?`).

> Estes fluxos já existem (ou estão planeados) na app. O guia serve para **não perder** este modelo
> de interação ao tornar responsivo.

---

## 5. Plano de aplicação (sem sair do roadmap)

1. **F3 (atual) — manter foco**: terminar Calendário (disponibilidade recorrente, aulas c/ capacidade,
   vista Dia, Live). A responsividade entra como **polish transversal**, não como nova fase.
2. **Tokens de layout** (`@luna/tokens`): adicionar tier intermédio + `density:'compact'` <768.
   Atualizar `defaultStrategyFor` e `breakpoints` se necessário (3 testes de layout devem continuar verdes).
3. **`ResponsiveShell`/`LayoutContext`**: consumir os novos tiers; garantir esconder `aside` cedo e
   barra de ações no bottomnav.
4. **Global**: `@media (prefers-reduced-motion: reduce)` a desligar transições.
5. **Grids**: migrar grids fixos (stats, kpis, option-grid) para `auto-fit/minmax` ou tiers de token.
6. **Gate G1**: revalidar `/poc` a 320 e 1440 após cada lote responsivo.

---

## 6. Checklist de fidelidade (futuro, por módulo)

- [◐] **Atletas (phase3):** copy/classes do HTML renderizado; `.phase3-ath-row` + truncagem; board `phase3BoardAlertRows`; validar side-by-side 320/672/1440.
- [ ] Grupos / Grupo 360: tabs scrolláveis, grids `auto-fit`, dossier sticky só ≥1220.
- [ ] Atleta 360: header empilha < 760, shell 2col → 1col, sub-tabs com scroll mask.
- [ ] Calendário: mês compacto + agenda densa; semana → 1 coluna < 640.
- [ ] Modais/drawers: largura `min(…, 100vw - margem)`; `max-height: calc(100dvh - …)`.
