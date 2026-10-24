import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { approvedApplyFixture } from "../support/approved-apply-fixture.js";
import { prepareApply } from "../../src/application/test-apply-plan.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { ApplyOperationRepository } from "../../src/storage/apply-operation-repository.js";
import type { ApplyOperationView, ApplyVerification } from "../../src/domain/apply-contracts.js";

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach(fn => fn()));
describe("durable apply operation schema", () => {
  it.each(["negative", "sum", "scope", "phase", "paths", "conflicts"])("atomically rejects invalid APPLIED evidence: %s", kind => {
    const root = mkdtempSync(join(tmpdir(), "apply-invalid-")), fixture = approvedApplyFixture(root), { services, jobId } = fixture;
    cleanup.push(() => { services.storage!.close(); rmSync(root, { recursive: true, force: true }); });
    const plan = prepareApply({ job_id: jobId, mode: "preview" }, services).plan;
    const owner = "test-owner", lease = new LeaseManager(services.storage!.db).acquireNative(jobId, owner, 120000).lease;
    const approval = services.jobs!.recordApproval({ job_id: jobId, project_id: plan.project_id, approval_kind: "TEST_APPLY", scope_digest: plan.patch_digest,
      model_digest: "a".repeat(64), budget_digest: "b".repeat(64), decision: "APPROVED", decided_by: "synthetic-human" });
    const repo = new ApplyOperationRepository(services.storage!.db), op = repo.start(plan, owner, lease.fencing_token, approval.approval_id);
    const verification: ApplyVerification = { status: "PASSED", scope: "FULL_PROJECT_SNAPSHOT", total: 4, passed: 4, failures: 0, errors: 0, skipped: 0,
      existing_tests_preserved: true, all_tests_present: true, exit_code: 0, reason_code: null, execution_root: "private-copy" };
    const patch: Partial<ApplyOperationView> = { state: "APPLIED", phase: "done", verification, applied_paths: plan.files.map(file => file.path) };
    if (kind === "negative") { verification.skipped = -1; verification.passed = 5; }
    if (kind === "sum") verification.total = 5;
    if (kind === "scope") verification.scope = "AFFECTED_SCOPE" as ApplyVerification["scope"];
    if (kind === "phase") patch.phase = "verification";
    if (kind === "paths") patch.applied_paths = [];
    if (kind === "conflicts") patch.conflicts = [{ path: plan.files[0]!.path, reason: "user edit" }];
    expect(() => repo.update(op.operation_id, owner, lease.fencing_token, patch)).toThrow();
    expect(services.jobs!.getJob(jobId).apply_state).toBe("APPLYING"); expect(JSON.parse(repo.read(op.operation_id).view_json).state).toBe("APPLYING");
  });
  it("adds a separate application ledger without changing completed generation jobs", () => {
    const root = mkdtempSync(join(tmpdir(), "apply-schema-"));
    const services = createDefaultServicesForTest(join(root, "state.db"), join(root, "runtime"));
    cleanup.push(() => { services.storage!.close(); rmSync(root, { recursive: true, force: true }); });
    const table = services.storage!.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='apply_operations'").get();
    expect(table).toEqual({ name: "apply_operations" });
  });
});
