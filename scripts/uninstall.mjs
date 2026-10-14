/**
 * Node.js kaldirma: yalniz urunun sahipligi bilinen kaydini kaldirir.
 * cmd.exe uzerinden: node scripts/uninstall.mjs
 */
import { existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// K08/B07: fileURLToPath - percent encoding/bosluk/Unicode dogru fiziksel path verir (E02).
const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), "..");

async function main() {
  // K01/K03: desteklenmeyen platformda ownership/uninstall islemi calistirilmaz.
  // Bu guard, dist veya OpenCode config'ine dokunulmadan once uygulanir.
  if (process.platform !== "win32") {
    console.error("[uninstall] BLOCKED: Windows native kaldirma yalniz Windows'ta desteklenir");
    return 2;
  }
  // Dist/config imports are deliberately after the platform guard. A clean
  // non-Windows checkout must fail closed without loading a missing build.
  const { removeConfigRecord } = await import("../dist/configuration/config-merge.js");
  const { resolveOpenCodeConfigPath, resolveRuntimeRoot } = await import("../dist/configuration/runtime-paths.js");
  const { ownedUninstall } = await import("../dist/storage/lifecycle-ops.js");
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

main().then((code) => process.exit(code)).catch((error) => {
  console.error(`[uninstall] beklenmeyen hata: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
