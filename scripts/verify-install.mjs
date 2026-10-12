/**
 * Node.js kurulum dogrulama: prerequisite + dist + runtime + config + smoke.
 * cmd.exe uzerinden: node scripts/verify-install.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// K08/B07: fileURLToPath - percent encoding/bosluk/Unicode dogru fiziksel path verir (E02).
const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), "..");

async function main() {
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
  let appRoot = null;
  let configPath = null;
  let dbPath = null;
  let openCodeConfigPath = null;
  if (existsSync(join(repoRoot, "dist", "configuration", "runtime-paths.js"))) {
    const paths = await import("../dist/configuration/runtime-paths.js");
    appRoot = paths.resolveRuntimeRoot();
    configPath = paths.resolveConfigPath();
    openCodeConfigPath = paths.resolveOpenCodeConfigPath();
    let configuredRoot = appRoot;
    if (existsSync(configPath)) {
      const { loadConfig } = await import("../dist/configuration/config-loader.js");
      configuredRoot = loadConfig(configPath).storage.root;
    }
    dbPath = paths.resolveDbPath(configuredRoot);
  }

  console.log("[verify] kayitli OpenCode entry");
  if (openCodeConfigPath && existsSync(openCodeConfigPath)) {
    try {
      const entryConfig = JSON.parse(readFileSync(openCodeConfigPath, "utf8"));
      const entry = entryConfig?.mcp?.["ai-test-engineering"];
      const environment = entry?.environment;
      const entryOk = entry?.type === "local"
        && Array.isArray(entry?.command)
        && entry.command.includes(join(repoRoot, "dist", "mcp", "stdio-entry.js"))
        && environment?.AITEST_CONFIG === configPath
        && environment?.AITEST_DB_PATH === dbPath;
      if (entryOk) console.log("  OK: gercek kayitli entry config/DB ile eslesiyor");
      else { console.log("  EKSIK: kayitli entry config/DB ile eslesmiyor"); ok = false; }
    } catch (error) {
      console.log(`  BASARISIZ: OpenCode config parse edilemedi: ${error instanceof Error ? error.message : String(error)}`);
      ok = false;
    }
  } else {
    console.log("  EKSIK: kayitli OpenCode entry yok");
    ok = false;
  }
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
    env: { ...process.env, ...(configPath ? { AITEST_CONFIG: configPath } : {}), ...(dbPath ? { AITEST_DB_PATH: dbPath } : {}) },
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

main().then((code) => process.exit(code)).catch((error) => {
  console.error(`DOGRULAMA BASARISIZ: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
