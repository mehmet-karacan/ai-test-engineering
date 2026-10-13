import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";
import type { Phase } from "../domain/job-state.js";
import type { ArtifactStore } from "../storage/artifact-store.js";
import { JobRepository } from "../storage/job-repository.js";

interface TerminalOutput {
  reason_code: string;
  stdout_log_path: string;
  stderr_log_path: string;
  stdout_raw_dropped_bytes: number;
  stderr_raw_dropped_bytes: number;
  stdout_rendered_dropped_bytes: number;
  stderr_rendered_dropped_bytes: number;
  stdout_reason: "BYTE_BUDGET_EXCEEDED" | null;
  stderr_reason: "BYTE_BUDGET_EXCEEDED" | null;
}

function isWithin(root: string, path: string): boolean {
  if (!isAbsolute(path)) return false;
  const rel = relative(resolve(root), resolve(path));
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Only MavenRunner's typed terminal failures with bounded output qualify. */
export function terminalOutputFromError(error: unknown, workspaceRoot: string): TerminalOutput | null {
  if (!(error instanceof AppError) || error.code !== "BLOCKED_ISOLATION" || !error.details) return null;
  const details = error.details;
  if (!["NATIVE_MAVEN_TIMEOUT", "NATIVE_MAVEN_CANCELLED", "NATIVE_MAVEN_SPAWN_ERROR"].includes(String(details.reason_code))) return null;
  const stdout = details.stdout_log_path;
  const stderr = details.stderr_log_path;
  if (typeof stdout !== "string" || typeof stderr !== "string" || !isWithin(workspaceRoot, stdout) || !isWithin(workspaceRoot, stderr)) {
    throw new AppError("STORAGE_ERROR", "Terminal Maven log yolu workspace disinda");
  }
  const counts = [details.stdout_truncated_bytes, details.stderr_truncated_bytes,
    details.stdout_rendered_truncated_bytes, details.stderr_rendered_truncated_bytes];
  if (counts.some((value) => typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) {
    throw new AppError("STORAGE_ERROR", "Terminal Maven kesinti sayaci gecersiz");
  }
  if (counts.every((value) => value === 0)) return null;
  const stdoutReason = details.stdout_truncation_reason ?? null;
  const stderrReason = details.stderr_truncation_reason ?? null;
  if ((stdoutReason !== null && stdoutReason !== "BYTE_BUDGET_EXCEEDED") ||
      (stderrReason !== null && stderrReason !== "BYTE_BUDGET_EXCEEDED") ||
      (stdoutReason !== null) !== ((counts[0] as number) + (counts[2] as number) > 0) ||
      (stderrReason !== null) !== ((counts[1] as number) + (counts[3] as number) > 0)) {
    throw new AppError("STORAGE_ERROR", "Terminal Maven kesinti sebebi gecersiz");
  }
  return {
    reason_code: String(details.reason_code), stdout_log_path: resolve(stdout), stderr_log_path: resolve(stderr),
    stdout_raw_dropped_bytes: counts[0] as number, stderr_raw_dropped_bytes: counts[1] as number,
    stdout_rendered_dropped_bytes: counts[2] as number, stderr_rendered_dropped_bytes: counts[3] as number,
    stdout_reason: stdoutReason, stderr_reason: stderrReason,
  };
}

export function recordTerminalRunOutput(input: {
  db: BetterSqlite3.Database;
  artifacts: ArtifactStore;
  jobId: string;
  phase: Phase;
  output: TerminalOutput;
}): void {
  const { db, artifacts, jobId, phase, output } = input;
  const key = createHash("sha256").update(JSON.stringify([jobId, phase, output.stdout_log_path, output.stderr_log_path])).digest("hex");
  const pin = `run_output_terminal:${key}`;
  const bytes = JSON.stringify({ schema_version: 1, job_id: jobId, phase, ...output });
  const expectedHash = artifacts.sha256(bytes);
  const select = db.prepare<[string, string], { id: string; sha256: string; bytes: number; relative_store_path: string; status: string }>(
    "SELECT id, sha256, bytes, relative_store_path, status FROM artifacts WHERE job_id = ? AND kind = 'run_output_terminal' AND pin_reason = ?",
  );
  const prior = select.all(jobId, pin);
  if (prior.length > 1 || (prior[0] && (prior[0].sha256 !== expectedHash || prior[0].status !== "READY"))) {
    throw new AppError("STORAGE_ERROR", "Terminal Maven kesinti kaydi celiskili");
  }
  const artifact = artifacts.publish("run_output_terminal", bytes, { schemaVersion: "1", sensitivity: "internal" });
  db.transaction(() => {
    const rows = select.all(jobId, pin);
    if (rows.length > 1) throw new AppError("STORAGE_ERROR", "Terminal Maven kesinti pin'i tekil degil");
    const row = rows[0];
    if (row) {
      if (row.sha256 !== artifact.sha256 || row.bytes !== artifact.bytes || row.relative_store_path !== artifact.relativeStorePath || row.status !== "READY") {
        throw new AppError("STORAGE_ERROR", "Terminal Maven kesinti kaydi celiskili");
      }
      const links = db.prepare<[string, string, string], { id: number }>(
        "SELECT id FROM job_events WHERE job_id = ? AND event_type = ? AND payload_artifact_id = ?",
      ).all(jobId, "run_output_truncated_terminal", row.id);
      if (links.length !== 1) throw new AppError("STORAGE_ERROR", "Terminal Maven kesinti event baglantisi gecersiz");
      return;
    }
    db.prepare("INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, pin_reason, created_at) VALUES (?, ?, 'run_output_terminal', ?, ?, ?, '1', 'internal', 'READY', ?, ?)")
      .run(artifact.id, jobId, artifact.relativeStorePath, artifact.sha256, artifact.bytes, pin, Date.now());
    new JobRepository(db).appendEvent({ job_id: jobId, event_type: "run_output_truncated_terminal", phase, origin: "JobDispatcher", payload_artifact_id: artifact.id });
  })();
}
