/**
 * Node.js kaldirma: yalniz urunun sahipligi bilinen kaydini kaldirir.
 * cmd.exe uzerinden: node scripts/uninstall.mjs
 */
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { removeConfigRecord } from "../dist/configuration/config-merge.js";
import { resolveOpenCodeConfigPath, resolveRuntimeRoot } from "../dist/configuration/runtime-paths.js";
import { ownedUninstall } from "../dist/storage/lifecycle-ops.js";

const repoRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

function main() {
  console.log("[uninstall] Bolum 1: OpenCode MCP girdisi (sadece ai-test-engineering)");
  const opencodeConfigPath = resolveOpenCodeConfigPath();
  const appRoot = resolveRuntimeRoot();
  const backupDir = appRoot ? join(appRoot, "backups") : undefined;

  const installManifestPath = appRoot ? join(appRoot, "install-manifest.json") : null;
  if (installManifestPath && existsSync(installManifestPath)) {
    const owned = ownedUninstall(installManifestPath);
    for (const removed of owned.removed) console.log(`  OK: sahip olunan dosya kaldirildi: ${removed.path}`);
    for (const preserved of owned.preserved) console.log(`  UYARI: dosya korundu: ${preserved.path} (${preserved.reason})`);
  }

  if (existsSync(opencodeConfigPath)) {
    try {
      const merge = removeConfigRecord(opencodeConfigPath, ["mcp", "ai-test-engineering"], backupDir);
      if (merge.changed) {
        console.log(`  OK: girdi kaldirildi (backup: ${merge.backup_path}); diger ayarlar korundu`);
      } else {
        console.log("  NOT: girdi zaten yok");
      }
    } catch (error) {
      console.log(`  UYARI: config islenemedi: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`  Elle kontrol edin: ${opencodeConfigPath}`);
    }
  } else {
    console.log("  NOT: OpenCode config bulunamadi");
  }

  console.log("[uninstall] Bolum 2: runtime veri (otomatik silinmez)");
  if (appRoot && existsSync(appRoot)) {
    console.log(`  Runtime veri: ${appRoot} (DB, blob, log, config)`);
    console.log(`  Silmek icin (Windows): rmdir /s /q "${appRoot}"`);
    console.log(`  Silmek icin (Linux): rm -rf "${appRoot}"`);
  } else {
    console.log("  NOT: runtime dizini yok");
  }

  console.log("[uninstall] Bolum 3: build ciktilari (repo icinde)");
  const distPath = join(repoRoot, "dist");
  if (existsSync(distPath)) {
    rmSync(distPath, { recursive: true, force: true });
    console.log("  OK: dist kaldirildi");
  }

  console.log("UNINSTALL TAMAMLANDI (sahipligi bilinen girdiler).");
  return 0;
}

process.exit(main());
