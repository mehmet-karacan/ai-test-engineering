import type Database from "better-sqlite3";
import type { ApplyOperationView, ApplyPlan, ApplyVerification } from "../domain/apply-contracts.js";

// Structural compatibility while the coordinator extends the shared optional contract.
type StoredApplyOperation = ApplyOperationView & { conflicts?: Array<{ path: string; reason: string }> };

const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const path = (value: unknown): value is string => text(value) && !/^[\\/]|:|\0/.test(value) && !value.split(/[\\/]/).some(part => part === ".." || part === "." || !part);

function validVerification(value: ApplyVerification): boolean {
  if (!value || typeof value !== "object" || !["PASSED", "FAILED", "CANCELLED", "INTERRUPTED", "BLOCKED"].includes(value.status)
    || value.scope !== "FULL_PROJECT_SNAPSHOT" || !text(value.execution_root)
    || ![value.total, value.passed, value.failures, value.errors, value.skipped].every(count)
    || value.passed + value.failures + value.errors + value.skipped !== value.total
    || typeof value.existing_tests_preserved !== "boolean" || typeof value.all_tests_present !== "boolean"
    || !(value.exit_code === null || Number.isSafeInteger(value.exit_code))
    || !(value.reason_code === null || text(value.reason_code))) return false;
  return value.status !== "PASSED" || (value.exit_code === 0 && value.total > 0 && value.passed > 0
    && value.failures === 0 && value.errors === 0 && value.existing_tests_preserved && value.all_tests_present);
}

/** Read-only projection. Missing legacy schema or invalid records never imply application success. */
export function getApplyOperationView(db: Database.Database, jobId: string): ApplyOperationView | null {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='apply_operations'").get()) return null;
  const row = db.prepare("SELECT operation_id,job_id,created_at,updated_at,plan_json,view_json FROM apply_operations WHERE job_id=? ORDER BY created_at DESC, operation_id DESC LIMIT 1").get(jobId) as {
    operation_id: string; job_id: string; created_at: number; updated_at: number; plan_json: string; view_json: string;
  } | undefined;
  if (!row) return null;
  try {
    const view = JSON.parse(row.view_json) as StoredApplyOperation;
    const plan = JSON.parse(row.plan_json) as ApplyPlan;
    if (!view || !plan || view.operation_id !== row.operation_id || view.job_id !== jobId || row.job_id !== jobId
      || plan.job_id !== jobId || plan.schema_version !== 1 || plan.verification_scope !== "FULL_PROJECT_SNAPSHOT"
      || !text(view.operation_id) || !text(view.checkpoint_id) || view.checkpoint_id !== plan.checkpoint_id
      || !digest(view.patch_digest) || view.patch_digest !== plan.patch_digest
      || !count(view.created_at) || !count(view.updated_at) || view.updated_at < view.created_at
      || view.created_at !== row.created_at || view.updated_at !== row.updated_at
      || !["APPLYING", "APPLIED", "ROLLED_BACK", "RECOVERY_REQUIRED", "CONFLICT", "REJECTED"].includes(view.state)
      || !["publishing", "verification", "rollback", "done"].includes(view.phase) || typeof view.message !== "string"
      || !Array.isArray(plan.files) || !plan.files.length || !plan.files.every(file => file && path(file.path) && digest(file.sha256) && count(file.bytes))
      || new Set(plan.files.map(file => file.path)).size !== plan.files.length
      || !Array.isArray(view.applied_paths) || !view.applied_paths.every(item => path(item) && plan.files.some(file => file.path === item))
      || new Set(view.applied_paths).size !== view.applied_paths.length
      || (view.conflicts !== undefined && (!Array.isArray(view.conflicts)
        || !view.conflicts.every(conflict => conflict && path(conflict.path) && text(conflict.reason))))
      || !(view.verification === null || validVerification(view.verification))) return null;
    if (view.state === "APPLIED" && (view.phase !== "done" || view.verification?.status !== "PASSED"
      || view.applied_paths.length !== plan.files.length || (view.conflicts?.length ?? 0) > 0)) return null;
    const verification = view.verification;
    return {
      operation_id: view.operation_id, job_id: view.job_id, state: view.state, phase: view.phase,
      checkpoint_id: view.checkpoint_id, patch_digest: view.patch_digest, applied_paths: [...view.applied_paths],
      ...(view.conflicts !== undefined ? { conflicts: view.conflicts.map(conflict => ({ path: conflict.path, reason: conflict.reason })) } : {}),
      created_at: view.created_at, updated_at: view.updated_at, message: view.message,
      verification: verification === null ? null : {
        status: verification.status, scope: verification.scope, total: verification.total, passed: verification.passed,
        failures: verification.failures, errors: verification.errors, skipped: verification.skipped,
        existing_tests_preserved: verification.existing_tests_preserved, all_tests_present: verification.all_tests_present,
        exit_code: verification.exit_code, reason_code: verification.reason_code, execution_root: verification.execution_root,
      },
    };
  } catch { return null; }
}
