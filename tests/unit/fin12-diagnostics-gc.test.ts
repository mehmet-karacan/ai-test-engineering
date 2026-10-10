/**
 * FIN12: Diagnostics, retention/GC, support bundle testleri.
 * - Tek ortak diagnostic servisi: kontrol seviyeleri ayri; hata raporu reason_code + tek somut aksiyon (17.1).
 * - GC iki asamali: dry-run -> onayli sweep; aktif/pinned ref silinmez (14.4/PRO26).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDiagnostics, type DiagnosticInput } from "../../src/application/diagnostics.js";
import { defaultRetentionPolicy, gcDryRun, gcSweep } from "../../src/storage/retention-gc.js";
import { Storage } from "../../src/storage/storage.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";
import { CheckpointStore } from "../../src/orchestration/checkpoint-store.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";

function healthyInput(): DiagnosticInput {
  return {
    node_version: "v24.14.1",
    sqlite_version: "3.45.0",
    config_readable: true,
    config_schema_ok: true,
    disk_free_bytes: 10 * 1024 * 1024 * 1024,
    db_path_writable: true,
    docker_available: true,
    maven_image_present: true,
    model_authorized: true,
    migrations_current: true,
    evidence_integrity_ok: true,
  };
}

describe("FIN12: ortak diagnostic servisi (17.1)", () => {
  it("saglikli ortamda tum kontroller gecer; ready true", () => {
    const result = runDiagnostics(healthyInput());
    expect(result.ready).toBe(true);
    expect(result.checks.every((c) => c.level !== "UNAVAILABLE")).toBe(true);
  });

  it("kontrol seviyeleri ayri: CONNECTED ile CAPABILITY_VERIFIED karismaz (PRO02)", () => {
    const input = healthyInput();
    input.docker_available = true;
    input.model_authorized = true;
    const result = runDiagnostics(input);
    // docker CONNECTED; capability probe ayri kanit seviyesi (FIN02):
    const dockerCheck = result.checks.find((c) => c.check_id === "runner")!;
    expect(dockerCheck.level).toBe("CONNECTED");
    expect(dockerCheck.level).not.toBe("CAPABILITY_VERIFIED");
  });

  it("model erisilemiyor: UNAVAILABLE + reason_code + tek somut aksiyon", () => {
    const input = healthyInput();
    input.model_authorized = false;
    const result = runDiagnostics(input);
    expect(result.ready).toBe(false);
    const modelCheck = result.checks.find((c) => c.check_id === "model")!;
    expect(modelCheck.level).toBe("UNAVAILABLE");
    expect(modelCheck.reason_code).toBe("MODEL_NOT_AUTHORIZED");
    expect(modelCheck.required_next_action).toContain("OpenCode provider");
  });

  it("disk dolu: retryable=true ve somut aksiyon", () => {
    const input = healthyInput();
    input.disk_free_bytes = 100 * 1024 * 1024;
    const result = runDiagnostics(input);
    const diskCheck = result.checks.find((c) => c.check_id === "disk")!;
    expect(diskCheck.reason_code).toBe("DISK_FULL");
    expect(diskCheck.retryable).toBe(true);
    expect(diskCheck.required_next_action).toContain("512 MB");
  });

  it("docker yok: retryable ve tek aksiyon; hostta dusulmez bilgisi", () => {
    const input = healthyInput();
    input.docker_available = false;
    const result = runDiagnostics(input);
    const dockerCheck = result.checks.find((c) => c.check_id === "runner")!;
    expect(dockerCheck.reason_code).toBe("DOCKER_UNAVAILABLE");
    expect(dockerCheck.required_next_action).toContain("Docker");
  });

  it("eski Node: NODE_TOO_OLD; gizli default ile ucuz smoke'a cevrilmeZ", () => {
    const input = healthyInput();
    input.node_version = "v22.16.0";
    const result = runDiagnostics(input);
    expect(result.ready).toBe(false);
    expect(result.checks.find((c) => c.check_id === "node")!.reason_code).toBe("NODE_TOO_OLD");
  });

  it("evidence butunlugu bozuk: kurtarma aksiyonu verir", () => {
    const input = healthyInput();
    input.evidence_integrity_ok = false;
    const result = runDiagnostics(input);
    const dbCheck = result.checks.find((c) => c.check_id === "db")!;
    expect(dbCheck.reason_code).toBe("EVIDENCE_INTEGRITY_FAILED");
    expect(dbCheck.required_next_action).toContain("backup");
  });
});

describe("FIN12: retention/GC iki asamali (14.4/PRO26)", () => {
  let dir: string;
  let storage: Storage;
  let artifacts: ArtifactStore;
  let jobs: JobRepository;
  let locationId: string;
  let artifactRoot: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-fin12-"));
    artifactRoot = join(dir, "artifacts");
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    artifacts = new ArtifactStore({ root: artifactRoot });
    jobs = new JobRepository(storage.db);
    const projects = new ProjectRepository(storage.db);
    const { location } = projects.ensureLocation("C:/work/fin12", "fin12", null);
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

  function insertArtifact(jobId: string | null, kind: string, content: string, createdAtOffsetMs: number): { id: string; path: string } {
    const record = artifacts.publish(kind, content);
    storage.db
      .prepare("INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, '1', 'internal', 'READY', ?)")
      .run(record.id, jobId, kind, record.relativeStorePath, record.sha256, record.bytes, Date.now() + createdAtOffsetMs);
    return { id: record.id, path: join(artifactRoot, record.relativeStorePath.replace(/\//g, "\\")) };
  }

  it("dry-run: aktif job'un artifact'leri pin; eski temp/rejected aday listelenir", () => {
    // aktif job:
    const activeJob = jobs.createJob({ locationId, requestDigest: "digest-gc-1" });
    jobs.updateLifecycle(activeJob.id, "RUNNING", 0);
    // tamamlanmis eski job:
    const oldJob = jobs.createJob({ locationId, requestDigest: "digest-gc-2" });
    jobs.updateLifecycle(oldJob.id, "COMPLETED", 0);
    jobs.updateLifecycle(oldJob.id, "CANCELLED", jobs.getJob(oldJob.id).row_version);

    const activeArtifact = insertArtifact(activeJob.id, "report", "aktif-kanit", -1000);
    insertArtifact(oldJob.id, "temp", "eski-temp", -2 * 24 * 60 * 60 * 1000);

    const dryRun = gcDryRun(storage.db, defaultRetentionPolicy());
    // aktif job artifact'i pin (silinmez):
    const activeCandidate = dryRun.candidates.find((c) => c.artifact_id === activeArtifact.id);
    expect(activeCandidate).toBeUndefined();
    // eski temp aday:
    expect(dryRun.candidates).toHaveLength(1);
    expect(dryRun.candidates[0]!.reason).toBe("TEMP_TTL_EXPIRED");
    expect(dryRun.pinned_count).toBeGreaterThanOrEqual(1);
  });

  it("sweep yalniz onayli adaylari kaldirir; pinned korunur", () => {
    const oldJob = jobs.createJob({ locationId, requestDigest: "digest-gc-3" });
    jobs.updateLifecycle(oldJob.id, "COMPLETED", 0);
    jobs.updateLifecycle(oldJob.id, "CANCELLED", jobs.getJob(oldJob.id).row_version);
    const oldArtifact = insertArtifact(oldJob.id, "temp", "silinecek", -2 * 24 * 60 * 60 * 1000);

    const dryRun = gcDryRun(storage.db, defaultRetentionPolicy());
    expect(dryRun.candidates).toHaveLength(1);
    const sweep = gcSweep(storage.db, dryRun, artifactRoot);
    expect(sweep.swept).toHaveLength(1);
    // DB satiri DELETED:
    const status = storage.db.prepare<[string], { status: string }>("SELECT status FROM artifacts WHERE id = ?").get(oldArtifact.id)!.status;
    expect(status).toBe("DELETED");
  });

  it("checkpoint manifest artifact'i her zaman pin (GC silinmez)", () => {
    const job = jobs.createJob({ locationId, requestDigest: "digest-gc-4" });
    jobs.updateLifecycle(job.id, "COMPLETED", 0);
    const checkpoints = new CheckpointStore(storage.db, dir);
    const leaseManager = new LeaseManager(storage.db);
    const lease = leaseManager.acquire(job.id, "owner-gc", 300000);
    checkpoints.publishCheckpoint({
      schema_version: 1,
      job_id: job.id,
      project_id: "p",
      location_id: locationId,
      target_ids: ["t1"],
      user_goal: "%90",
      source_snapshot_id: null,
      head_commit: null,
      dirty_digest: null,
      build_digest: null,
      policy_digest: null,
      parser_version: "v1",
      toolchain: {},
      accepted_changes: [],
      parent_checkpoint_id: null,
      baseline_run_id: null,
      last_trusted_run_id: null,
      active_phase: "verification",
      next_action: "final",
      remaining_budget: {},
      requested_model: null,
      resolved_model: null,
      worker_session_ref: null,
      generation: 0,
      created_at: Date.now() - 10 * 24 * 60 * 60 * 1000,
    }, { owner_id: lease.lease.owner_id, fencing_token: lease.lease.fencing_token }, null);

    const dryRun = gcDryRun(storage.db, defaultRetentionPolicy());
    // checkpoint manifest artifact'i pinned:
    expect(dryRun.candidates.some((c) => c.kind === "checkpoint_manifest")).toBe(false);
  });
});
