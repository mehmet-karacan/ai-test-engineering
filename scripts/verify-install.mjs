/**
 * Node.js kurulum dogrulama: prerequisite + dist + runtime + config + smoke.
 * cmd.exe uzerinden: node scripts/verify-install.mjs
 */
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// K08/B07: fileURLToPath - percent encoding/bosluk/Unicode dogru fiziksel path verir (E02).
const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), "..");

async function main() {
  // K01/K03: desteklenmeyen platformda readiness sonucu uretilmez.
  // Aksi halde handshake veya mevcut dist dosyalari Windows hazirligi gibi raporlanabilir.
  if (process.platform !== "win32") {
    console.log("[verify] BLOCKED: Windows native kurulum yalniz Windows'ta dogrulanir");
    return 1;
  }
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
  let appConfig = null;
  let openCodeConfig = null;
  let registeredEntry = null;
  if (existsSync(join(repoRoot, "dist", "configuration", "runtime-paths.js"))) {
    const paths = await import("../dist/configuration/runtime-paths.js");
    appRoot = paths.resolveRuntimeRoot();
    configPath = paths.resolveConfigPath();
    openCodeConfigPath = paths.resolveOpenCodeConfigPath();
    let configuredRoot = appRoot;
    if (existsSync(configPath)) {
      try {
        const { loadConfig } = await import("../dist/configuration/config-loader.js");
        appConfig = loadConfig(configPath);
        configuredRoot = appConfig.storage.root;
      } catch {
        console.log("  BASARISIZ: config schema okunamadi");
        ok = false;
      }
    }
    dbPath = paths.resolveDbPath(configuredRoot);
  }

  console.log("[verify] kayitli OpenCode entry");
  if (openCodeConfigPath && existsSync(openCodeConfigPath)) {
    try {
      const { readConfigFile } = await import("../dist/configuration/config-merge.js");
      const entryConfig = readConfigFile(openCodeConfigPath).parsed;
      openCodeConfig = entryConfig;
      const entry = entryConfig?.mcp?.["ai-test-engineering"];
      const { evaluateRegisteredMcpEntry } = await import("../dist/configuration/readiness.js");
      registeredEntry = evaluateRegisteredMcpEntry({ entry, entry_js: join(repoRoot, "dist", "mcp", "stdio-entry.js"),
        config_path: configPath, db_path: dbPath, ambient: process.env });
      const entryOk = registeredEntry.valid;
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
  console.log("[verify] OpenCode test-engineering skill");
  const { verifyOpenCodeSkill } = await import("../dist/configuration/opencode-skill-install.js");
  const skillMatches = openCodeConfigPath && verifyOpenCodeSkill(
    join(repoRoot, "integrations", "opencode", "skills", "test-engineering", "SKILL.md"),
    join(dirname(openCodeConfigPath), "skills", "test-engineering", "SKILL.md"),
  );
  if (skillMatches) console.log("  OK: kurulu skill paketle byte/hash eslesiyor");
  else { console.log("  NOT_READY: skill eksik veya farkli; node scripts/install.mjs ve ozel skill backup'ini kontrol edin"); ok = false; }
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

  // Readiness kontrolleri ayri yuzeylerdir: handshake PASS olmasi model veya
  // native Maven yetenegini otomatik READY yapmaz.
  console.log("[verify] model readiness");
  if (appConfig && openCodeConfig) {
    const { evaluateWorkerReadiness } = await import("../dist/configuration/readiness.js");
    const workerEnabled = registeredEntry?.valid === true && registeredEntry.worker_enabled;
    const model = evaluateWorkerReadiness({
      enabled: workerEnabled,
      profiles: appConfig.worker_profiles,
      default_profile: appConfig.default_worker_profile,
      configured_model: typeof openCodeConfig.model === "string" ? openCodeConfig.model : undefined,
      configured_providers: openCodeConfig.provider && typeof openCodeConfig.provider === "object" ? openCodeConfig.provider : {},
    });
    console.log(`  ${model.status}: model (${model.reason_code ?? model.evidence_level})`);
    if (model.status !== "READY") ok = false;
  } else {
    console.log("  NOT_READY: model (CONFIG_OR_OPENCODE_MISSING)");
    ok = false;
  }

  console.log("[verify] Maven readiness");
  const { evaluateMavenReadiness } = await import("../dist/configuration/readiness.js");
  let maven;
  try {
    const { NativeToolchainResolver, effectiveMavenEnvironment, verifyNativeToolchain } = await import("../dist/runners/native-toolchain.js");
    const env = effectiveMavenEnvironment(process.env);
    const plan = NativeToolchainResolver.resolve({ cwd: repoRoot, env });
    const verified = await verifyNativeToolchain(plan, env);
    maven = evaluateMavenReadiness({
      platform: process.platform,
      executable_found: true,
      version_probe_passed: true,
      maven_version: verified.mavenVersion,
      java_version: verified.javaVersion,
    });
  } catch (error) {
    const reason = error && typeof error === "object" && "details" in error
      && error.details && typeof error.details === "object" && "reason_code" in error.details
      && typeof error.details.reason_code === "string" ? error.details.reason_code : "MAVEN_READINESS_FAILED";
    maven = evaluateMavenReadiness({
      platform: process.platform,
      executable_found: false,
      version_probe_passed: false,
      failure_reason: reason,
    });
  }
  console.log(`  ${maven.status}: Maven (${maven.reason_code ?? maven.evidence_level})`);
  if (maven.status !== "READY") ok = false;

  console.log("[verify] MCP handshake smoke");
  const smoke = spawnSync(process.execPath, [join(repoRoot, "scripts", "mcp-handshake-smoke.mjs")], {
    stdio: "pipe",
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 60000,
    env: { ...(registeredEntry?.environment ?? process.env), ...(configPath ? { AITEST_CONFIG: configPath } : {}), ...(dbPath ? { AITEST_DB_PATH: dbPath } : {}),
      AITEST_SMOKE_COMMAND_JSON: JSON.stringify(registeredEntry?.valid ? registeredEntry.command : ["aitest-invalid-registration"]) },
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
