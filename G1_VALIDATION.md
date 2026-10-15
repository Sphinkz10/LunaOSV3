# G1 — Validação automatizada (Gate layout)

**Data:** 2026-06-13  
**Comando:** `pnpm validate:g1`  
**Resultado:** 4/4 testes verdes

| Verificação | 320px | 1440px |
|-------------|-------|--------|
| Shell layout | bottomnav + sheet | sidebar + right |
| POC renderiza | OK | OK |
| Troca por config | OK (override) | — |
| axe critical/serious | — | 0 |

## Sign-off visual humano (pendente ~5 min)

Abrir http://localhost:5173/poc com DevTools:

1. Largura **320px** — confirmar legibilidade, toques, sheet
2. Largura **1440px** — confirmar sidebar + board
3. Responder **OK** ou enviar screenshots + feedback

Os testes automatizados cobrem estrutura e a11y base; o gate G1 exige confirmação visual humana.
