/** Durable receipt for the non-atomic blob publish -> SQLite commit boundary. */
import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";
import type { ArtifactStore } from "./artifact-store.js";

export type RunOutputKind = "run_output_truncation" | "run_output_terminal";

export interface RunOutputReceipt {
  id: string;
  jobId: string;
  kind: RunOutputKind;
  pin: string;
  sha256: string;
  bytes: number;
  relativeStorePath: string;
  existingReady: boolean;
}

/** Bounded, metadata-only reconciliation view; it grants no delete authority. */
export function listPendingRunOutputReceipts(db: BetterSqlite3.Database, artifacts: ArtifactStore, jobId: string, limit = 64): Array<{
  id: string; kind: RunOutputKind; sha256: string; relativeStorePath: string; relativeTempPath: string;
}> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) throw new AppError("INVALID_PARAMETERS", "Invalid receipt audit limit");
  const rows = db.prepare<[string, number], { id: string; kind: RunOutputKind; sha256: string; relative_store_path: string }>(
    "SELECT id, kind, sha256, relative_store_path FROM artifacts WHERE job_id = ? AND status = 'PENDING' AND kind IN ('run_output_truncation', 'run_output_terminal') ORDER BY created_at, id LIMIT ?",
  ).all(jobId, limit + 1);
  if (rows.length > limit) throw new AppError("STORAGE_ERROR", "Run output receipt audit limit exceeded", {
    reason_code: "RUN_OUTPUT_RECEIPT_AUDIT_OVERFLOW",
  });
  return rows.map((row) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(row.id) ||
        !/^[0-9a-f]{64}$/u.test(row.sha256)) {
      throw new AppError("STORAGE_ERROR", "Run output receipt identity invalid", { reason_code: "RUN_OUTPUT_RECEIPT_INVALID" });
    }
    const expected = relative(artifacts.rootPath, artifacts.blobPath(row.sha256)).replace(/\\/gu, "/");
    if (row.relative_store_path !== expected) {
      throw new AppError("STORAGE_ERROR", "Run output receipt path invalid", { reason_code: "RUN_OUTPUT_RECEIPT_INVALID" });
    }
    return { id: row.id, kind: row.kind, sha256: row.sha256, relativeStorePath: expected,
      relativeTempPath: `${expected}.tmp-${row.id}` };
  });
}

export function assertNoPendingRunOutputReceipt(db: BetterSqlite3.Database, jobId: string, kind: RunOutputKind): void {
  const pending = db.prepare<[string, RunOutputKind], { id: string }>(
    "SELECT id FROM artifacts WHERE job_id = ? AND kind = ? AND status = 'PENDING' LIMIT 1",
  ).get(jobId, kind);
  if (pending) throw new AppError("STORAGE_ERROR", "Run output publish receipt pending reconciliation", {
    reason_code: "RUN_OUTPUT_RECEIPT_PENDING", artifact_id: pending.id,
  });
}

/** Commits ownership before any physical blob is published. PENDING is never trusted evidence. */
export function reserveRunOutputReceipt(db: BetterSqlite3.Database, artifacts: ArtifactStore, input: {
  jobId: string; kind: RunOutputKind; pin: string; data: string;
}): RunOutputReceipt {
  const sha256 = artifacts.sha256(input.data);
  const bytes = Buffer.byteLength(input.data, "utf8");
  const relativeStorePath = relative(artifacts.rootPath, artifacts.blobPath(sha256)).replace(/\\/gu, "/");
  return db.transaction(() => {
    // A crashed previous attempt may have a different run id/pin. It needs
    // explicit reconciliation rather than a silent second physical publish.
    assertNoPendingRunOutputReceipt(db, input.jobId, input.kind);
    const rows = db.prepare<[string, RunOutputKind, string], {
      id: string; sha256: string; bytes: number; relative_store_path: string; status: string;
    }>("SELECT id, sha256, bytes, relative_store_path, status FROM artifacts WHERE job_id = ? AND kind = ? AND pin_reason = ?")
      .all(input.jobId, input.kind, input.pin);
    if (rows.length > 1) throw new AppError("STORAGE_ERROR", "Run output receipt pin is not unique");
    const row = rows[0];
    if (row) {
      if (row.status !== "READY" || row.sha256 !== sha256 || row.bytes !== bytes ||
          row.relative_store_path !== relativeStorePath || !artifacts.verify(sha256)) {
        throw new AppError("STORAGE_ERROR", "Run output receipt conflicts with trusted artifact");
      }
      return { id: row.id, jobId: input.jobId, kind: input.kind, pin: input.pin,
        sha256, bytes, relativeStorePath, existingReady: true };
    }
    const id = randomUUID();
    db.prepare("INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, pin_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, '1', 'internal', 'PENDING', ?, ?)")
      .run(id, input.jobId, input.kind, relativeStorePath, sha256, bytes, input.pin, Date.now());
    return { id, jobId: input.jobId, kind: input.kind, pin: input.pin,
      sha256, bytes, relativeStorePath, existingReady: false };
  }).immediate();
}

export function publishRunOutputReceipt(artifacts: ArtifactStore, receipt: RunOutputReceipt, data: string): void {
  if (receipt.existingReady) return;
  const published = artifacts.publish(receipt.kind, data, {
    schemaVersion: "1", sensitivity: "internal", ownedAttemptId: receipt.id,
  });
  if (published.sha256 !== receipt.sha256 || published.bytes !== receipt.bytes ||
      published.relativeStorePath !== receipt.relativeStorePath) {
    throw new AppError("STORAGE_ERROR", "Run output published bytes differ from receipt");
  }
}

/** Caller must invoke this inside the same SQLite transaction as its run/event link. */
export function promoteRunOutputReceipt(db: BetterSqlite3.Database, receipt: RunOutputReceipt): void {
  if (receipt.existingReady) {
    const row = db.prepare<[string, string, RunOutputKind, string, string, number, string], { id: string }>(
      "SELECT id FROM artifacts WHERE id = ? AND job_id = ? AND kind = ? AND pin_reason = ? AND sha256 = ? AND bytes = ? AND relative_store_path = ? AND status = 'READY'",
    ).get(receipt.id, receipt.jobId, receipt.kind, receipt.pin, receipt.sha256, receipt.bytes, receipt.relativeStorePath);
    if (!row) throw new AppError("STORAGE_ERROR", "Trusted run output receipt changed before commit");
    return;
  }
  const result = db.prepare("UPDATE artifacts SET status = 'READY' WHERE id = ? AND job_id = ? AND kind = ? AND pin_reason = ? AND sha256 = ? AND bytes = ? AND relative_store_path = ? AND status = 'PENDING'")
    .run(receipt.id, receipt.jobId, receipt.kind, receipt.pin, receipt.sha256, receipt.bytes, receipt.relativeStorePath);
  if (result.changes !== 1) throw new AppError("STORAGE_ERROR", "Run output receipt changed before commit");
}
