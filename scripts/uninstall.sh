#!/usr/bin/env bash
# AI Test Engineering uninstall: yalniz urunun sahipligi bilinen girdilerini kaldirir.

set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -n "${XDG_DATA_HOME:-}" ]; then
  APP_ROOT="${XDG_DATA_HOME}/ai-test-engineering"
else
  APP_ROOT="${HOME}/.local/share/ai-test-engineering"
fi
OPENCODE_CONFIG="${HOME}/.config/opencode/opencode.json"

echo "[uninstall] Bolum 1: OpenCode MCP girdisi (sadece ai-test-engineering)"
if [ -f "$OPENCODE_CONFIG" ]; then
  if command -v jq >/dev/null 2>&1; then
    if jq 'has("mcp") and (.mcp | has("ai-test-engineering"))' "$OPENCODE_CONFIG" 2>/dev/null | grep -q true; then
      jq 'del(.mcp["ai-test-engineering"])' "$OPENCODE_CONFIG" > "$OPENCODE_CONFIG.tmp" && mv "$OPENCODE_CONFIG.tmp" "$OPENCODE_CONFIG"
      echo "  OK: girdi kaldirildi; diger ayarlar korundu"
    else
      echo "  NOT: girdi zaten yok"
    fi
  else
    echo "  UYARI: jq yok; elle kaldirin: mcp.ai-test-engineering"
  fi
else
  echo "  NOT: OpenCode config bulunamadi"
fi

echo "[uninstall] Bolum 2: runtime veri (otomatik silinmez)"
if [ -d "$APP_ROOT" ]; then
  echo "  Runtime veri: $APP_ROOT (DB, blob, log, config)"
  echo "  Silmek icin: rm -rf \"$APP_ROOT\""
else
  echo "  NOT: runtime dizini yok"
fi

echo "[uninstall] Bolum 3: build ciktilari"
rm -rf "$REPO_ROOT/dist"
echo "  OK: dist kaldirildi"

echo "UNINSTALL TAMAMLANDI (sahipligi bilinen girdiler)."
