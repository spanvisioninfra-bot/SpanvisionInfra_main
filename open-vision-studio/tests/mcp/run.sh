#!/usr/bin/env bash
# MCP-bridge-tests — draait elk cases-*.ts-bestand headless tegen de ECHTE Zustand-store, via een
# esbuild-bundel (geen testrunner-dependency; dezelfde esbuild die met Vite meekomt).
#
#   bash tests/mcp/run.sh                 # alle cases-*.ts
#   bash tests/mcp/run.sh cases-smoke.ts  # één specifiek case-bestand
#
# Nieuwe tests = een nieuw cases-*.ts-bestand ernaast leggen. Aan dit script hoeft niets te
# veranderen — het globt en draait ze in een lus.
#
# Exit 0 = elk case-bestand groen, exit 1 = minstens één gefaald.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"

if [ "$#" -gt 0 ]; then
  FILES=()
  for f in "$@"; do FILES+=("$DIR/$f"); done
else
  FILES=("$DIR"/cases-*.ts)
fi

STATUS=0
PASS=0
FAIL=0

for src in "${FILES[@]}"; do
  name="$(basename "$src")"
  out="$DIR/.$(basename "$src" .ts).mjs"
  if ! "$ROOT/node_modules/.bin/esbuild" "$src" \
      --bundle --platform=node --format=esm --alias:@="$ROOT/src" \
      --define:import.meta.env.DEV=false \
      --define:import.meta.env.PROD=true \
      --define:import.meta.env.MODE='"production"' \
      --define:__OPS_DEV_INSTANCE__='"test"' \
      --outfile="$out" >/dev/null 2>&1; then
    echo "  BUILD-FAIL  $name"
    FAIL=$((FAIL + 1)); STATUS=1
    continue
  fi
  if node "$out"; then
    echo "$name  PASS"
    PASS=$((PASS + 1))
  else
    echo "$name  FAIL"
    FAIL=$((FAIL + 1)); STATUS=1
  fi
done

echo "TOTAAL: $PASS groen, $FAIL rood"
exit "$STATUS"
