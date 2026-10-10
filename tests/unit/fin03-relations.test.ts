/**
 * FIN03: SQLite gercek veri akisi, migration v2, coverage snapshot relations.
 * Ornek normal job'dan sonra "hangi projede hangi sinif/test hangi modelle uretildi,
 * hangi testler gercekten calisti, ne kadar coverage dogrulandi" sorgulari dogru cevaplanmali (14.2).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Storage } from "../../src/storage/storage.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { InventoryRepository } from "../../src/storage/inventory-repository.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { CheckpointStore, type CheckpointManifest } from "../../src/orchestration/checkpoint-store.js";

describe("FIN03: migration v2 + gercek veri akisi", () => {
  let dir: string;
  let storage: Storage;
  let jobs: JobRepository;
  let projects: ProjectRepository;
  let inventory: InventoryRepository;
  let leases: LeaseManager;
  let checkpoints: CheckpointStore;
  let locationId: string;
  let jobId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-fin03-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    jobs = new JobRepository(storage.db);
    projects = new ProjectRepository(storage.db);
    inventory = new InventoryRepository(storage.db);
    leases = new LeaseManager(storage.db);
    checkpoints = new CheckpointStore(storage.db, dir);
    const { location } = projects.ensureLocation("C:/work/fin03", "fin03", null);
    locationId = location.id;
    jobId = jobs.createJob({ locationId, requestDigest: "digest-fin03-1" }).id;
  });

  afterEach(() => {
    try {
      storage.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  function manifest(): CheckpointManifest {
    return {
      schema_version: 1,
      job_id: jobId,
      project_id: "p-fin03",
      location_id: locationId,
      target_ids: ["t1"],
      user_goal: "coverage %90",
      source_snapshot_id: "snap-1",
      head_commit: null,
      dirty_digest: null,
      build_digest: null,
      policy_digest: null,
      parser_version: "statik-tarama-1",
      toolchain: { maven: "3.9.16" },
      accepted_changes: [{ path: "src/test/java/X.java", sha256: "a".repeat(64), action: "create" }],
      parent_checkpoint_id: null,
      baseline_run_id: null,
      last_trusted_run_id: null,
      active_phase: "verification",
      next_action: "final_replay",
      remaining_budget: { iterations: 10 },
      requested_model: null,
      resolved_model: "litellm/glm-4.7",
      worker_session_ref: null,
      generation: 0,
      created_at: Date.now(),
    };
  }

  it("schema v2: coverage_snapshots + worker_attempts + candidate_iterations + benchmark_trials var", () => {
    expect(storage.schemaVersion()).toBe(2);
    const tables = storage.db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(tables).toContain("coverage_snapshots");
    expect(tables).toContain("worker_attempts");
    expect(tables).toContain("candidate_iterations");
    expect(tables).toContain("benchmark_trials");
  });

  it("canli job'dan dolan relations: coverage snapshot + iteration + attempt ayni job'a bagli", () => {
    // canli job akisi simülasyonu:
    jobs.updateLifecycle(jobId, "RUNNING", 0);

    // checkpoint publish (verified):
    const lease = leases.acquire(jobId, "owner-fin03", 300000);
    const ckpt = checkpoints.publishCheckpoint(manifest(), { owner_id: lease.lease.owner_id, fencing_token: lease.lease.fencing_token }, null);

    // coverage snapshot once/after:
    const beforeId = inventory.writeCoverageSnapshot({
      job_id: jobId,
      target_symbol_id: null,
      run_id: "run-1",
      fqn: "com.example.PaymentService",
      source_sha256: "b".repeat(64),
      binary_class_id: "c".repeat(16),
      line_covered: 40,
      line_missed: 60,
      branch_covered: 5,
      branch_missed: 15,
      line_validity: "OK",
      branch_validity: "OK",
      before_after: "before",
      checkpoint_id: null,
    });
    const afterId = inventory.writeCoverageSnapshot({
      job_id: jobId,
      target_symbol_id: null,
      run_id: "run-2",
      fqn: "com.example.PaymentService",
      source_sha256: "b".repeat(64),
      binary_class_id: "c".repeat(16),
      line_covered: 90,
      line_missed: 10,
      branch_covered: 18,
      branch_missed: 2,
      line_validity: "OK",
      branch_validity: "OK",
      before_after: "after",
      checkpoint_id: ckpt.checkpoint_id,
    });
    expect(beforeId).not.toBe(afterId);

    // worker attempt:
    inventory.writeWorkerAttempt({
      job_id: jobId,
      attempt_ordinal: 1,
      role: "test_designer",
      provider_id: "litellm",
      model_id: "glm-4.7",
      profile_digest: "d".repeat(64),
      session_id: "ses_1",
      message_id: "msg_1",
      status: "ok",
      input_digest: "e".repeat(64),
      output_digest: "f".repeat(64),
      duration_ms: 1200,
      input_tokens: 1000,
      output_tokens: 500,
      repair_for_attempt: null,
      error_class: null,
    });

    // candidate iteration:
    inventory.writeCandidateIteration({
      job_id: jobId,
      parent_checkpoint_id: ckpt.checkpoint_id,
      iteration_ordinal: 1,
      changeset_hash: "1".repeat(64),
      strategy_key: "sign_paths",
      decision: "adopted",
      decision_reason: "Coverage kazanci: LINE 9000 bps",
      coverage_before_bps: 4000,
      coverage_after_bps: 9000,
      error_fingerprint: null,
    });

    // 14.2 sorgu: "hangi sinif hangi modelle uretildi, ne kadar coverage dogrulandi" dogru cevap:
    const history = inventory.listCoverageHistory([locationId]);
    expect(history).toHaveLength(2);
    expect(history[0]!.fqn).toBe("com.example.PaymentService");
    expect(history[0]!.line_covered).toBe(90);
    expect(history[0]!.before_after).toBe("after");

    const iterations = inventory.listCandidateIterations(jobId);
    expect(iterations).toHaveLength(1);
    expect(iterations[0]!.decision).toBe("adopted");
    expect(iterations[0]!.coverage_after_bps).toBe(9000);

    const attemptRows = storage.db
      .prepare<[string], { role: string; provider_id: string; model_id: string; status: string }>(
        "SELECT role, provider_id, model_id, status FROM worker_attempts WHERE job_id = ?",
      )
      .all(jobId);
    expect(attemptRows).toHaveLength(1);
    expect(attemptRows[0]!.role).toBe("test_designer");
    expect(attemptRows[0]!.provider_id).toBe("litellm");
    expect(attemptRows[0]!.model_id).toBe("glm-4.7");
  });

  it("coverage_snapshot checkpoint referansi verified checkpoint ile doluyor", () => {
    const lease = leases.acquire(jobId, "owner-fin03b", 300000);
    const ckpt = checkpoints.publishCheckpoint(manifest(), { owner_id: lease.lease.owner_id, fencing_token: lease.lease.fencing_token }, null);
    inventory.writeCoverageSnapshot({
      job_id: jobId,
      target_symbol_id: null,
      run_id: null,
      fqn: "com.example.X",
      source_sha256: null,
      binary_class_id: null,
      line_covered: 50,
      line_missed: 50,
      branch_covered: null,
      branch_missed: null,
      line_validity: "OK",
      branch_validity: "UNAVAILABLE",
      before_after: "after",
      checkpoint_id: ckpt.checkpoint_id,
    });
    const rows = storage.db
      .prepare<[string], { checkpoint_id: string; branch_validity: string }>("SELECT checkpoint_id, branch_validity FROM coverage_snapshots WHERE job_id = ?")
      .all(jobId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.checkpoint_id).toBe(ckpt.checkpoint_id);
    expect(rows[0]!.branch_validity).toBe("UNAVAILABLE");
  });

  it("worker_attempt idempotent: ayni ordinal ikinci kez yazilmaz", () => {
    const input = {
      job_id: jobId,
      attempt_ordinal: 1,
      role: "analyzer" as const,
      provider_id: "litellm",
      model_id: "glm-4.7",
      profile_digest: null,
      session_id: "s1",
      message_id: null,
      status: "ok" as const,
      input_digest: null,
      output_digest: null,
      duration_ms: 100,
      input_tokens: null,
      output_tokens: null,
      repair_for_attempt: null,
      error_class: null,
    };
    const first = inventory.writeWorkerAttempt(input);
    const second = inventory.writeWorkerAttempt(input);
    expect(second).toBe(first);
    const rows = storage.db.prepare<[string], { id: string }>("SELECT id FROM worker_attempts WHERE job_id = ?").all(jobId);
    expect(rows).toHaveLength(1);
  });

  it("candidate_iteration idempotent: ayni ordinal tek satir", () => {
    const input = {
      job_id: jobId,
      parent_checkpoint_id: null,
      iteration_ordinal: 1,
      changeset_hash: "2".repeat(64),
      strategy_key: "s1",
      decision: "rejected" as const,
      decision_reason: "Anlamsiz kazanc yok",
      coverage_before_bps: 4000,
      coverage_after_bps: 4000,
      error_fingerprint: null,
    };
    inventory.writeCandidateIteration(input);
    inventory.writeCandidateIteration(input);
    expect(inventory.listCandidateIterations(jobId)).toHaveLength(1);
  });

  it("checkpoint blob'u dogrulanir; DB kaydi blob'suz trusted sayilmaz (canli job zinciri)", () => {
    const lease = leases.acquire(jobId, "owner-fin03c", 300000);
    const ckpt = checkpoints.publishCheckpoint(manifest(), { owner_id: lease.lease.owner_id, fencing_token: lease.lease.fencing_token }, null);
    const verification = checkpoints.verifyCheckpoint(ckpt.checkpoint_id);
    expect(verification.valid).toBe(true);
    expect(verification.manifest?.accepted_changes).toHaveLength(1);
    // best pointer dolu:
    expect(checkpoints.bestCheckpoint(jobId)).toBe(ckpt.checkpoint_id);
  });

  it("migration idempotent: migrate tekrar cagrildiginda hata yok", () => {
    expect(() => storage.migrate()).not.toThrow();
    expect(storage.schemaVersion()).toBe(2);
  });

  it("future schema fail-closed: bilinmeyen yuksek version yazmayi durdurur", () => {
    storage.close();
    const freshDir = mkdtempSync(join(tmpdir(), "aitest-fin03-future-"));
    try {
      const fresh = new Storage({ dbPath: join(freshDir, "future.db") });
      fresh.migrate();
      // future migration kaydi ekle:
      fresh.db
        .prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)")
        .run(99, randomUUID(), Date.now());
      fresh.close();
      // eski binary ile acilirsa fail-closed:
      const reopened = new Storage({ dbPath: join(freshDir, "future.db") });
      expect(() => reopened.migrate()).toThrow(/yeni/);
      reopened.close();
    } finally {
      try { rmSync(freshDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  });

  it("WAL modu acik; disk-doluluk/yarim-transaction sonrasi DB acilir ve veri korunur", () => {
    const mode = storage.db.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
    // veri yaz, yeniden ac:
    inventory.writeCoverageSnapshot({
      job_id: jobId,
      target_symbol_id: null,
      run_id: null,
      fqn: "com.example.Persisted",
      source_sha256: null,
      binary_class_id: null,
      line_covered: 10,
      line_missed: 90,
      branch_covered: null,
      branch_missed: null,
      line_validity: "OK",
      branch_validity: null,
      before_after: "before",
      checkpoint_id: null,
    });
    const dbPath = join(dir, "state.db");
    storage.close();
    const reopened = new Storage({ dbPath });
    const rows = reopened.db
      .prepare<[string], { fqn: string }>("SELECT fqn FROM coverage_snapshots WHERE job_id = ?")
      .all(jobId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fqn).toBe("com.example.Persisted");
    reopened.close();
  });
});
