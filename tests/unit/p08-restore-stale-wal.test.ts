/**
 * P08/PP44 odak: restoreBackup hedef DB yanindaki eski -wal/-shm dosyalarini temizler.
 * Windows'ta hard-kill/crash sonrasi hedef konumda committed icerik yalniz -wal dosyasinda
 * kalabilir; restore stale WAL'i silmezse sonraki acilista SQLite eski icerigi geri oynatir
 * ve restore edilen backup'in birebir icerigi bozulur (unit benzeri acik sira kaniti).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createBackup, restoreBackup } from "../../src/storage/lifecycle-ops.js";

const MINIMAL_SCHEMA = `
CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
CREATE TABLE artifacts (id TEXT PRIMARY KEY, relative_store_path TEXT, sha256 TEXT, bytes INTEGER, status TEXT);
`;

describe("P08/PP44: restore stale WAL/SHM temizligi", () => {
  it("restore: hedef DB yanindaki eski -wal/-shm dosyalari restore ile kaldirilir; acilis backup icerigini verir", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p08-stalewal-"));
    try {
      const targetDb = join(dir, "state.db");
      const artifactRoot = join(dir, "artifacts");
      mkdirSync(artifactRoot, { recursive: true });

      // Iyi backup: hedef konumda schema + trusted satir; backup alindi.
      const seed = new Database(targetDb);
      seed.pragma("journal_mode = WAL");
      seed.exec(MINIMAL_SCHEMA);
      seed.prepare("INSERT INTO test_jobs (id, lifecycle) VALUES ('good-job', 'COMPLETED')").run();
      seed.prepare("INSERT INTO schema_migrations (version) VALUES (7)").run();
      seed.close();

      const backupDb = new Database(targetDb);
      const backup = await createBackup(backupDb, targetDb, artifactRoot, join(dir, "backups"));
      backupDb.close();
      expect(backup.complete).toBe(true);

      // Hard-kill benzeri stale yan dosyalar: -wal/-shm diskte var (checkpoint edilmeden kalmis).
      // Gercek SQLite WAL magic header'i ile yazilir; icerigi geri oynatma riskini temsil eder.
      const walPath = `${targetDb}-wal`;
      const shmPath = `${targetDb}-shm`;
      writeFileSync(walPath, WAL_SKELETON, "utf8");
      writeFileSync(shmPath, SHM_SKELETON, "utf8");
      expect(existsSync(walPath)).toBe(true);
      expect(existsSync(shmPath)).toBe(true);

      // restoreBackup AYNI konuma (PP44 e2e'deki live store restore'u):
      restoreBackup(backup.backup_dir, targetDb, artifactRoot);

      // Guvenli davranis: stale yan dosyalar temizlendi.
      expect(existsSync(walPath)).toBe(false);
      expect(existsSync(shmPath)).toBe(false);

      // Sonraki acilis: birebir backup icerigi (yalniz good-job; orphan yok).
      const reopened = new Database(targetDb);
      try {
        const jobs = reopened.prepare<[], { id: string }>("SELECT id FROM test_jobs").all();
        expect(jobs.map((r) => r.id)).toEqual(["good-job"]);
        expect(reopened.pragma("integrity_check", { simple: true })).toBe("ok");
      } finally {
        reopened.close();
      }
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {
        // Windows dosya kilidi
      }
    }
  });

  it("restore: farkli konuma restore stale yan dosyalarla etkilenmez; hedef dosyalar temiz", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p08-freshrestore-"));
    try {
      const targetDb = join(dir, "state.db");
      const artifactRoot = join(dir, "artifacts");
      mkdirSync(artifactRoot, { recursive: true });
      const seed = new Database(targetDb);
      seed.pragma("journal_mode = WAL");
      seed.exec(MINIMAL_SCHEMA);
      seed.prepare("INSERT INTO test_jobs (id, lifecycle) VALUES ('good-job', 'COMPLETED')").run();
      seed.close();
      const backupDb = new Database(targetDb);
      const backup = await createBackup(backupDb, targetDb, artifactRoot, join(dir, "backups"));
      backupDb.close();

      const freshDb = join(dir, "restored", "state.db");
      restoreBackup(backup.backup_dir, freshDb, join(dir, "restored", "artifacts"));
      expect(existsSync(`${freshDb}-wal`)).toBe(false);
      expect(existsSync(`${freshDb}-shm`)).toBe(false);
      const reopened = new Database(freshDb);
      try {
        expect(readFileSync(freshDb).byteLength).toBeGreaterThan(0);
        const jobs = reopened.prepare<[], { id: string }>("SELECT id FROM test_jobs").all();
        expect(jobs.map((r) => r.id)).toEqual(["good-job"]);
      } finally {
        reopened.close();
      }
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {
        // Windows dosya kilidi
      }
    }
  });
});

// Gercek SQLite WAL dosya biciminin minimal iskeleti (magic header + header alanlari);
// birebir geri oynatma riskini temsil eder, gecerli frame icermez.
const WAL_SKELETON = Buffer.alloc(32, 0);
Buffer.from("377f0682", "hex").copy(WAL_SKELETON, 0);
const SHM_SKELETON = Buffer.alloc(32768, 0);
