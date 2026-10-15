#!/usr/bin/env bash
# LUNA.OS audit:tokens — orçamento = 0 para hex e !important.
#   - HEX: proibido em qualquer ficheiro fora de packages/tokens/ (fonte única de cor).
#   - !important: proibido em todo o lado EXCETO apps/coach/src/luna-proto.css,
#     a camada de fidelidade vendida do protótipo HTML (ver ADR-0004).
set -e
COMMON='/dist/|__tests__|node_modules'

HEX=$(grep -rnE '#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b' \
  --include='*.ts' --include='*.tsx' --include='*.css' \
  apps packages 2>/dev/null | grep -vE "packages/tokens/|$COMMON" || true)

IMPORTANT=$(grep -rnE '!important' \
  --include='*.ts' --include='*.tsx' --include='*.css' \
  apps packages 2>/dev/null | grep -vE "packages/tokens/|luna-proto.css|$COMMON" || true)

VIOL="$HEX$IMPORTANT"
if [ -n "$VIOL" ]; then
  echo "❌ Violações de tokens encontradas:"
  [ -n "$HEX" ] && { echo "— HEX fora de @luna/tokens:"; echo "$HEX"; }
  [ -n "$IMPORTANT" ] && { echo "— !important fora da camada permitida:"; echo "$IMPORTANT"; }
  exit 1
else
  echo "✅ audit:tokens — 0 violações (orçamento cumprido)"
fi
