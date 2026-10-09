/**
 * Node.js kurulum girisi: PS1'siz standart yol.
 * cmd.exe uzerinden: node scripts/install.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { mergeConfigRecord } from "../dist/configuration/config-merge.js";

const thisFile = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const repoRoot = resolve(dirname(thisFile), "..");
const appRoot = resolveAppRoot();

function resolveAppRoot() {
  if (process.platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData && localAppData.length > 0) {
      return join(localAppData, "ai-test-engineering");
    }
    const userProfile = process.env["USERPROFILE"];
    if (userProfile && userProfile.length > 0) {
      return join(userProfile, "AppData", "Local", "ai-test-engineering");
    }
  } else {
    const xdg = process.env["XDG_DATA_HOME"];
    if (xdg && xdg.length > 0) {
      return join(xdg, "ai-test-engineering");
    }
    const home = process.env["HOME"];
    if (home && home.length > 0) {
      return join(home, ".local", "share", "ai-test-engineering");
    }
  }
  throw new Error("Kullanici veri dizini cozumlenemedi");
}

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

export function mainInstall() {
  step("Bolum 1: prerequisite kontrolu");
  const nodeVersion = process.version.replace("v", "");
  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0], 10);
  if (nodeMajor < 24) {
    console.error(`  BLOCKED: Node.js 24+ gerekli (bulunan: ${nodeVersion})`);
    return 2;
  }
  step(`  OK: node ${nodeVersion}`);

  step("Bolum 2: urun yukleme (npm install + build)");
  runNpm(["install", "--no-fund", "--no-audit"], repoRoot);
  runNpm(["run", "build"], repoRoot);
  step("  OK: bagimliliklar kurulu, dist uretildi");

  step("Bolum 3: runtime dizinleri");
  for (const sub of ["config", "blobs", "logs", "backups", "jobs"]) {
    mkdirSync(join(appRoot, sub), { recursive: true });
  }
  step(`  OK: ${appRoot}`);

  step("Bolum 4: config dosyasi (yoksa olustur)");
  const configPath = join(appRoot, "config", "config.json");
  if (!existsSync(configPath)) {
    const config = {
      schema_version: 1,
      storage: { root: appRoot },
      coverage_defaults: { metrics: ["LINE", "BRANCH"] },
      budgets: { max_candidate_iterations: 20, max_repairs_per_candidate: 2, no_progress_window: 3, total_job_minutes: 120 },
      worker_profiles: [],
      allowed_project_roots: [],
    };
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    step(`  OK: config olusturuldu (${configPath})`);
  } else {
    step("  OK: mevcut config korundu");
  }

  step("Bolum 5: OpenCode MCP baglantisi (minimal merge, ezme yok)");
  const home = process.env["USERPROFILE"] ?? process.env["HOME"];
  const opencodeConfigPath = join(home ?? "", ".config", "opencode", "opencode.json");
  const entryJs = join(repoRoot, "dist", "mcp", "stdio-entry.js");
  const serverEntry = { type: "local", command: ["node", entryJs] };
  const backupDir = join(appRoot, "backups");

  if (!existsSync(opencodeConfigPath)) {
    mkdirSync(dirname(opencodeConfigPath), { recursive: true });
    writeFileSync(opencodeConfigPath, JSON.stringify({ mcp: { "ai-test-engineering": serverEntry } }, null, 2) + "\n", "utf8");
    step(`  OK: OpenCode config olusturuldu (${opencodeConfigPath})`);
  } else {
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
    env: { ...process.env, AITEST_DB_PATH: join(appRoot, "state.db") },
  });
  if (smoke.status !== 0) {
    console.error(`  BLOCKED: MCP handshake smoke basarisiz: ${smoke.stderr || smoke.stdout}`);
    return 1;
  }
  step(`  OK: ${smoke.stdout.trim().split("\n").pop()}`);

  console.log("");
  console.log("KURULUM TAMAMLANDI.");
  console.log(`Runtime veri: ${appRoot}`);
  console.log("Kullanim: Java projesinde OpenCode'u acin, dogal dille hedefi soyleyin.");
  return 0;
}

process.exit(mainInstall());
