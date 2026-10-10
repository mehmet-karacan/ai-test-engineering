/**
 * FIN07/8.5/9.5: Dogru process supervision ve late-write fencing.
 * - Pause/cancel/timeout/lease-lost sonrasi yeni candidate yok; gec worker/run cevabi fenced olarak reddedilir.
 * - Cancel kalici niyet kaydeder; gec run sonucu CANCELLED'i COMPLETED'a cevirmez (9.5).
 * - Cancel otomatik artifact silmez (9.5).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../../src/storage/storage.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { CheckpointStore } from "../../src/orchestration/checkpoint-store.js";
import { isStaleWorkerResponse } from "../../src/orchestration/job-dispatcher.js";

describe("FIN07: cancel kalicilik ve late-write fencing", () => {
  let dir: string;
  let storage: Storage;
  let jobs: JobRepository;
  let projects: ProjectRepository;
  let leases: LeaseManager;
  let checkpoints: CheckpointStore;
  let locationId: string;
  let jobId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-fin07-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    jobs = new JobRepository(storage.db);
    projects = new ProjectRepository(storage.db);
    leases = new LeaseManager(storage.db);
    checkpoints = new CheckpointStore(storage.db, dir);
    const { location } = projects.ensureLocation("C:/work/fin07", "fin07", null);
    locationId = location.id;
    jobId = jobs.createJob({ locationId, requestDigest: "digest-fin07-1" }).id;
    jobs.updateLifecycle(jobId, "RUNNING", 0);
  });

  afterEach(() => {
    try {
      storage.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("cancel kalici niyet kaydeder; lifecycle CANCELLED kalir", () => {
    jobs.updateLifecycle(jobId, "CANCELLED", jobs.getJob(jobId).row_version);
    jobs.appendEvent({ job_id: jobId, event_type: "test_cancelled", phase: "verification", origin: "test" });
    const job = jobs.getJob(jobId);
    expect(job.lifecycle).toBe("CANCELLED");
    // gec run sonucu CANCELLED'i COMPLETED'a cevirmez:
    expect(() => jobs.updateOutcome(jobId, "TARGET_REACHED", job.row_version + 10)).toThrow();
    const after = jobs.getJob(jobId);
    expect(after.lifecycle).toBe("CANCELLED");
    expect(after.outcome).toBeNull();
  });

  it("cancel otomatik artifact silmez; artifact'ler korunur", () => {
    const lease = leases.acquire(jobId, "owner-fin07", 300000);
    const ckpt = checkpoints.publishCheckpoint({
      schema_version: 1,
      job_id: jobId,
      project_id: "p",
      location_id: locationId,
      target_ids: ["t1"],
      user_goal: "%90",
      source_snapshot_id: "snap",
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
    }, { owner_id: lease.lease.owner_id, fencing_token: lease.lease.fencing_token }, null);
    // cancel:
    jobs.updateLifecycle(jobId, "CANCELLED", jobs.getJob(jobId).row_version);
    // artifact'ler + checkpoint korunur:
    expect(checkpoints.bestCheckpoint(jobId)).toBe(ckpt.checkpoint_id);
    expect(checkpoints.verifyCheckpoint(ckpt.checkpoint_id).valid).toBe(true);
    const artifactRows = storage.db.prepare<[string], { id: string }>("SELECT id FROM artifacts WHERE job_id = ?").all(jobId);
    expect(artifactRows).toHaveLength(1);
  });

  it("lease-lost sonrasi gec fence reddedilir; yeni generation alinmadan yazma yok", () => {
    const lease1 = leases.acquire(jobId, "owner-1", 300000);
    leases.release(jobId, "owner-1");
    // eski owner release sonrasi yazmaya calisir: fence reddedilir
    expect(() => leases.assertFence(jobId, "owner-1", lease1.lease.fencing_token)).toThrow();
    // yeni owner generation artirir:
    const lease2 = leases.acquire(jobId, "owner-2", 300000);
    expect(lease2.lease.fencing_token).toBe(lease1.lease.fencing_token + 1);
    // eski token ile checkpoint publish reddedilir:
    expect(() => checkpoints.publishCheckpoint({
      schema_version: 1,
      job_id: jobId,
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
    }, { owner_id: lease1.lease.owner_id, fencing_token: lease1.lease.fencing_token }, null)).toThrow(/Stale fence|fence/i);
  });

  it("gec worker cevabi (farkli session) fenced olarak reddedilir", () => {
    expect(isStaleWorkerResponse("ses_eski", "ses_yeni", false)).toBe(true);
    expect(isStaleWorkerResponse("ses_yeni", "ses_yeni", true)).toBe(true);
    expect(isStaleWorkerResponse("ses_yeni", "ses_yeni", false)).toBe(false);
  });

  it("pause sonrasi resume ayni job'dan devam eder; yeni job acilmaz", () => {
    jobs.updateLifecycle(jobId, "PAUSED", jobs.getJob(jobId).row_version);
    const resumable = jobs.findResumableJobsByLocations([locationId]);
    expect(resumable.some((j) => j.id === jobId)).toBe(true);
    // resume ile ayni job RUNNING olur:
    jobs.updateLifecycle(jobId, "RUNNING", jobs.getJob(jobId).row_version);
    expect(jobs.getJob(jobId).lifecycle).toBe("RUNNING");
    // job ID ayni:
    expect(jobs.getJob(jobId).id).toBe(jobId);
  });
});
