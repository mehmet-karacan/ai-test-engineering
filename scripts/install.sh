#!/usr/bin/env bash
# AI Test Engineering kurulumu: Linux.
# API key repoda veya kurulum ciktilarinda yazilmaz; OpenCode config merge/backup ile eklenir.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -n "${XDG_DATA_HOME:-}" ]; then
  APP_ROOT="${XDG_DATA_HOME}/ai-test-engineering"
else
  APP_ROOT="${HOME}/.local/share/ai-test-engineering"
fi

step() { echo "[kurulum] $1"; }

step "Bolum 1: prerequisite kontrolu"
MISSING=()
command -v node >/dev/null 2>&1 || MISSING+=("Node.js 24+")
command -v git >/dev/null 2>&1 || MISSING+=("git")
command -v java >/dev/null 2>&1 || MISSING+=("JDK")
if [ ${#MISSING[@]} -gt 0 ]; then
  printf '  EKSIK: %s\n' "${MISSING[@]}"
  echo "  BLOCKED: prerequisite'leri kurun ve tekrar calistirin."
  exit 2
fi
NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "  BLOCKED: Node.js 24+ gerekli"
  exit 2
fi
command -v mvn >/dev/null 2>&1 || echo "  NOT: mvn yok; mvnw wrapper kabul edilir"
echo "  OK: node $(node --version)"

step "Bolum 2: urun yukleme"
cd "$REPO_ROOT"
npm install --no-fund --no-audit >/dev/null
npm run build >/dev/null
echo "  OK: bagimliliklar kurulu, dist uretildi"

step "Bolum 3: runtime dizinleri"
mkdir -p "$APP_ROOT/config" "$APP_ROOT/blobs" "$APP_ROOT/logs" "$APP_ROOT/backups"
echo "  OK: $APP_ROOT"

step "Bolum 4: config dosyasi (yoksa olustur)"
CONFIG_PATH="$APP_ROOT/config/config.json"
if [ ! -f "$CONFIG_PATH" ]; then
  cat > "$CONFIG_PATH" <<EOF
{
  "schema_version": 1,
  "storage": { "root": "$APP_ROOT" },
  "coverage_defaults": { "metrics": ["LINE", "BRANCH"] },
  "budgets": { "max_candidate_iterations": 20, "max_repairs_per_candidate": 2, "no_progress_window": 3, "total_job_minutes": 120 },
  "worker_profiles": [],
  "allowed_project_roots": []
}
EOF
  echo "  OK: config olusturuldu ($CONFIG_PATH)"
else
  echo "  OK: mevcut config korundu"
fi

step "Bolum 5: OpenCode MCP baglantisi (merge, ezme yok)"
OPENCODE_DIR="${HOME}/.config/opencode"
OPENCODE_CONFIG="$OPENCODE_DIR/opencode.json"
mkdir -p "$OPENCODE_DIR"

ENTRY_JS="$REPO_ROOT/dist/mcp/stdio-entry.js"
if [ -f "$OPENCODE_CONFIG" ]; then
  BACKUP="$APP_ROOT/backups/opencode-config-$(date +%Y%m%d-%H%M%S).bak.json"
  cp "$OPENCODE_CONFIG" "$BACKUP"
  echo "  OK: mevcut config yedeklendi ($BACKUP)"
  if command -v jq >/dev/null 2>&1; then
    jq --arg entry "$ENTRY_JS" '.mcp["ai-test-engineering"] = {"type":"local","command":["node",$entry]}' "$OPENCODE_CONFIG" > "$OPENCODE_CONFIG.tmp" && mv "$OPENCODE_CONFIG.tmp" "$OPENCODE_CONFIG"
    echo "  OK: OpenCode MCP baglantisi eklendi ($OPENCODE_CONFIG)"
  else
    echo "  UYARI: jq yok; elle ekleyin: mcp.ai-test-engineering = { type: local, command: [\"node\", \"$ENTRY_JS\"] }"
  fi
else
  cat > "$OPENCODE_CONFIG" <<EOF
{
  "mcp": {
    "ai-test-engineering": { "type": "local", "command": ["node", "$ENTRY_JS"] }
  }
}
EOF
  echo "  OK: OpenCode MCP baglantisi eklendi ($OPENCODE_CONFIG)"
fi

step "Bolum 6: smoke dogrulama"
cd "$REPO_ROOT"
npm test >/dev/null
echo "  OK: smoke testler gecti"

echo ""
echo "KURULUM TAMAMLANDI."
echo "Runtime veri: $APP_ROOT"
echo "Kullanim: Java projesinde OpenCode'u acin, dogal dille hedefi soyleyin."
