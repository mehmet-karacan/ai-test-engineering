import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Storage } from "../../src/storage/storage.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { CheckpointStore, type CheckpointManifest } from "../../src/orchestration/checkpoint-store.js";
import { RecoveryManager } from "../../src/orchestration/recovery-manager.js";

describe("Lease/fence (AC48/AC49)", () => {
  let dir: string;
  let dbPath: string;
  let storage: Storage;
  let jobs: JobRepository;
  let leases: LeaseManager;
  let projects: ProjectRepository;
  let jobId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-lease-"));
    dbPath = join(dir, "state.db");
    storage = new Storage({ dbPath });
    storage.migrate();
    jobs = new JobRepository(storage.db);
    leases = new LeaseManager(storage.db);
    projects = new ProjectRepository(storage.db);
    const { location } = projects.ensureLocation("C:/work/lease-project", "lease-project", null);
    jobId = jobs.createJob({ locationId: location.id, requestDigest: "digest-lease-1" }).id;
  });

  afterEach(() => {
    try {
      storage.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("ilk lease olusturulmali ve token 1 olmali", () => {
    const result = leases.acquire(jobId, "owner-1", 300000);
    expect(result.created).toBe(true);
    expect(result.lease.fencing_token).toBe(1);
  });

  it("aktif lease'de yeni owner devralir ve eski owner fence'i reddedilir (AC48)", () => {
    leases.acquire(jobId, "owner-1", 300000);
    const second = leases.acquire(jobId, "owner-2", 300000);
    expect(second.previous_owner_alive).toBe(true);
    expect(second.lease.owner_id).toBe("owner-2");
    expect(second.lease.fencing_token).toBe(2);
  });

  it("lease suresi bitince yeni owner token'la devralmali (monoton token)", () => {
    leases.acquire(jobId, "owner-1", 50);
    const manager = new LeaseManager(storage.db);
    const acquired = manager.acquire(jobId, "owner-2", 300000);
    expect(acquired.lease.owner_id).toBe("owner-2");
    expect(acquired.lease.fencing_token).toBe(2);
  });

  it("aktif lease'de yeni owner devralir; eski owner fence'i reddedilir (AC49)", () => {
    const lease1 = leases.acquire(jobId, "owner-1", 300000);
    const second = leases.acquire(jobId, "owner-2", 300000);
    expect(second.previous_owner_alive).toBe(true);
    expect(second.lease.owner_id).toBe("owner-2");
    expect(second.lease.fencing_token).toBe(2);
    expect(() => leases.assertFence(jobId, "owner-1", lease1.lease.fencing_token)).toThrow();
    try {
      leases.assertFence(jobId, "owner-1", lease1.lease.fencing_token);
    } catch (error) {
      expect((error as { details?: { reason_code?: string } }).details?.reason_code).toBe("STALE_FENCE");
    }
  });

  it("guncel fence gecmeli", () => {
    const lease = leases.acquire(jobId, "owner-1", 300000);
    leases.assertFence(jobId, "owner-1", lease.lease.fencing_token);
  });

  it("lease kaybedildiginde renew reddedilmeli", () => {
    leases.acquire(jobId, "owner-1", 300000);
    leases.acquire(jobId, "owner-2", 300000);
    expect(() => leases.renew(jobId, "owner-1", 300000)).toThrow();
  });
});

describe("Checkpoint atomic publish (AC47)", () => {
  let dir: string;
  let storage: Storage;
  let store: CheckpointStore;
  let leases: LeaseManager;
  let jobs: JobRepository;
  let projects: ProjectRepository;
  let jobId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-ckpt-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    store = new CheckpointStore(storage.db, dir);
    leases = new LeaseManager(storage.db);
    jobs = new JobRepository(storage.db);
    projects = new ProjectRepository(storage.db);
    const { location } = projects.ensureLocation("C:/work/ckpt-project", "ckpt-project", null);
    jobId = jobs.createJob({ locationId: location.id, requestDigest: "digest-ckpt-1" }).id;
  });

  afterEach(() => {
    try {
      storage.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  function manifest(generation: number, parent: string | null = null): CheckpointManifest {
    return {
      schema_version: 1,
      job_id: jobId,
      project_id: "proj-1",
      location_id: "loc-1",
      target_ids: ["t1"],
      user_goal: "coverage %90",
      source_snapshot_id: "snap-1",
      head_commit: null,
      dirty_digest: null,
      build_digest: null,
      policy_digest: null,
      parser_version: "statik-tarama-1",
      toolchain: { maven: "3.9.16" },
      accepted_changes: [],
      parent_checkpoint_id: parent,
      baseline_run_id: null,
      last_trusted_run_id: null,
      active_phase: "verification",
      next_action: "iterate",
      remaining_budget: { iterations: 10 },
      requested_model: null,
      resolved_model: null,
      worker_session_ref: null,
      generation,
      created_at: Date.now(),
    };
  }

  it("checkpoint publish edilip blob dogrulanmali", () => {
    const lease = leases.acquire(jobId, "owner-1", 300000);
    const result = store.publishCheckpoint(manifest(0), { owner_id: lease.lease.owner_id, fencing_token: lease.lease.fencing_token }, null);
    expect(result.manifest_sha256).toHaveLength(64);
    const verification = store.verifyCheckpoint(result.checkpoint_id);
    expect(verification.valid).toBe(true);
    expect(verification.manifest?.job_id).toBe(jobId);
    expect(store.bestCheckpoint(jobId)).toBe(result.checkpoint_id);
  });

  it("stale fence ile checkpoint publish reddedilmeli (AC47/AC49)", () => {
    const lease1 = leases.acquire(jobId, "owner-1", 300000);
    leases.acquire(jobId, "owner-2", 300000);
    expect(() =>
      store.publishCheckpoint(manifest(0), { owner_id: lease1.lease.owner_id, fencing_token: lease1.lease.fencing_token }, null),
    ).toThrow();
  });

  it("parent generation cakismasinda publish reddedilmeli", () => {
    const lease = leases.acquire(jobId, "owner-1", 300000);
    const first = store.publishCheckpoint(manifest(0), { owner_id: lease.lease.owner_id, fencing_token: lease.lease.fencing_token }, null);
    expect(() =>
      store.publishCheckpoint(manifest(1, first.checkpoint_id), { owner_id: lease.lease.owner_id, fencing_token: lease.lease.fencing_token }, 99),
    ).toThrow();
  });

  it("blob silinmis checkpoint kullanilmaz (BLOB_EKSIK)", () => {
    const lease = leases.acquire(jobId, "owner-1", 300000);
    const result = store.publishCheckpoint(manifest(0), { owner_id: lease.lease.owner_id, fencing_token: lease.lease.fencing_token }, null);
    const manifestPath = join(dir, "blobs", "sha256", result.manifest_sha256.slice(0, 2), result.manifest_sha256.slice(2, 4), result.manifest_sha256);
    rmSync(manifestPath, { force: true });
    const verification = store.verifyCheckpoint(result.checkpoint_id);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe("BLOB_EKSIK");
  });

  it("ikinci publish token'la devralmali; best pointer guncellenmeli", () => {
    const lease1 = leases.acquire(jobId, "owner-1", 300000);
    const first = store.publishCheckpoint(manifest(0), { owner_id: lease1.lease.owner_id, fencing_token: lease1.lease.fencing_token }, null);
    const lease2 = leases.acquire(jobId, "owner-2", 300000);
    const second = store.publishCheckpoint(manifest(1, first.checkpoint_id), { owner_id: lease2.lease.owner_id, fencing_token: lease2.lease.fencing_token }, 0);
    expect(store.bestCheckpoint(jobId)).toBe(second.checkpoint_id);
  });
});

describe("Recovery (AC45/AC46/AC48/AC51 hazirligi)", () => {
  let dir: string;
  let storage: Storage;
  let jobs: JobRepository;
  let projects: ProjectRepository;
  let leases: LeaseManager;
  let store: CheckpointStore;
  let recovery: RecoveryManager;
  let locationId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-recovery-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    jobs = new JobRepository(storage.db);
    projects = new ProjectRepository(storage.db);
    leases = new LeaseManager(storage.db);
    store = new CheckpointStore(storage.db, dir);
    recovery = new RecoveryManager(storage.db, leases, store);
    const { location } = projects.ensureLocation("C:/work/recovery-project", "recovery-project", null);
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

  it("kesinti sonrasi yarim is bulunmali ve resume planlanmali (AC45)", () => {
    const job = jobs.createJob({ locationId, requestDigest: "digest-rec-1" });
    jobs.updateLifecycle(job.id, "INTERRUPTED", 0);
    const found = recovery.findResumableJob([locationId]);
    expect(found?.id).toBe(job.id);

    const plan = recovery.planRecovery(found!, "owner-rec", { current_source_digest: null, current_build_digest: null });
    expect(plan.action).toBe("fresh_start");
    expect(plan.source_changed).toBe(false);
  });

  it("checkpoint'li kesintide resume planlanmali", () => {
    const job = jobs.createJob({ locationId, requestDigest: "digest-rec-2" });
    jobs.updateLifecycle(job.id, "INTERRUPTED", 0);
    const lease = leases.acquire(job.id, "owner-ckpt", 300000);
    const ckpt = store.publishCheckpoint(
      {
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
        next_action: "iterate",
        remaining_budget: {},
        requested_model: null,
        resolved_model: null,
        worker_session_ref: null,
        generation: 0,
        created_at: Date.now(),
      },
      { owner_id: lease.lease.owner_id, fencing_token: lease.lease.fencing_token },
      null,
    );

    const found = recovery.findResumableJob([locationId])!;
    const plan = recovery.planRecovery(found, "owner-new", { current_source_digest: null, current_build_digest: null });
    expect(plan.action).toBe("resume");
    expect(plan.checkpoint_id).toBe(ckpt.checkpoint_id);
  });

  it("kaynak degistiyse SOURCE_CHANGED ile rebaseline planlanmali (AC51)", () => {
    const job = jobs.createJob({ locationId, requestDigest: "digest-rec-3" });
    jobs.updateLifecycle(job.id, "INTERRUPTED", 0);
    const snapId = randomUUID();
    storage.db
      .prepare("INSERT INTO project_snapshots (id, location_id, parent_snapshot_id, head_commit, dirty_digest, source_manifest_artifact_id, build_digest, parser_version, created_at) VALUES (?, ?, NULL, NULL, ?, NULL, NULL, 'v1', ?)")
      .run(snapId, locationId, "eski-digest", Date.now());
    storage.db.prepare("UPDATE test_jobs SET source_snapshot_id = ? WHERE id = ?").run(snapId, job.id);

    const found = recovery.findResumableJob([locationId])!;
    const plan = recovery.planRecovery(found, "owner-rec", { current_source_digest: "yeni-digest", current_build_digest: null });
    expect(plan.action).toBe("rebaseline");
    expect(plan.source_changed).toBe(true);
    expect(plan.stale_coverage_marked).toBe(true);

    const updatedJob = jobs.getJob(job.id);
    expect(updatedJob.outcome).toBe("SOURCE_CHANGED");
  });

  it("aktif owner'in lease'i devralinir; onceki owner fence'i reddedilir (AC48/AC49)", () => {
    const job = jobs.createJob({ locationId, requestDigest: "digest-rec-4" });
    jobs.updateLifecycle(job.id, "INTERRUPTED", 0);
    const oldLease = leases.acquire(job.id, "baska-owner", 300000);
    const found = recovery.findResumableJob([locationId])!;
    const plan = recovery.planRecovery(found, "yeni-owner", { current_source_digest: null, current_build_digest: null });
    expect(plan.action).toBeDefined();
    expect(() => leases.assertFence(job.id, "baska-owner", oldLease.lease.fencing_token)).toThrow();
  });
});
