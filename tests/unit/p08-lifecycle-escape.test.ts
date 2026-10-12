/**
 * P08/PP39-PP44 odak: lifecycle-ops path-escape kontrolu capraz surucu (cross-drive)
 * manifest'te kacisir. Windows'ta relative() ortak kok yoksa tamamen mutlak yol
 * dondurdugu icin "D:\evil" gibi bir hedef ".." ile baslamaz ve mevcut
 * startsWith(".."+sep) kontrolu kacisi yakalayamaz; verifyBackup valid=true
 * uretebilir. Test Windows ve Linux'ta ayni semantiyi dogrular.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { verifyBackup } from "../../src/storage/lifecycle-ops.js";

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Capraz surucu manifestini simule eder: backup koku C surucusunde, manifest
 * blob yolu baska surucuye isaret eder (Windows'ta D:, Linux'ta /tmp altinda
 * farkli kok). relative() ortak kok bulamazsa mutlak yol dondurur; escape
 * kontrolunun bunu yakalamasi gerekir.
 */
function crossDriveEscapeTarget(backupDir: string): { relative_path: string; expectedTarget: string } {
  if (process.platform === "win32") {
    // C disindaki surucu harfi: mevcut sistemde baska surucu yoksa bile
    // relative() ayni surucude baska kokle de kacisi gosterir (tam mutlak yol).
    return { relative_path: "Z:/aitest-evil/blob", expectedTarget: resolve(backupDir, "blobs", "Z:/aitest-evil/blob") };
  }
  return { relative_path: "/aitest-evil/blob", expectedTarget: resolve(backupDir, "blobs", "/aitest-evil/blob") };
}

describe("P08: lifecycle-ops path-escape kontrolu (cross-drive/kok disi manifest)", () => {
  it("verifyBackup: manifest blob yolu backup kokune containment kontroluyle kacmazsa valid=false", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p08-escape-"));
    try {
      const backupDir = join(dir, "backup");
      mkdirSync(join(backupDir, "blobs"), { recursive: true });
      // Gercek state.db (schema_ok icin minimal tablolar):
      const db = new Database(join(backupDir, "state.db"));
      db.pragma("journal_mode = WAL");
      db.exec("CREATE TABLE test_jobs (id TEXT PRIMARY KEY); CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);");
      db.exec("CREATE TABLE artifacts (relative_store_path TEXT, sha256 TEXT, bytes INTEGER, status TEXT);");
      db.prepare("INSERT INTO artifacts VALUES (?, ?, ?, 'READY')").run("blobs/iceride-blob", sha256("ok"), 2);
      db.close();
      writeFileSync(join(backupDir, "blob-manifest.json"), JSON.stringify({
        schema_version: 1,
        backup_id: "escape-test",
        blobs: [{ relative_path: "blobs/iceride-blob", sha256: sha256("ok"), bytes: 2 }],
      }));

      writeFileSync(join(backupDir, "complete.json"), JSON.stringify({ schema_version: 1, backup_id: "escape-test", complete: true }));
      // createBackup manifest'i artifactRoot'a gore yazip blob'u backupDir/blobs/<relative> altina kopyalar;
      // verifyBackup ayni birlesimi kullandigi icin fixture blob dogru kopya konumuna yazilir:
      mkdirSync(join(backupDir, "blobs", "blobs"), { recursive: true });
      writeFileSync(join(backupDir, "blobs", "blobs", "iceride-blob"), "ok", "utf8");

      const inside = verifyBackup(backupDir);
      expect(inside.valid).toBe(true);

      // Kirmizi kanit: kok disi (cross-drive/mutlak) manifest blob yolu valid uretememeli.
      const evil = crossDriveEscapeTarget(backupDir);
      const relativeBlob = evil.relative_path.replace(/\//g, sep);
      const copiedPath = resolve(join(backupDir, "blobs"), relativeBlob);
      const blobRoot = resolve(join(backupDir, "blobs"));
      const rel = relative(blobRoot, copiedPath);
      // Eski kontrol gercekten kaciriyor mu (Windows'ta mutlak yol ".." ile baslamaz):
      const oldCheckWouldMiss = !(rel.startsWith(`..${sep}`) || rel === "..");
      // POSIX'te farkli kok ../ ile doner; eski kontrol bu durumda zaten reddeder.
      expect(oldCheckWouldMiss).toBe(process.platform === "win32");

      writeFileSync(join(backupDir, "blob-manifest.json"), JSON.stringify({
        schema_version: 1,
        backup_id: "escape-test",
        blobs: [{ relative_path: evil.relative_path, sha256: sha256("kotu"), bytes: 4 }],
      }));
      const escaped = verifyBackup(backupDir);
      expect(escaped.valid).toBe(false);
      expect(escaped.blob_check_ok).toBe(false);
      expect(escaped.missing_blobs).toContain(evil.relative_path);
      // Kacis hedefi diske yazilmamali:
      expect(existsSync(evil.expectedTarget)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
