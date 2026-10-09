/**
 * Node.js kurulum dogrulama: prerequisite + dist + runtime + config + smoke.
 * cmd.exe uzerinden: node scripts/verify-install.mjs
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

function resolveAppRoot() {
  if (process.platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData) return join(localAppData, "ai-test-engineering");
  } else {
    const xdg = process.env["XDG_DATA_HOME"];
    if (xdg) return join(xdg, "ai-test-engineering");
    const home = process.env["HOME"];
    if (home) return join(home, ".local", "share", "ai-test-engineering");
  }
  return null;
}

function main() {
  let ok = true;
  console.log("[verify] prerequisite");
  console.log(`  OK: node ${process.version}`);
  console.log(`  NOT: platform ${process.platform}`);

  console.log("[verify] dist");
  if (existsSync(join(repoRoot, "dist", "mcp", "stdio-entry.js"))) {
    console.log("  OK: stdio-entry.js mevcut");
  } else {
    console.log("  EKSIK: dist uretilmemis (node scripts/install.mjs veya npm run build)");
    ok = false;
  }

  console.log("[verify] runtime dizinleri");
  const appRoot = resolveAppRoot();
  if (appRoot && existsSync(appRoot)) {
    console.log(`  OK: ${appRoot}`);
  } else {
    console.log("  EKSIK: runtime dizini yok (node scripts/install.mjs)");
    ok = false;
  }

  console.log("[verify] config");
  if (appRoot && existsSync(join(appRoot, "config", "config.json"))) {
    console.log("  OK: config mevcut");
  } else {
    console.log("  EKSIK: config yok");
    ok = false;
  }

  console.log("[verify] MCP handshake smoke");
  const smoke = spawnSync(process.execPath, [join(repoRoot, "scripts", "mcp-handshake-smoke.mjs")], {
    stdio: "pipe",
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 60000,
  });
  if (smoke.status === 0) {
    console.log(`  OK: ${smoke.stdout.trim().split("\n").pop()}`);
  } else {
    console.log(`  BASARISIZ: ${smoke.stderr || smoke.stdout}`);
    ok = false;
  }

  if (ok) {
    console.log("DOG RULAMA TAMAM");
    return 0;
  }
  console.log("DOG RULAMA EKSIKLERI VAR");
  return 1;
}

process.exit(main());
