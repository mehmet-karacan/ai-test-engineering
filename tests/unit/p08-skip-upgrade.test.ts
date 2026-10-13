/**
 * P08/PP44 kalan kanit: gercek surum-atlayi upgrade/rollback e2e (yerel better-sqlite3).
 * - v1 schema DB (eski binary'nin urettigi tablolar) fiziksel olusturulur; guncel
 *   binary DB'yi acip v1->v7 migrate eder; trusted job verisi korunur (PP44).
 * - Eski binary senaryosu: v7 DB'nin migration kayitlari bozulursa (downgrade
 *   etiketi) migrate checksum uyusmazligi ile fail-closed olur (rollback yazim korumasi).
 * - Rollback: upgrade sonrasi online backup restore ile trusted veri geri gelir.
 * Gercek Windows CMD install + ayri OS process binary e2e ayri runtime kabul olarak
 * NOT_RUN kalir; burada ayni migration motorunun gercek v1->v7 zinciri kanitlanir.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Storage } from "../../src/storage/storage.js";
import { assertQuiescedForUpgrade } from "../../src/storage/lifecycle-ops.js";
import { MIGRATIONS } from "../../src/storage/migrations.js";

const TRUSTED_BLOB = Buffer.from([0x50, 0x52, 0x30, 0x38, 0xff, 0xfe, 0x01, 0x0a]);
const CHECKSUM_SLICE = 64;

function checksumOf(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex").slice(0, CHECKSUM_SLICE);
}

describe("P08/PP44: surum-atlayi upgrade (v1 DB -> guncel binary v7 migrate)", () => {
  let dir: string;
  let dbPath: string;
  let artifactRoot: string;
  let jobId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-p08-skipup-"));
    dbPath = join(dir, "state.db");
    artifactRoot = join(dir, "artifacts");
    // Eski binary'nin urettigi v1 DB: yalniz migration 1 fiziksel olarak uygulanir.
    const legacy = new Database(dbPath);
    legacy.pragma("foreign_keys = ON");
    legacy.exec(MIGRATIONS[0]!.sql);
    legacy
      .prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)")
      .run(1, checksumOf(MIGRATIONS[0]!.sql), Date.now());
    const pid = randomUUID();
    const lid = randomUUID();
    const jid = randomUUID();
    legacy
      .prepare("INSERT INTO projects (id, name, normalized_remote, identity_kind, created_at, updated_at) VALUES (?, ?, ?, 'git_remote', ?, ?)")
      .run(pid, "skipup", null, Date.now(), Date.now());
    legacy
      .prepare("INSERT INTO project_locations (id, project_id, canonical_root, platform, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, 'win32', ?, ?, ?)")
      .run(lid, pid, "C:/work/skipup", Date.now(), Date.now(), Date.now());
    legacy
      .prepare("INSERT INTO test_jobs (id, location_id, lifecycle, phase, created_at, updated_at) VALUES (?, ?, 'COMPLETED', 'final', ?, ?)")
      .run(jid, lid, Date.now(), Date.now());
    legacy.close();
    jobId = jid;
    mkdirSync(join(artifactRoot, "blobs"), { recursive: true });
    writeFileSync(join(artifactRoot, "blobs", "trusted.bin"), TRUSTED_BLOB);
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("upgrade: guncel binary v1 DB'yi v7'ye migrate eder; trusted job verisi korunur", () => {
    const upgraded = new Storage({ dbPath });
    upgraded.migrate();
    try {
      expect(upgraded.schemaVersion()).toBe(7);
      const integrity = upgraded.db.pragma("integrity_check", { simple: true });
      expect(integrity).toBe("ok");
      const versions = upgraded.db
        .prepare<[], { version: number }>("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map((r) => r.version);
      expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7]);
      const jobRow = upgraded.db.prepare<[], { lifecycle: string }>("SELECT lifecycle FROM test_jobs WHERE id = ?").get(jobId);
      expect(jobRow?.lifecycle).toBe("COMPLETED");
      // v4 frozen targets tablosu v1 verisiyle ayni DB'de olusur; eski job'a dokunulmemis:
      const targetCount = upgraded.db
        .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM job_target_concretes WHERE job_id = ?")
        .get(jobId);
      expect(targetCount?.c).toBe(0);
    } finally {
      upgraded.close();
    }
  });

  it("rollback korumasi: migration kaydi bozulmus (downgrade benzeri) DB fail-closed acilmaz", () => {
    // Once guncel binary ile v7'ye cik:
    const upgraded = new Storage({ dbPath });
    upgraded.migrate();
    upgraded.close();
    // Eski binary'nin "gormedigi" v7 kaydini boz (checksum/len uyumsuz); migrate tekrar fail-closed:
    const reopened = new Database(dbPath);
    reopened
      .prepare("UPDATE schema_migrations SET checksum = ? WHERE version = 7")
      .run("0".repeat(64));
    reopened.close();
    const guarded = new Storage({ dbPath });
    expect(() => guarded.migrate()).toThrow(/checksum uyusmazligi/);
    try {
      guarded.db.close();
    } catch {
      // zaten kapali olabilir
    }
  });

  it("rollback: upgrade sonrasi online backup restore ile trusted veri geri gelir", async () => {
    const { createBackup, restoreBackup, verifyBackup } = await import("../../src/storage/lifecycle-ops.js");
    // Upgrade: v1 -> v7:
    const upgraded = new Storage({ dbPath });
    upgraded.migrate();
    // Trusted job'u artifact'e bagla (backup pin zinciri READY blob ister):
    const artifacts = upgraded.db.prepare(
      "INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, '1', 'internal', 'READY', ?)",
    );
    const blobHash = createHash("sha256").update(TRUSTED_BLOB).digest("hex");
    artifacts.run(randomUUID(), jobId, "report", "blobs/trusted.bin", blobHash, TRUSTED_BLOB.byteLength, Date.now());
    assertQuiescedForUpgrade(upgraded.db);
    const backup = await createBackup(upgraded.db, dbPath, artifactRoot, join(dir, "backups"));
    upgraded.close();

    expect(verifyBackup(backup.backup_dir).valid).toBe(true);

    // Rollback: dogrulanmis backup'i yeni konuma restore et; trusted job + blob geri gelir.
    const restoredDb = join(dir, "restored", "state.db");
    const restoredArtifacts = join(dir, "restored", "artifacts");
    await restoreBackup(backup.backup_dir, restoredDb, restoredArtifacts);
    const restored = new Storage({ dbPath: restoredDb });
    try {
      expect(restored.schemaVersion()).toBe(7);
      const jobRow = restored.db.prepare<[], { lifecycle: string }>("SELECT lifecycle FROM test_jobs WHERE id = ?").get(jobId);
      expect(jobRow?.lifecycle).toBe("COMPLETED");
      const restoredBlob = restored.db
        .prepare<[], { relative_store_path: string; sha256: string; bytes: number }>("SELECT relative_store_path, sha256, bytes FROM artifacts WHERE job_id = ?")
        .get(jobId);
      expect(restoredBlob?.sha256).toBe(blobHash);
      const restoredBytes = readFileSync(join(restoredArtifacts, "blobs", "trusted.bin"));
      expect(restoredBytes.equals(TRUSTED_BLOB)).toBe(true);
    } finally {
      restored.close();
    }
  });
});
