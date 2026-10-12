/**
 * P08/PP44: upgrade/migration/restore son trusted job, config ve veriyi korur.
 * - Upgrade (yeni binary/process) DB'yi acip migrate calistirdiginda mevcut
 *   last trusted job/artifact/veri kaybolmaz (migration IF NOT EXISTS idempotent).
 * - Aktif job varken upgrade quiesce gate'i reddeder; quiesce sonrasinda veri korunur.
 * Gercek Windows/ Linux binary upgrade e2e ayri runtime kanitidir; burada
 * migration re-open + restore veri korunumu yerel olarak kanitlanir.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../../src/storage/storage.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";
import { assertQuiescedForUpgrade } from "../../src/storage/lifecycle-ops.js";

describe("P08/PP44: upgrade/migration veri korunumu", () => {
  let dir: string;
  let dbPath: string;
  let artifactRoot: string;
  let locationId: string;
  let jobId: string;
  let artifactPath: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "aitest-p08-upgrade-"));
    dbPath = join(dir, "state.db");
    artifactRoot = join(dir, "artifacts");
    const storage = new Storage({ dbPath });
    storage.migrate();
    const jobs = new JobRepository(storage.db);
    const projects = new ProjectRepository(storage.db);
    const artifacts = new ArtifactStore({ root: artifactRoot });
    const { location } = projects.ensureLocation("C:/work/upgrade", "upgrade", null);
    locationId = location.id;
    const job = jobs.createJob({ locationId, requestDigest: "digest-upgrade-1" });
    jobs.updateOutcome(job.id, "TARGET_REACHED", 0);
    jobs.updateLifecycle(job.id, "COMPLETED", jobs.getJob(job.id).row_version);
    jobId = job.id;
    const record = artifacts.publish("report", "son-trusted-rapor-icerigi");
    storage.db
      .prepare("INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, '1', 'internal', 'READY', ?)")
      .run(record.id, job.id, record.kind, record.relativeStorePath, record.sha256, record.bytes, Date.now());
    artifactPath = record.relativeStorePath;
    storage.close();
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("upgrade: yeni process DB'yi acip migrate calistirdiginda last trusted job/artifact korunur", () => {
    // Onceki binary versiyonunun urettigi schema surumu:
    const before = new Storage({ dbPath });
    const beforeVersion = before.schemaVersion();
    before.close();

    // Upgrade: yeni process DB'yi acar ve migrate calistirir (yeni binary varsayimi).
    const upgraded = new Storage({ dbPath });
    upgraded.migrate();
    try {
      // Migration idempotent: surum dusmez/degismez, veri kaybolmaz.
      expect(upgraded.schemaVersion()).toBe(beforeVersion);
      const integrity = upgraded.db.pragma("integrity_check", { simple: true });
      expect(integrity).toBe("ok");
      const jobs = new JobRepository(upgraded.db);
      const reloaded = jobs.getJob(jobId);
      expect(reloaded.lifecycle).toBe("COMPLETED");
      expect(reloaded.outcome).toBe("TARGET_REACHED");
      expect(reloaded.request_digest).toBe("digest-upgrade-1");
      // Son trusted artifact blob upgrade sonrasi da yerinde.
      expect(readFileSync(join(artifactRoot, artifactPath), "utf8")).toBe("son-trusted-rapor-icerigi");
      const artifactRows = upgraded.db
        .prepare<[], { status: string }>("SELECT status FROM artifacts WHERE job_id = ?")
        .all(jobId);
      expect(artifactRows.some((r) => r.status === "READY")).toBe(true);
    } finally {
      upgraded.close();
    }
  });

  it("upgrade quiesce: aktif job varken migrate/upgrade reddedilir, veri bozulmaz", () => {
    const storage = new Storage({ dbPath });
    storage.migrate();
    const jobs = new JobRepository(storage.db);
    // Yeni bir aktif job: upgrade oncesi quiesce gerekli.
    const active = jobs.createJob({ locationId, requestDigest: "digest-active" });
    jobs.updateLifecycle(active.id, "RUNNING", 0);
    expect(() => assertQuiescedForUpgrade(storage.db)).toThrow(/Aktif job/);
    // Reddedilen upgrade veriye dokunmaz: onceki last trusted job korunur.
    expect(jobs.getJob(jobId).lifecycle).toBe("COMPLETED");
    // Quiesce (pause) sonrasinda upgrade gecer.
    jobs.updateLifecycle(active.id, "PAUSED", jobs.getJob(active.id).row_version);
    expect(() => assertQuiescedForUpgrade(storage.db)).not.toThrow();
    expect(jobs.getJob(jobId).outcome).toBe("TARGET_REACHED");
    storage.close();
  });

  it("restore: upgrade sonrasi backup DB'sinden son trusted job geri gelir (veri kaybi yok)", async () => {
    const { createBackup, restoreBackup } = await import("../../src/storage/lifecycle-ops.js");
    const storage = new Storage({ dbPath });
    storage.migrate();
    const backup = await createBackup(storage.db, dbPath, artifactRoot, join(dir, "backups"));
    storage.close();

    const restoredDb = join(dir, "restored", "state.db");
    const restoredArtifacts = join(dir, "restored", "artifacts");
    restoreBackup(backup.backup_dir, restoredDb, restoredArtifacts);
    const restored = new Storage({ dbPath: restoredDb });
    try {
      expect(restored.schemaVersion()).toBeGreaterThanOrEqual(7);
      const jobs = new JobRepository(restored.db);
      expect(jobs.getJob(jobId).lifecycle).toBe("COMPLETED");
      expect(jobs.getJob(jobId).outcome).toBe("TARGET_REACHED");
      expect(existsSync(join(restoredArtifacts, artifactPath))).toBe(true);
    } finally {
      restored.close();
    }
  });
});
