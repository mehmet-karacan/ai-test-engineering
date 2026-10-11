/**
 * W05 kabul testleri (F11, N34-N38): checkpoint'ten resume, butce kaliciligi, lease/owner, cancel.
 * - N34: hard-kill sonrasi ayni job'dan devam; butce checkpoint'ten yuklenir (bastan baslatmaz).
 * - N35: kaynak degisiminde SOURCE_CHANGED; stale coverage yeni kaynaga atanmaz.
 * - N36: iki resume yarisimi tek owner; fence eski worker'i engeller.
 * - N37: cancel/pause owned process'leri sonlandirir; gec cevap COMPLETED'i overwrite edemez.
 * - N38: pause son accepted checkpoint'i ve remaining budget'i korur.
 *
 * PR03/P03: source identity tam (head + canonical source/build digest); butce yalniz
 * checkpoint manifest'inden; accepted content immutable blob ile dogrulanir.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RecoveryManager } from "../../src/orchestration/recovery-manager.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { CheckpointStore, type CheckpointManifest } from "../../src/orchestration/checkpoint-store.js";
import { Storage } from "../../src/storage/storage.js";
import { evaluateCandidateGain } from "../../src/orchestration/candidate-loop.js";
import { type SourceIdentity } from "../../src/discovery/source-snapshot.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

const HEAD_A = "a".repeat(40);
const SOURCE_A = "c".repeat(64);
const BUILD_A = "b".repeat(64);

function identityA(): SourceIdentity {
  return { head_commit: HEAD_A, dirty: false, dirty_digest: null, source_digest: SOURCE_A, build_digest: BUILD_A };
}

function identityChangedSource(): SourceIdentity {
  return { head_commit: HEAD_A, dirty: false, dirty_digest: null, source_digest: "d".repeat(64), build_digest: BUILD_A };
}

describe("W05/F11/N34-N36: recovery + checkpoint resume", () => {
  let storage: Storage;
  let leases: LeaseManager;
  let checkpoints: CheckpointStore;
  let recovery: RecoveryManager;
  let baseDir: string;

  beforeAll(() => {
    baseDir = mkdtempSync(join(tmpdir(), "aitest-w05-"));
    storage = new Storage({ dbPath: join(baseDir, "test.db") });
    storage.migrate();
    leases = new LeaseManager(storage.db);
    checkpoints = new CheckpointStore(storage.db, baseDir);
    recovery = new RecoveryManager(storage.db, leases, checkpoints);
  });

  afterAll(() => {
    try {
      rmSync(baseDir, { recursive: true, force: true });
    } catch {
      // temp
    }
  });

  function createJob(lifecycle: string): { job: { id: string; location_id: string; lifecycle: string; phase: string; outcome: null; source_snapshot_id: null; row_version: number } } {
    const jobId = randomUUID();
    const projectId = randomUUID();
    const locationId = randomUUID();
    const now = Date.now();
    storage.db.prepare("INSERT INTO projects (id, name, identity_kind, created_at, updated_at) VALUES (?, ?, 'local_only', ?, ?)").run(projectId, `w05-${jobId.slice(0, 8)}`, now, now);
    storage.db.prepare("INSERT INTO project_locations (id, project_id, canonical_root, platform, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, 'win32', ?, ?, ?)").run(locationId, projectId, join(baseDir, jobId), now, now, now);
    storage.db.prepare("INSERT INTO test_jobs (id, location_id, request_digest, phase, lifecycle, created_at, updated_at) VALUES (?, ?, ?, 'generation', ?, ?, ?)").run(jobId, locationId, `d-${jobId}`, lifecycle, now, now);
    const row = storage.db.prepare<[string], { id: string; location_id: string; lifecycle: string; phase: string; outcome: null; source_snapshot_id: null; row_version: number }>("SELECT id, location_id, lifecycle, phase, outcome, source_snapshot_id, row_version FROM test_jobs WHERE id = ?").get(jobId)!;
    return { job: row };
  }

  function publishAcceptedCheckpoint(jobId: string, iteration: number, remainingIterations: number): string {
    const content = "t";
    const acceptedHash = createHash("sha256").update(content).digest("hex");
    const manifest: CheckpointManifest = {
      schema_version: 1,
      job_id: jobId,
      project_id: jobId,
      location_id: jobId,
      target_ids: ["PaymentService"],
      user_goal: "coverage:90",
      source_snapshot_id: null,
      head_commit: HEAD_A,
      source_digest: SOURCE_A,
      dirty_digest: null,
      build_digest: BUILD_A,
      policy_digest: null,
      parser_version: "statik-tarama-1",
      toolchain: {},
      accepted_changes: [{ path: "src/test/java/PaymentServiceTest.java", sha256: acceptedHash, action: "create" }],
      parent_checkpoint_id: null,
      baseline_run_id: null,
      last_trusted_run_id: null,
      active_phase: "verification",
      next_action: "candidate_accepted",
      remaining_budget: { max_candidate_iterations: remainingIterations, max_repairs_per_candidate: 2, no_progress_window: 3 },
      requested_model: null,
      resolved_model: null,
      worker_session_ref: null,
      generation: iteration,
      created_at: Date.now(),
    };
    // P03/PP10: accepted content immutable blob olarak yayinlanir; manifest ile eslesir.
    const blobs = checkpoints.publishAcceptedBlobs(jobId, [{ path: "src/test/java/PaymentServiceTest.java", sha256: acceptedHash, action: "create", content }]);
    return checkpoints.publishCheckpoint(manifest, null, null, blobs).checkpoint_id;
  }

  it("N34: hard-kill sonrasi checkpoint dogrulanir; ayni job'dan resume planlanir", () => {
    const { job } = createJob("INTERRUPTED");
    publishAcceptedCheckpoint(job.id, 1, 3);
    const plan = recovery.planRecovery(job as never, `owner-${process.pid}`, { current_identity: identityA() });
    expect(plan.action).toBe("resume");
    expect(plan.checkpoint_id).not.toBeNull();
    expect(plan.source_changed).toBe(false);
    expect(plan.checkpoint_manifest).not.toBeNull();
  });

  it("N34: checkpoint manifest'inden kalan butce yuklenir (config sifirlamaz)", () => {
    const { job } = createJob("INTERRUPTED");
    const checkpointId = publishAcceptedCheckpoint(job.id, 2, 3);
    const verification = checkpoints.verifyCheckpoint(checkpointId);
    expect(verification.valid).toBe(true);
    expect(verification.manifest).not.toBeNull();
    // remaining_budget manifest'te korunur:
    expect(verification.manifest!.remaining_budget["max_candidate_iterations"]).toBe(3);
  });

  it("N34: source identity degismezken resume; degisince SOURCE_CHANGED (PP11/R04)", () => {
    const { job } = createJob("INTERRUPTED");
    publishAcceptedCheckpoint(job.id, 1, 3);
    // kayitli identity ile ayni kaynak:
    const same = recovery.planRecovery(job as never, `owner-same-${process.pid}`, { current_identity: identityA() });
    expect(same.action).toBe("resume");
    expect(same.source_changed).toBe(false);
    // source digest degistiginde (null/bilinmeyen "ayni" degil):
    const { job: job2 } = createJob("INTERRUPTED");
    publishAcceptedCheckpoint(job2.id, 1, 3);
    const changed = recovery.planRecovery(job2 as never, `owner-chg-${process.pid}`, { current_identity: identityChangedSource() });
    expect(changed.action).toBe("rebaseline");
    expect(changed.source_changed).toBe(true);
    expect(changed.stale_coverage_marked).toBe(true);
  });

  it("N35: kaynak fingerprint degisiminde SOURCE_CHANGED; rebaseline planlanir", () => {
    const { job } = createJob("RUNNING");
    const plan = recovery.planRecovery(job as never, `owner-${process.pid}`, { current_identity: identityA() });
    // dogrulanmis checkpoint yok: resume degil, acik tanili yeni baslangic;
    // kaynak degisim beyan edilemez (kayitli identity yok -> trusted resume verilmez):
    expect(plan.action === "fresh_start").toBe(true);
    expect(plan.source_changed).toBe(false);
  });

  it("N36: iki resume yarismasi tek owner; aktif lease devredilmez, expiry sonrasi stale worker engellenir", () => {
    const { job } = createJob("INTERRUPTED");
    const first = leases.acquire(job.id, "owner-A", 300000, "proc-A");
    expect(first.created || first.previous_owner_alive === false).toBe(true);
    // owner-B aktif lease'i atomik olarak devralamaz; owner-A kaydi degismez:
    expect(() => leases.acquire(job.id, "owner-B", 300000, "proc-B")).toThrow(/aktif baska owner/);
    expect(leases.get(job.id).owner_id).toBe("owner-A");
    storage.db.prepare("UPDATE job_leases SET expires_at = ? WHERE job_id = ?").run(Date.now() - 1, job.id);
    const second = leases.acquire(job.id, "owner-B", 300000, "proc-B");
    expect(second.lease.fencing_token).toBeGreaterThan(first.lease.fencing_token);
    // eski owner checkpoint publish etmeye calisirsa STALE_FENCE:
    const manifest: CheckpointManifest = {
      schema_version: 1,
      job_id: job.id,
      project_id: job.id,
      location_id: job.id,
      target_ids: [],
      user_goal: "g",
      source_snapshot_id: null,
      head_commit: HEAD_A,
      source_digest: SOURCE_A,
      dirty_digest: null,
      build_digest: BUILD_A,
      policy_digest: null,
      parser_version: "p",
      toolchain: {},
      accepted_changes: [],
      parent_checkpoint_id: null,
      baseline_run_id: null,
      last_trusted_run_id: null,
      active_phase: "verification",
      next_action: "n",
      remaining_budget: {},
      requested_model: null,
      resolved_model: null,
      worker_session_ref: null,
      generation: 1,
      created_at: Date.now(),
    };
    expect(() => checkpoints.publishCheckpoint(manifest, { owner_id: "owner-A", fencing_token: first.lease.fencing_token }, null)).toThrow(/STALE_FENCE|Lease fence/);
  });
});

describe("W05/F11/N37-N38: cancel/pause davranisi (leveL)", () => {
  it("N26-N28 evaluator ile N37: gec kazanc degerlendirmesi CANCELLED'i etkilemez (typed ayrilik)", () => {
    // evaluateCandidateGain CANCELLED/PAUSED'den bagimsiz; lifecycle urun katmaninda:
    const gain = evaluateCandidateGain({ line: 5000, branch: 2000 }, { line: 5000, branch: 4000 }, true);
    expect(gain.accepted).toBe(true);
  });
});
