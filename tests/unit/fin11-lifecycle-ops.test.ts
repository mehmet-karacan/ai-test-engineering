/**
 * FIN11: Surum yasam dongusu - backup/restore, upgrade quiesce, owned uninstall.
 * - Online SQLite backup API + blob manifest birlikte (18.5); sadece .db kopyasi tam backup degil.
 * - Restore ayri konumda dogrulanir (FK/integrity/blob); eksik/bozuk blob PASSED degil.
 * - Owned uninstall: yalniz beklenen hash'teki girdiler; user modified korunur (18.2).
 * - Upgrade quiesce: aktif job varken binary/schema degistirilmez (18.4).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../../src/storage/storage.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";
import { createBackup, verifyBackup, ownedUninstall, assertQuiescedForUpgrade } from "../../src/storage/lifecycle-ops.js";

describe("FIN11: backup/restore gercek zinciri (18.5)", () => {
  let dir: string;
  let storage: Storage;
  let artifacts: ArtifactStore;
  let jobs: JobRepository;
  let locationId: string;
  let artifactRoot: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "aitest-fin11-"));
    artifactRoot = join(dir, "artifacts");
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    artifacts = new ArtifactStore({ root: artifactRoot });
    jobs = new JobRepository(storage.db);
    const projects = new ProjectRepository(storage.db);
    const { location } = projects.ensureLocation("C:/work/fin11", "fin11", null);
    locationId = location.id;
  });

  afterEach(() => {
    try {
      storage.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("backup DB snapshot + blob manifest birlikte sabitlenir; complete marker dogru", async () => {
    // job + artifact uret:
    const job = jobs.createJob({ locationId, requestDigest: "digest-fin11-1" });
    jobs.updateLifecycle(job.id, "COMPLETED", 0);
    const record = artifacts.publish("report", "rapor-icerigi");
    storage.db
      .prepare("INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, '1', 'internal', 'READY', ?)")
      .run(record.id, job.id, record.kind, record.relativeStorePath, record.sha256, record.bytes, Date.now());

    const backup = await createBackup(storage.db, join(dir, "state.db"), artifactRoot, join(dir, "backups"));
    expect(backup.complete).toBe(true);
    expect(backup.blob_count).toBe(1);
    expect(existsSync(backup.db_path)).toBe(true);
    expect(existsSync(backup.blob_manifest_path)).toBe(true);

    // restore verification gecer:
    const verification = verifyBackup(backup.backup_dir);
    expect(verification.valid).toBe(true);
    expect(verification.schema_ok).toBe(true);
    expect(verification.integrity_ok).toBe(true);
    expect(verification.blob_check_ok).toBe(true);
  }, 60000);

  it("restored runtime'da eski job'un result'i goruntulenir; veri kaybi yok (18.5)", async () => {
    const job = jobs.createJob({ locationId, requestDigest: "digest-fin11-2" });
    jobs.updateLifecycle(job.id, "COMPLETED", 0);
    const record = artifacts.publish("report", "persisted-rapor");
    storage.db
      .prepare("INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, '1', 'internal', 'READY', ?)")
      .run(record.id, job.id, record.kind, record.relativeStorePath, record.sha256, record.bytes, Date.now());

    const backup = await createBackup(storage.db, join(dir, "state.db"), artifactRoot, join(dir, "backups"));
    // restore edilen DB'de ayni job + lineage:
    const restored = new Storage({ dbPath: backup.db_path });
    try {
      const restoredJobs = new JobRepository(restored.db);
      const reloaded = restoredJobs.getJob(job.id);
      expect(reloaded.lifecycle).toBe("COMPLETED");
      expect(reloaded.request_digest).toBe("digest-fin11-2");
    } finally {
      restored.close();
    }
  }, 60000);
});

describe("FIN11: upgrade quiesce + owned uninstall (18.4/18.2)", () => {
  let dir: string;
  let storage: Storage;
  let jobs: JobRepository;
  let locationId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-fin11-ops-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    jobs = new JobRepository(storage.db);
    const projects = new ProjectRepository(storage.db);
    const { location } = projects.ensureLocation("C:/work/fin11ops", "fin11ops", null);
    locationId = location.id;
  });

  afterEach(() => {
    try {
      storage.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("aktif job varken upgrade reddedilir (quiesce gate)", () => {
    const job = jobs.createJob({ locationId, requestDigest: "digest-q1" });
    jobs.updateLifecycle(job.id, "RUNNING", 0);
    expect(() => assertQuiescedForUpgrade(storage.db)).toThrow(/Aktif job/);
    // quiesce sonrasi upgrade:
    jobs.updateLifecycle(job.id, "PAUSED", jobs.getJob(job.id).row_version);
    // PAUSED hala resumable; QUEUED/RUNNING/APPLYING gate kapsami degil:
    expect(() => assertQuiescedForUpgrade(storage.db)).not.toThrow();
  });

  it("bos aktif job durumunda upgrade gecer", () => {
    expect(() => assertQuiescedForUpgrade(storage.db)).not.toThrow();
  });

  it("owned uninstall: yalniz beklenen hash'teki girdiler kaldirilir; user modified korunur", () => {
    const manifestPath = join(dir, "install-manifest.json");
    const ownedFileA = join(dir, "file-a.json");
    const ownedFileB = join(dir, "file-b.json");
    writeFileSync(ownedFileA, "icerik-a", "utf8");
    writeFileSync(ownedFileB, "icerik-b", "utf8");
    writeFileSync(manifestPath, JSON.stringify({
      schema_version: 1,
      owned_files: [
        { path: ownedFileA, sha256: require("node:crypto").createHash("sha256").update("icerik-a").digest("hex") },
        { path: ownedFileB, sha256: "eski-hash-degisti" },
      ],
    }), "utf8");

    const decision = ownedUninstall(manifestPath);
    expect(decision.removed).toHaveLength(1);
    expect(decision.removed[0]!.path).toBe(ownedFileA);
    expect(existsSync(ownedFileA)).toBe(false);
    // user modified (hash uyusmuyor): korunur
    expect(decision.preserved).toHaveLength(1);
    expect(decision.preserved[0]!.path).toBe(ownedFileB);
    expect(decision.preserved[0]!.reason).toContain("USER_MODIFIED");
    expect(existsSync(ownedFileB)).toBe(true);
  });

  it("kurulum manifest yoksa uninstall hicbir sey silmez", () => {
    const decision = ownedUninstall(join(dir, "yok-manifest.json"));
    expect(decision.removed).toHaveLength(0);
    expect(decision.preserved.some((p) => p.reason === "KURULUM_MANIFEST_YOK")).toBe(true);
  });
});
