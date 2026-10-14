/**
 * Node.js kurulum girisi: PS1'siz standart yol.
 * cmd.exe uzerinden: node scripts/install.mjs
 * Temiz clone'da (dist yokken) calisir: config-merge bootstrap'tan ONCE import edilmez.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// K08/B07: fileURLToPath - percent encoding/bosluk/Unicode dogru fiziksel path verir (E02).
const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), "..");
let appRoot;

function step(message) {
  console.log(`[kurulum] ${message}`);
}

function runNpm(args, cwd) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, args, { cwd, stdio: "pipe", shell: process.platform === "win32", windowsHide: true, encoding: "utf8" });
  if (result.error) {
    throw new Error(`npm ${args.join(" ")} calistirilamadi: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} basarisiz (exit ${result.status}): ${result.stderr}`);
  }
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export async function mainInstall() {
  // K01/K03: bu kurulum girisi yalniz Windows native dagitimini destekler.
  // Desteklenmeyen platformda npm/build veya kullanici config merge'i baslamaz.
  if (process.platform !== "win32") {
    console.error("  BLOCKED: Windows native kurulum yalniz Windows'ta desteklenir");
    return 2;
  }
  step("Bolum 1: prerequisite kontrolu");
  const nodeVersion = process.version.replace("v", "");
  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0], 10);
  if (nodeMajor < 24) {
    console.error(`  BLOCKED: Node.js 24+ gerekli (bulunan: ${nodeVersion})`);
    return 2;
  }
  step(`  OK: node ${nodeVersion}`);

  step("Bolum 2: urun yukleme (npm ci + build)");
  runNpm(["ci", "--no-fund", "--no-audit"], repoRoot);
  runNpm(["run", "build"], repoRoot);
  const { resolveRuntimeRoot, resolveConfigPath } = await import("../dist/configuration/runtime-paths.js");
  appRoot = resolveRuntimeRoot();
  const configPath = resolveConfigPath();
  let configCreatedByInstall = false;
  step("  OK: bagimliliklar kurulu, dist uretildi");

  step("Bolum 3: runtime dizinleri");
  for (const sub of ["config", "blobs", "logs", "backups", "jobs"]) {
    mkdirSync(join(appRoot, sub), { recursive: true });
  }
  step(`  OK: ${appRoot}`);

  step("Bolum 4: config dosyasi (yoksa olustur)");
  if (!existsSync(configPath)) {
    const config = {
      schema_version: 1,
      storage: { root: appRoot },
      coverage_defaults: { metrics: ["LINE", "BRANCH"] },
      budgets: { max_candidate_iterations: 20, max_repairs_per_candidate: 2, no_progress_window: 3, total_job_minutes: 120 },
      discovery: { max_concrete_targets: 500 },
      worker_profiles: [],
      allowed_project_roots: [],
      dependency_provisioning: { enabled: false, allowed_mirrors: [], timeout_ms: 900000 },
    };
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    configCreatedByInstall = true;
    step(`  OK: config olusturuldu (${configPath})`);
  } else {
    step("  OK: mevcut config korundu");
  }
  const { loadConfig } = await import("../dist/configuration/config-loader.js");
  const { resolveDbPath, resolveOpenCodeConfigPath } = await import("../dist/configuration/runtime-paths.js");
  const effectiveConfig = loadConfig(configPath);
  const dbPath = resolveDbPath(effectiveConfig.storage.root);

  step("Bolum 5: OpenCode MCP baglantisi (minimal merge, ezme yok)");
  const opencodeConfigPath = resolveOpenCodeConfigPath();
  const entryJs = join(repoRoot, "dist", "mcp", "stdio-entry.js");
  const serverEnvironment = { AITEST_CONFIG: configPath, AITEST_DB_PATH: dbPath };
  if (process.env["AITEST_WORKER_ENABLED"] !== undefined) serverEnvironment.AITEST_WORKER_ENABLED = process.env["AITEST_WORKER_ENABLED"];
  if (process.env["AITEST_PROFILE"] !== undefined) serverEnvironment.AITEST_PROFILE = process.env["AITEST_PROFILE"];
  const serverEntry = {
    type: "local",
    command: ["node", entryJs],
    environment: serverEnvironment,
  };
  const backupDir = join(appRoot, "backups");

  if (!existsSync(opencodeConfigPath)) {
    mkdirSync(dirname(opencodeConfigPath), { recursive: true });
    writeFileSync(opencodeConfigPath, JSON.stringify({ mcp: { "ai-test-engineering": serverEntry } }, null, 2) + "\n", "utf8");
    step(`  OK: OpenCode config olusturuldu (${opencodeConfigPath})`);
  } else {
    // K08/B07: mergeConfigRecord dynamic import (dist bootstrap'tan sonra uretilir; temiz clone'da statik import yok):
    const { mergeConfigRecord } = await import("../dist/configuration/config-merge.js");
    const merge = mergeConfigRecord(opencodeConfigPath, {
      record_path: ["mcp", "ai-test-engineering"],
      new_value: serverEntry,
      backup_dir: backupDir,
    });
    if (merge.changed) {
      step(`  OK: minimal merge yapildi (backup: ${merge.backup_path})`);
      step(`  Korunan ust alanlar: ${merge.preserved_keys.join(", ")}`);
    } else {
      step("  OK: kayit zaten guncel; degisiklik yok (idempotent)");
    }
  }

  step("Bolum 6: MCP handshake smoke");
  const smoke = spawnSync(process.execPath, [join(repoRoot, "scripts", "mcp-handshake-smoke.mjs")], {
    stdio: "pipe",
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, AITEST_CONFIG: configPath, AITEST_DB_PATH: dbPath },
  });
  if (smoke.status !== 0) {
    console.error(`  BLOCKED: MCP handshake smoke basarisiz: ${smoke.error?.message || smoke.stderr || smoke.stdout || "exit bilinmiyor"}`);
    return 1;
  }
  step(`  OK: ${smoke.stdout.trim().split("\n").pop()}`);

  // P08: uninstall yalniz install'in sahip oldugu, degistirilmemis dosyalari
  // silebilsin. Mevcut config merge edildiyse tum dosya sahiplenilmez.
  const installManifestPath = join(appRoot, "install-manifest.json");
  if (!existsSync(installManifestPath)) {
    const ownedFiles = configCreatedByInstall && existsSync(configPath)
      ? [{ path: configPath, sha256: sha256File(configPath) }]
      : [];
    writeFileSync(installManifestPath, JSON.stringify({ schema_version: 1, owned_files: ownedFiles }, null, 2) + "\n", "utf8");
    step("  OK: install manifest yazildi");
  } else {
    step("  OK: mevcut install manifest korundu");
  }

  const persistedConfig = JSON.parse(readFileSync(configPath, "utf8"));
  const { evaluateWorkerReadiness } = await import("../dist/configuration/readiness.js");
  let opencodeConfig = {};
  try {
    opencodeConfig = JSON.parse(readFileSync(opencodeConfigPath, "utf8"));
  } catch {
    // Config merge daha once basarili olsa da readiness, bozuk provider
    // config'ini sessizce READY saymaz.
  }
  const selectedModelReadiness = evaluateWorkerReadiness({
    enabled: process.env["AITEST_WORKER_ENABLED"] === "1",
    profiles: Array.isArray(persistedConfig.worker_profiles) ? persistedConfig.worker_profiles : [],
    default_profile: typeof persistedConfig.default_worker_profile === "string" ? persistedConfig.default_worker_profile : undefined,
    configured_model: typeof opencodeConfig.model === "string" ? opencodeConfig.model : undefined,
    configured_providers: opencodeConfig.provider && typeof opencodeConfig.provider === "object" ? opencodeConfig.provider : {},
  });
  if (selectedModelReadiness.status === "READY") {
    step(`  READY: MCP handshake + model (${selectedModelReadiness.evidence_level})`);
  } else {
    step(`  NOT_READY: MCP handshake basarili; model (${selectedModelReadiness.reason_code}) - ${selectedModelReadiness.detail}; worker_profiles/provider/model kontrolu gerekli`);
  }

  const { evaluateMavenReadiness } = await import("../dist/configuration/readiness.js");
  let mavenReadiness;
  try {
    const { NativeToolchainResolver, effectiveMavenEnvironment, verifyNativeToolchain } = await import("../dist/runners/native-toolchain.js");
    const env = effectiveMavenEnvironment(process.env);
    const plan = NativeToolchainResolver.resolve({ cwd: repoRoot, env });
    const verified = await verifyNativeToolchain(plan, env);
    mavenReadiness = evaluateMavenReadiness({
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
    mavenReadiness = evaluateMavenReadiness({
      platform: process.platform,
      executable_found: false,
      version_probe_passed: false,
      failure_reason: reason,
    });
  }
  step(`  ${mavenReadiness.status}: Maven (${mavenReadiness.reason_code ?? mavenReadiness.evidence_level})`);

  console.log("");
  console.log("KURULUM TAMAMLANDI.");
  console.log(`Runtime veri: ${appRoot}`);
  console.log("Kullanim: Java projesinde OpenCode'u acin, dogal dille hedefi soyleyin.");
  return 0;
}

mainInstall().then((code) => process.exit(code)).catch((error) => {
  console.error(`[kurulum] beklenmeyen hata: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
