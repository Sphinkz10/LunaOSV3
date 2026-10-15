# ADR-0003 — Tokens e defesa anti-hardcode
**Decisão:** cores fixas em luna-dark (valores reais do legado); investimento = layout trocável. 6 camadas de defesa: lint custom (luna/no-hardcoded-visuals) · checklist PR · Chromatic · scripts/audit-tokens.sh · CODEOWNERS · orçamento !important=0. Único ficheiro com hex: packages/tokens/src/tokens.css (+primitives.ts).
