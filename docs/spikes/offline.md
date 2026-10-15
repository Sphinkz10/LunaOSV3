# Spike P0.9 — Offline-sync (decisões a validar)
**Cache:** TanStack persist (web) + SQLite capacitor-community (nativo).
**Fila:** mutações offline → fila com retry exponencial; processada por ordem.
**Conflitos por entidade:** bookings = server-wins (EXCLUDE decide) · session_sets = merge-by-field · deletes = tombstone (archived_at, já existe na DB).
**Exclusões de cache em claro:** athlete_allergies, condições, métricas clínicas, documentos (Guia §10).
**Estado:** desenho fechado; protótipo de fila em P7.1; validação de SQLite em device pendente.
