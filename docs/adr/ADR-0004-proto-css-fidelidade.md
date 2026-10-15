# ADR-0004 — Camada de fidelidade `luna-proto.css` e fonte única de hex

**Estado:** aceite · 2026-06-17
**Contexto:** decisão do utilizador "conversão para React fiel" ao protótipo HTML.

## Contexto

A "viragem visual" (F5) portou o CSS do protótipo para `apps/coach/src/luna-proto.css`.
A versão inicial trouxe **216 violações** ao ADR-0003 (anti-hardcode): 98 cores hex
espalhadas + 117 `!important` + um `:root` que **duplicava** a paleta já definida em
`@luna/tokens/tokens.css`. O `audit:tokens` (gate de CI) passaria a falhar, e os
documentos afirmavam "0 violações" — desalinhado com a realidade.

## Decisão

1. **Fonte única de hex = `@luna/tokens/tokens.css`.** O `:root` próprio do
   `luna-proto.css` foi removido. Os nomes curtos do protótipo (`--sky`, `--ink`,
   `--bg`, `--r8`, `--panel`, tints `--c-*`, …) passam a ser definidos/alias em
   `tokens.css`. O `luna-proto.css` usa **apenas `var(--…)`** — 0 hex.
2. **`luna-proto.css` é uma camada de fidelidade vendida** (porte 1:1 do HTML do
   utilizador). O `audit:tokens` continua a exigir **0 hex em todo o lado**, mas
   **permite `!important` exclusivamente neste ficheiro** — os 117 `!important` são
   *overrides* responsivos de um porte com especificidade achatada; removê-los às
   cegas arriscaria regressões visuais no porte fiel. Em qualquer `.tsx`/componente
   ou noutro `.css`, `!important` continua proibido (orçamento = 0).
3. **ADR-0003 mantém-se** para todo o código de aplicação/componentes. Esta é uma
   exceção estreita e nomeada, não um relaxamento geral.

## Consequências

- `audit:tokens` volta a 0 violações de forma **honesta** (verificado) e o gate de CI
  (`pnpm audit:tokens`, global) volta a poder passar.
- Mudar a paleta faz-se num só sítio (`tokens.css`); o porte fiel reflete automaticamente.
- Dívida assumida: os 117 `!important` no `luna-proto.css`. **Saldam-se gradualmente**
  à medida que cada bloco do porte é refatorado para componentes React tokenizados
  (ver `ROADMAP_CONVERSAO_REACT.md`, faixa de convergência).

## Alternativas rejeitadas

- *Manter dois `:root` com hex duplicado* — fonte de verdade dividida; rejeitado.
- *Excluir `luna-proto.css` inteiro do audit* — deixaria hex futuros entrar sem rede;
  rejeitado (mantemos hex = 0 mesmo no porte).
- *Remover os 117 `!important` já* — risco de regressão visual alto sem ganho imediato;
  adiado para a refatoração incremental por módulo.
