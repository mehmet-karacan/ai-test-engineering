/**
 * W01/F02 kabul testleri (N14): durable attempt ve bounded retry kaydi.
 * - Attempt kaydi istek ONCESI yazilir (durable; crash'te bile kayit var).
 * - Tum sonuclar bitirilir: ok/timeout/error/aborted; unknown usage null.
 * - status:ok yalniz JSON parse + schema validation sonrasi.
 * - Hata yolunda owned session/server cleanup.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { InventoryRepository } from "../../src/storage/inventory-repository.js";
import { Storage } from "../../src/storage/storage.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("W01/F02/N14: durable attempt kaydi", () => {
  let storage: Storage;
  let inventory: InventoryRepository;
  let dbDir: string;

  beforeAll(() => {
    dbDir = mkdtempSync(join(tmpdir(), "aitest-w01-n14-"));
    storage = new Storage({ dbPath: join(dbDir, "test.db") });
    storage.migrate();
    inventory = new InventoryRepository(storage.db);
  });

  afterAll(() => {
    try {
      rmSync(dbDir, { recursive: true, force: true });
    } catch {
      // temp temizligi kritik degil
    }
  });

  /** worker_attempts FK'si test_jobs gerektirir; izole job satiri olusturur */
  function createTestJob(jobId: string): void {
    const projectId = randomUUID().slice(0, 36);
    const locationId = randomUUID().slice(0, 36);
    const now = Date.now();
    storage.db
      .prepare(
        "INSERT INTO projects (id, name, identity_kind, created_at, updated_at) VALUES (?, ?, 'local_only', ?, ?)",
      )
      .run(projectId, `n14-${jobId.slice(0, 8)}`, now, now);
    storage.db
      .prepare(
        "INSERT INTO project_locations (id, project_id, canonical_root, platform, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, 'win32', ?, ?, ?)",
      )
      .run(locationId, projectId, join(dbDir, jobId), now, now, now);
    storage.db
      .prepare(
        "INSERT INTO test_jobs (id, location_id, request_digest, phase, lifecycle, created_at, updated_at) VALUES (?, ?, ?, 'discovery', 'QUEUED', ?, ?)",
      )
      .run(jobId, locationId, `digest-${jobId}`, now, now);
  }

  it("attempt istek oncesi yazilir; sonrasi outcome ile guncellenir (ok yolu)", () => {
    const jobId = randomUUID();
    createTestJob(jobId);
    const promptDigest = createHash("sha256").update("prompt-icerigi", "utf8").digest("hex");
    // istek oncesi: status error/IN_PROGRESS placeholder ile durable yazim
    inventory.writeWorkerAttempt({
      job_id: jobId,
      attempt_ordinal: 1,
      role: "test_designer",
      provider_id: "synthetic-provider",
      model_id: "synthetic-model",
      profile_digest: null,
      session_id: "ses_x",
      message_id: null,
      status: "error",
      input_digest: promptDigest,
      output_digest: null,
      duration_ms: null,
      input_tokens: null,
      output_tokens: null,
      repair_for_attempt: null,
      error_class: "IN_PROGRESS",
    });
    // istek sonrasi (basarili): ok + output digest + duration
    const updated = inventory.updateWorkerAttemptOutcome({
      job_id: jobId,
      attempt_ordinal: 1,
      status: "ok",
      session_id: "ses_x",
      message_id: "msg_1",
      input_digest: promptDigest,
      output_digest: createHash("sha256").update('{"schema_version":1}', "utf8").digest("hex"),
      duration_ms: 1500,
      input_tokens: null,
      output_tokens: null,
      error_class: null,
    });
    expect(updated).toBe(true);
    const row = storage.db
      .prepare<[string, number], { status: string; input_digest: string; output_digest: string; duration_ms: number; message_id: string }>(
        "SELECT status, input_digest, output_digest, duration_ms, message_id FROM worker_attempts WHERE job_id = ? AND attempt_ordinal = ?",
      )
      .get(jobId, 1)!;
    expect(row.status).toBe("ok");
    expect(row.input_digest).toBe(promptDigest);
    expect(row.output_digest).not.toBeNull();
    expect(row.duration_ms).toBe(1500);
    expect(row.message_id).toBe("msg_1");
  });

  it("timeout yolu: status timeout + error_class REQUEST_TIMEOUT; usage null", () => {
    const jobId = randomUUID();
    createTestJob(jobId);
    inventory.writeWorkerAttempt({
      job_id: jobId,
      attempt_ordinal: 1,
      role: "test_designer",
      provider_id: "synthetic-provider",
      model_id: "synthetic-model",
      profile_digest: null,
      session_id: "ses_t",
      message_id: null,
      status: "error",
      input_digest: null,
      output_digest: null,
      duration_ms: null,
      input_tokens: null,
      output_tokens: null,
      repair_for_attempt: null,
      error_class: "IN_PROGRESS",
    });
    inventory.updateWorkerAttemptOutcome({
      job_id: jobId,
      attempt_ordinal: 1,
      status: "timeout",
      session_id: "ses_t",
      message_id: null,
      input_digest: null,
      output_digest: null,
      duration_ms: 300000,
      input_tokens: null,
      output_tokens: null,
      error_class: "REQUEST_TIMEOUT",
    });
    const row = storage.db
      .prepare<[string, number], { status: string; error_class: string; input_tokens: number | null; output_tokens: number | null }>(
        "SELECT status, error_class, input_tokens, output_tokens FROM worker_attempts WHERE job_id = ? AND attempt_ordinal = ?",
      )
      .get(jobId, 1)!;
    expect(row.status).toBe("timeout");
    expect(row.error_class).toBe("REQUEST_TIMEOUT");
    expect(row.input_tokens).toBeNull();
    expect(row.output_tokens).toBeNull();
  });

  it("abort/cancel yolu: status aborted + CANCELLED error_class", () => {
    const jobId = randomUUID();
    createTestJob(jobId);
    inventory.writeWorkerAttempt({
      job_id: jobId,
      attempt_ordinal: 1,
      role: "test_designer",
      provider_id: "synthetic-provider",
      model_id: "synthetic-model",
      profile_digest: null,
      session_id: "ses_c",
      message_id: null,
      status: "error",
      input_digest: null,
      output_digest: null,
      duration_ms: null,
      input_tokens: null,
      output_tokens: null,
      repair_for_attempt: null,
      error_class: "IN_PROGRESS",
    });
    inventory.updateWorkerAttemptOutcome({
      job_id: jobId,
      attempt_ordinal: 1,
      status: "aborted",
      session_id: "ses_c",
      message_id: null,
      input_digest: null,
      output_digest: null,
      duration_ms: 500,
      input_tokens: null,
      output_tokens: null,
      error_class: "CANCELLED",
    });
    const row = storage.db
      .prepare<[string, number], { status: string; error_class: string }>(
        "SELECT status, error_class FROM worker_attempts WHERE job_id = ? AND attempt_ordinal = ?",
      )
      .get(jobId, 1)!;
    expect(row.status).toBe("aborted");
    expect(row.error_class).toBe("CANCELLED");
  });

  it("EMPTY_FINAL yolu: status error + EMPTY_CLASS; output_digest null", () => {
    const jobId = randomUUID();
    createTestJob(jobId);
    inventory.writeWorkerAttempt({
      job_id: jobId,
      attempt_ordinal: 1,
      role: "test_designer",
      provider_id: "synthetic-provider",
      model_id: "synthetic-model",
      profile_digest: null,
      session_id: "ses_e",
      message_id: null,
      status: "error",
      input_digest: null,
      output_digest: null,
      duration_ms: null,
      input_tokens: null,
      output_tokens: null,
      repair_for_attempt: null,
      error_class: "IN_PROGRESS",
    });
    inventory.updateWorkerAttemptOutcome({
      job_id: jobId,
      attempt_ordinal: 1,
      status: "error",
      session_id: "ses_e",
      message_id: "msg_empty",
      input_digest: null,
      output_digest: null,
      duration_ms: 18000,
      input_tokens: null,
      output_tokens: 0,
      error_class: "EMPTY_FINAL",
    });
    const row = storage.db
      .prepare<[string, number], { status: string; error_class: string; output_digest: string | null }>(
        "SELECT status, error_class, output_digest FROM worker_attempts WHERE job_id = ? AND attempt_ordinal = ?",
      )
      .get(jobId, 1)!;
    expect(row.status).toBe("error");
    expect(row.error_class).toBe("EMPTY_FINAL");
    expect(row.output_digest).toBeNull();
  });

  it("attempt ordinal monotn artar; tum kayitlar gecmis olarak kalir", () => {
    const jobId = randomUUID();
    createTestJob(jobId);
    inventory.writeWorkerAttempt({
      job_id: jobId,
      attempt_ordinal: 1,
      role: "test_designer",
      provider_id: "p",
      model_id: "m",
      profile_digest: null,
      session_id: "s1",
      message_id: null,
      status: "error",
      input_digest: null,
      output_digest: null,
      duration_ms: 100,
      input_tokens: null,
      output_tokens: null,
      repair_for_attempt: null,
      error_class: "EMPTY_FINAL",
    });
    inventory.writeWorkerAttempt({
      job_id: jobId,
      attempt_ordinal: 2,
      role: "test_designer",
      provider_id: "p",
      model_id: "m",
      profile_digest: null,
      session_id: "s2",
      message_id: null,
      status: "error",
      input_digest: null,
      output_digest: null,
      duration_ms: 200,
      input_tokens: null,
      output_tokens: null,
      repair_for_attempt: 1,
      error_class: "EMPTY_FINAL",
    });
    const rows = storage.db
      .prepare<[string], { attempt_ordinal: number; status: string; repair_for_attempt: number | null }>(
        "SELECT attempt_ordinal, status, repair_for_attempt FROM worker_attempts WHERE job_id = ? ORDER BY attempt_ordinal",
      )
      .all(jobId);
    expect(rows.length).toBe(2);
    expect(rows[0]!.attempt_ordinal).toBe(1);
    expect(rows[1]!.attempt_ordinal).toBe(2);
    expect(rows[1]!.repair_for_attempt).toBe(1);
  });
});
