#!/usr/bin/env bash
# LUNA.OS — Aplica migrações + provas SQL + seeds de desenvolvimento (espelha o CI)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -v ON_ERROR_STOP=1)

"${PSQL[@]}" -f supabase/tests/auth_shim.sql
for f in supabase/migrations/*.sql; do
  echo "==> $f"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f supabase/tests/rls_asserts.sql
"${PSQL[@]}" -f supabase/tests/conta_asserts.sql
"${PSQL[@]}" -f supabase/tests/equipa_asserts.sql
"${PSQL[@]}" -f supabase/tests/dia_asserts.sql
"${PSQL[@]}" -f supabase/tests/app_asserts.sql
"${PSQL[@]}" -f supabase/tests/clientes_asserts.sql
"${PSQL[@]}" -f supabase/tests/ficha_asserts.sql
"${PSQL[@]}" -f supabase/tests/definicoes_asserts.sql
"${PSQL[@]}" -f supabase/tests/biblioteca_asserts.sql
"${PSQL[@]}" -f supabase/tests/treino_asserts.sql
"${PSQL[@]}" -f supabase/tests/treino2_asserts.sql
"${PSQL[@]}" -f supabase/tests/horario_asserts.sql
"${PSQL[@]}" -f supabase/tests/packs_asserts.sql
"${PSQL[@]}" -f supabase/tests/pt_asserts.sql
"${PSQL[@]}" -f supabase/tests/ao_vivo_asserts.sql
"${PSQL[@]}" -f supabase/tests/horario2_asserts.sql
"${PSQL[@]}" -f supabase/seed.sql
echo "✅ db-setup concluído com sucesso"
