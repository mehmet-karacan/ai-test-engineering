/** Immutable, hash-verified project scan result; selection never trusts client-supplied coverage. */
import { createHash } from "node:crypto";
import type { Services } from "../application/services.js";
import type { ProjectCoverageAnalysis } from "../coverage/project-coverage.js";
import { AppError } from "../domain/errors.js";

export interface ProjectCoverageResult extends ProjectCoverageAnalysis {
  execution_source_digest?: string;
  execution_defaults?: string[];
  job_id: string;
  project_root: string;
  source_digest: string;
  build_digest: string;
  run_id: string;
  coverage_mode: "cli";
  tests: { total: number; failures: number; errors: number; skipped: number };
}

export interface ProjectCoverageFailure {
  diagnostic?: import("../orchestration/baseline-diagnostic.js").BaselineDiagnostic;
  job_id: string; status: "FAILED"; code: string; reason: string; reason_code: string | null;
  skip_config_detected?: string[];
  stdout_log_path?: string;
  stderr_log_path?: string;
}

export function writeProjectCoverageFailure(services: Services, result: ProjectCoverageFailure): void {
  if (!services.storage || !services.artifacts) throw new AppError("STORAGE_ERROR", "Coverage artifact store missing");
  const artifact = services.artifacts.publish("project_coverage_failure", JSON.stringify(result), { sensitivity: "internal", schemaVersion: "1" });
  services.storage.db.prepare("INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, pin_reason, created_at) VALUES (?, ?, 'project_coverage_failure', ?, ?, ?, '1', 'internal', 'READY', 'coverage_failure', ?)")
    .run(artifact.id, result.job_id, artifact.relativeStorePath, artifact.sha256, artifact.bytes, Date.now());
}

export function readProjectCoverageFailure(services: Services, jobId: string): ProjectCoverageFailure | null {
  if (!services.storage || !services.artifacts) return null;
  const row = services.storage.db.prepare<[string], { sha256: string; bytes: number }>("SELECT sha256, bytes FROM artifacts WHERE job_id=? AND kind='project_coverage_failure' AND status='READY' ORDER BY created_at DESC LIMIT 1").get(jobId);
  if (!row) return null;
  const bytes = services.artifacts.read(row.sha256);
  if (bytes.length !== row.bytes || createHash("sha256").update(bytes).digest("hex") !== row.sha256) throw new AppError("INVALID_COVERAGE_EVIDENCE", "Coverage failure artifact changed");
  const result = JSON.parse(bytes.toString("utf8")) as ProjectCoverageFailure;
  if (result.job_id !== jobId) throw new AppError("INVALID_COVERAGE_EVIDENCE", "Coverage failure job mismatch");
  return result;
}

export function writeProjectCoverageResult(services: Services, result: ProjectCoverageResult): void {
  if (!services.storage || !services.artifacts) throw new AppError("STORAGE_ERROR", "Coverage artifact store missing");
  const artifact = services.artifacts.publish("project_coverage", JSON.stringify(result), { sensitivity: "internal", schemaVersion: "1" });
  services.storage.db.prepare("INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, pin_reason, created_at) VALUES (?, ?, 'project_coverage', ?, ?, ?, '1', 'internal', 'READY', 'coverage_proposal', ?)")
    .run(artifact.id, result.job_id, artifact.relativeStorePath, artifact.sha256, artifact.bytes, Date.now());
  services.jobs!.appendEvent({ job_id: result.job_id, event_type: "coverage_proposals_ready", phase: "analysis", origin: "project_coverage", payload_artifact_id: artifact.id });
}

export function readProjectCoverageResult(services: Services, jobId: string): ProjectCoverageResult | null {
  if (!services.storage || !services.artifacts) return null;
  const row = services.storage.db.prepare<[string], { sha256: string; bytes: number }>(
    "SELECT sha256, bytes FROM artifacts WHERE job_id=? AND kind='project_coverage' AND status='READY' ORDER BY created_at DESC LIMIT 1",
  ).get(jobId);
  if (!row) return null;
  const bytes = services.artifacts.read(row.sha256);
  if (bytes.length !== row.bytes || createHash("sha256").update(bytes).digest("hex") !== row.sha256) {
    throw new AppError("INVALID_COVERAGE_EVIDENCE", "Coverage proposal artifact hash/bytes changed");
  }
  const result = JSON.parse(bytes.toString("utf8")) as ProjectCoverageResult;
  if (result.job_id !== jobId) throw new AppError("INVALID_COVERAGE_EVIDENCE", "Coverage proposal job mismatch");
  return result;
}
