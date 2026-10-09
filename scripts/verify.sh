#!/usr/bin/env bash
# AI Test Engineering kurulum dogrulamasi: prerequisite + config + smoke.

set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -n "${XDG_DATA_HOME:-}" ]; then
  APP_ROOT="${XDG_DATA_HOME}/ai-test-engineering"
else
  APP_ROOT="${HOME}/.local/share/ai-test-engineering"
fi

OK=1
echo "[verify] prerequisite"
for cmd in node git java; do
  if command -v "$cmd" >/dev/null 2>&1; then echo "  OK: $cmd"; else echo "  EKSIK: $cmd"; OK=0; fi
done

echo "[verify] dist"
if [ -f "$REPO_ROOT/dist/mcp/stdio-entry.js" ]; then echo "  OK: stdio-entry.js"; else echo "  EKSIK: dist uretilmemis"; OK=0; fi

echo "[verify] runtime"
if [ -d "$APP_ROOT" ]; then echo "  OK: $APP_ROOT"; else echo "  EKSIK: runtime dizini yok"; OK=0; fi

echo "[verify] testler"
cd "$REPO_ROOT"
if ! npm test >/dev/null; then OK=0; fi

if [ "$OK" -eq 1 ]; then echo "DOG RULAMA TAMAM"; exit 0; else echo "DOG RULAMA EKSIKLERI VAR"; exit 1; fi
