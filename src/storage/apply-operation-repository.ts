import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { AppError } from "../domain/errors.js";
import type { ApplyOperationView, ApplyPlan } from "../domain/apply-contracts.js";
import { LeaseManager } from "../orchestration/lease-manager.js";
import { JobRepository } from "./job-repository.js";
import { getApplyOperationView } from "./apply-operation-view.js";

export interface ApplyOperationRow {
  operation_id: string; job_id: string; created_at: number; updated_at: number;
  plan_json: string; view_json: string; owner_id: string; fencing_token: number;
  approval_id: string; active: number; cancel_requested: number;
}
export class ApplyOperationRepository {
  constructor(private readonly db: Database.Database) {}
  latest(jobId: string): ApplyOperationRow | null {
    return this.db.prepare<[string], ApplyOperationRow>("SELECT * FROM apply_operations WHERE job_id=? ORDER BY created_at DESC,operation_id DESC LIMIT 1").get(jobId) ?? null;
  }
  read(operationId: string): ApplyOperationRow {
    const row = this.db.prepare<[string], ApplyOperationRow>("SELECT * FROM apply_operations WHERE operation_id=?").get(operationId);
    if (!row) throw new AppError("STORAGE_ERROR", "Apply operation kaydi yok");
    return row;
  }
  start(plan: ApplyPlan, ownerId: string, fence: number, approvalId: string): ApplyOperationView {
    return this.db.transaction(() => {
      new LeaseManager(this.db).assertFence(plan.job_id, ownerId, fence);
      const approval = new JobRepository(this.db).listApprovals(plan.job_id).find(row => row.approval_id === approvalId);
      if (!approval || approval.approval_kind !== "TEST_APPLY" || approval.decision !== "APPROVED"
          || approval.scope_digest !== plan.patch_digest || approval.project_id !== plan.project_id) {
        throw new AppError("POLICY_VIOLATION", "Somut apply onayi yok", { reason_code: "APPLY_APPROVAL_MISMATCH" });
      }
      const previous = this.latest(plan.job_id);
      if (previous?.active) throw new AppError("POLICY_VIOLATION", "Apply islemi veya temizligi suruyor", { reason_code: "APPLY_ACTIVE" });
      const now = Math.max(Date.now(), (previous?.created_at ?? 0) + 1);
      const view: ApplyOperationView = {
        operation_id: randomUUID(), job_id: plan.job_id, state: "APPLYING", phase: "publishing",
        checkpoint_id: plan.checkpoint_id, patch_digest: plan.patch_digest, applied_paths: [],
        created_at: now, updated_at: now, verification: null, message: "Onayli yeni testler aktariliyor",
      };
      this.db.prepare("INSERT INTO apply_operations(operation_id,job_id,created_at,updated_at,plan_json,view_json,owner_id,fencing_token,approval_id,active) VALUES(?,?,?,?,?,?,?,?,?,1)")
        .run(view.operation_id, plan.job_id, now, now, JSON.stringify(plan), JSON.stringify(view), ownerId, fence, approvalId);
      const jobs = new JobRepository(this.db), job = jobs.getJob(plan.job_id);
      jobs.updateApplyState(job.id, "APPLYING", job.row_version);
      jobs.appendEvent({ job_id: job.id, event_type: "test_apply_started", phase: job.phase, origin: "ApplyOperationRepository" });
      return view;
    }).immediate();
  }
  update(operationId: string, ownerId: string, fence: number, patch: Partial<Pick<ApplyOperationView, "state" | "phase" | "applied_paths" | "conflicts" | "verification" | "message">>): ApplyOperationView {
    return this.db.transaction(() => {
      const row = this.read(operationId);
      new LeaseManager(this.db).assertFence(row.job_id, ownerId, fence);
      if (row.owner_id !== ownerId || row.fencing_token !== fence || !row.active) throw new AppError("POLICY_VIOLATION", "Stale apply operation owner");
      const old = JSON.parse(row.view_json) as ApplyOperationView;
      const now = Math.max(Date.now(), row.updated_at + 1);
      const view = { ...old, ...patch, updated_at: now };
      if (view.state === "APPLIED" && (!view.verification || view.verification.status !== "PASSED" || view.verification.exit_code !== 0
        || !view.verification.existing_tests_preserved || !view.verification.all_tests_present || view.verification.failures || view.verification.errors
        || view.verification.total <= 0 || view.verification.passed <= 0)) throw new AppError("POLICY_VIOLATION", "Apply dogrulanmadan APPLIED olamaz");
      const active = view.state === "APPLYING" || view.state === "RECOVERY_REQUIRED" ? 1 : 0;
      this.db.prepare("UPDATE apply_operations SET view_json=?,updated_at=?,active=? WHERE operation_id=? AND owner_id=? AND fencing_token=?")
        .run(JSON.stringify(view), now, active, operationId, ownerId, fence);
      if (view.state === "APPLIED" && !getApplyOperationView(this.db, row.job_id)) throw new AppError("POLICY_VIOLATION", "Tam uygulama kaniti gecersiz; APPLIED yazilmadi");
      const jobs = new JobRepository(this.db), job = jobs.getJob(row.job_id);
      const state = view.state === "APPLIED" ? "APPLIED" : view.state === "APPLYING" ? "APPLYING"
        : view.state === "CONFLICT" || view.state === "RECOVERY_REQUIRED" ? "CONFLICT" : "REJECTED";
      jobs.updateApplyState(job.id, state, job.row_version);
      if (!active) jobs.appendEvent({ job_id: job.id, event_type: `test_apply_${view.state.toLowerCase()}`, phase: job.phase, origin: "ApplyOperationRepository" });
      return view;
    }).immediate();
  }
  claimRecovery(operationId: string, ownerId: string, fence: number): void {
    const row = this.read(operationId);
    new LeaseManager(this.db).assertFence(row.job_id, ownerId, fence);
    if (!row.active) throw new AppError("POLICY_VIOLATION", "Apply operation terminal");
    this.db.prepare("UPDATE apply_operations SET owner_id=?,fencing_token=?,cancel_requested=1 WHERE operation_id=?").run(ownerId, fence, operationId);
  }
  requestCancel(jobId: string): boolean {
    return this.db.prepare("UPDATE apply_operations SET cancel_requested=1 WHERE job_id=? AND active=1").run(jobId).changes > 0;
  }
}
