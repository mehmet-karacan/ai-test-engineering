/** Durable native launch fence in the existing job_leases.process_identity column.
 * Path/argv hashes identify the launch request, not executable or workspace
 * content; NativeToolchainRecordStore owns those separate content identities.
 */
import { createHash, randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";
import type { NativeProcessLifecycle, NativeProcessPlan, NativeProcessResult } from "../runners/windows-process-supervisor.js";

interface RecordV1 {
  schema_version: 1;
  job_id: string;
  run_id: string;
  attempt_id: string;
  state: "starting" | "spawned";
  owner_id: string;
  fencing_token: number;
  started_at: number;
  parent_pid: number;
  helper_pid: number | null;
  executable_path_sha256: string;
  workspace_path_sha256: string;
  argv_sha256: string;
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export function isUnresolvedNativeProcessIdentity(value: string | null): boolean {
  // A non-null legacy, damaged or native record can still represent a live
  // process. Its format is not authority to discard the durable owner fence.
  return value !== null;
}

export class NativeProcessRegistry implements NativeProcessLifecycle {
  private active: RecordV1 | null = null;
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly jobId: string,
    private readonly ownerId: string,
    private readonly fencingToken: number,
  ) {}

  beforeSpawn(plan: NativeProcessPlan): void {
    if (this.active) throw new AppError("BLOCKED_ISOLATION", "Native run already registered", { reason_code: "NATIVE_PROCESS_UNRESOLVED" });
    const row: RecordV1 = {
      schema_version: 1, job_id: this.jobId, run_id: randomUUID(), attempt_id: randomUUID(), state: "starting",
      owner_id: this.ownerId, fencing_token: this.fencingToken, started_at: Date.now(), parent_pid: process.pid,
      helper_pid: null, executable_path_sha256: digest(plan.executable), workspace_path_sha256: digest(plan.cwd),
      argv_sha256: digest(JSON.stringify(plan.argv)),
    };
    const tx = this.db.transaction(() => {
      const lease = this.db.prepare<[string], { process_identity: string | null; owner_id: string; fencing_token: number; expires_at: number }>(
        "SELECT process_identity, owner_id, fencing_token, expires_at FROM job_leases WHERE job_id = ?",
      ).get(this.jobId);
      if (!lease || lease.owner_id !== this.ownerId || lease.fencing_token !== this.fencingToken || lease.expires_at <= Date.now() ||
          isUnresolvedNativeProcessIdentity(lease.process_identity)) {
        throw new AppError("BLOCKED_ISOLATION", "Native process lease or prior ownership unresolved", { reason_code: "NATIVE_PROCESS_UNRESOLVED" });
      }
      this.db.prepare("UPDATE job_leases SET process_identity = ? WHERE job_id = ? AND owner_id = ? AND fencing_token = ?")
        .run(JSON.stringify(row), this.jobId, this.ownerId, this.fencingToken);
      this.db.prepare(
        `INSERT INTO owned_processes (
           process_id, job_id, run_id, attempt_id, process_identity, parent_process_identity,
           executable_fingerprint, workspace_fingerprint, started_at, closed_at, cleanup_state, row_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'ACTIVE', 0)`,
      ).run(
        randomUUID(), this.jobId, row.run_id, row.attempt_id, JSON.stringify(row), String(row.parent_pid),
        row.executable_path_sha256, row.workspace_path_sha256, row.started_at,
      );
    });
    tx();
    this.active = row;
  }

  afterSpawn(pid: number | undefined): void {
    const current = this.active;
    if (!current || !Number.isSafeInteger(pid) || (pid ?? 0) <= 0) {
      throw new AppError("BLOCKED_ISOLATION", "Native helper PID unavailable", { reason_code: "NATIVE_PROCESS_UNRESOLVED" });
    }
    const next: RecordV1 = { ...current, state: "spawned", helper_pid: pid ?? null };
    const tx = this.db.transaction(() => {
      const result = this.db.prepare(
        "UPDATE job_leases SET process_identity = ? WHERE job_id = ? AND owner_id = ? AND fencing_token = ? AND process_identity = ? AND expires_at > ?",
      ).run(JSON.stringify(next), this.jobId, this.ownerId, this.fencingToken, JSON.stringify(current), Date.now());
      if (result.changes !== 1) throw new AppError("BLOCKED_ISOLATION", "Native process fence changed", { reason_code: "NATIVE_PROCESS_UNRESOLVED" });
      const owned = this.db.prepare(
        "UPDATE owned_processes SET process_identity = ?, row_version = row_version + 1 WHERE job_id = ? AND attempt_id = ? AND cleanup_state = 'ACTIVE'",
      ).run(JSON.stringify(next), this.jobId, next.attempt_id);
      if (owned.changes !== 1) throw new AppError("BLOCKED_ISOLATION", "Native process record changed", { reason_code: "NATIVE_PROCESS_UNRESOLVED" });
    });
    tx();
    this.active = next;
  }

  afterTerminal(result: NativeProcessResult): void {
    const current = this.active;
    const provenNoChildPinFailure = result.status === "spawn_error" && result.preSpawnNoChild === true &&
      (result.errorCode === "pin_unavailable" || result.errorCode === "pin_mismatch");
    if (!current || result.ownedTreeDrained !== true ||
        (!provenNoChildPinFailure && !["success", "nonzero", "timeout", "cancelled"].includes(result.status))) return;
    const tx = this.db.transaction(() => {
      const updated = this.db.prepare(
        "UPDATE job_leases SET process_identity = NULL WHERE job_id = ? AND owner_id = ? AND fencing_token = ? AND process_identity = ? AND expires_at > ?",
      ).run(this.jobId, this.ownerId, this.fencingToken, JSON.stringify(current), Date.now());
      if (updated.changes !== 1) throw new AppError("BLOCKED_ISOLATION", "Native terminal fence changed", { reason_code: "NATIVE_PROCESS_UNRESOLVED" });
      const owned = this.db.prepare(
        "UPDATE owned_processes SET cleanup_state = 'CLOSED', closed_at = ?, row_version = row_version + 1 WHERE job_id = ? AND attempt_id = ? AND cleanup_state = 'ACTIVE'",
      ).run(Date.now(), this.jobId, current.attempt_id);
      if (owned.changes !== 1) throw new AppError("BLOCKED_ISOLATION", "Native process record changed", { reason_code: "NATIVE_PROCESS_UNRESOLVED" });
    });
    tx();
    this.active = null;
  }
}
