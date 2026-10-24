import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getApplyOperationView } from "../../src/storage/apply-operation-view.js";
import type { ApplyOperationView, ApplyPlan } from "../../src/domain/apply-contracts.js";

describe("durable apply view read boundary", () => {
  let db: Database.Database, view: ApplyOperationView, plan: ApplyPlan;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE apply_operations (operation_id TEXT PRIMARY KEY,job_id TEXT,created_at INTEGER,updated_at INTEGER,plan_json TEXT,view_json TEXT)");
    plan = { schema_version: 1, job_id: "job", project_id: "project", checkpoint_id: "checkpoint", project_root: "C:/work/project", source_digest: "a".repeat(64), build_digest: "b".repeat(64), patch_digest: "c".repeat(64), files: [{ path: "src/test/java/NewTest.java", sha256: "d".repeat(64), bytes: 10 }], verification_scope: "FULL_PROJECT_SNAPSHOT" };
    view = { operation_id: "operation", job_id: "job", state: "APPLIED", phase: "done", checkpoint_id: "checkpoint", patch_digest: plan.patch_digest, applied_paths: [plan.files[0]!.path], created_at: 1, updated_at: 2, verification: { status: "PASSED", scope: "FULL_PROJECT_SNAPSHOT", total: 8, passed: 6, failures: 0, errors: 0, skipped: 2, existing_tests_preserved: true, all_tests_present: true, exit_code: 0, reason_code: null, execution_root: "C:/private/owned" }, message: "Verified" };
  });
  afterEach(() => db.close());
  function persist() {
    db.prepare("INSERT OR REPLACE INTO apply_operations VALUES(?,?,?,?,?,?)").run(view.operation_id, "job", view.created_at, view.updated_at, JSON.stringify(plan), JSON.stringify(view));
  }
  it("reads verified success without writing, and never invents absent operations", () => {
    expect(getApplyOperationView(db, "job")).toBeNull(); persist();
    const changes = db.prepare("SELECT total_changes() AS n").get();
    expect(getApplyOperationView(db, "job")).toEqual(view);
    expect(getApplyOperationView(db, "other-job")).toBeNull();
    expect(db.prepare("SELECT total_changes() AS n").get()).toEqual(changes);
    db.exec("DROP TABLE apply_operations");
    expect(getApplyOperationView(db, "job")).toBeNull();
  });
  it.each([
    ["wrong job", () => { view.job_id = "other"; }],
    ["wrong checkpoint", () => { view.checkpoint_id = "other"; }],
    ["wrong patch", () => { view.patch_digest = "e".repeat(64); }],
    ["unknown state", () => { Object.assign(view, { state: "SUCCESS" }); }],
    ["negative counter", () => { view.verification!.failures = -1; }],
    ["fractional counter", () => { view.verification!.total = 8.5; }],
    ["counter mismatch", () => { view.verification!.passed = 7; }],
    ["unsafe counter", () => { view.verification!.total = Number.MAX_SAFE_INTEGER + 1; }],
    ["failure claimed as passed", () => { view.verification!.failures = 1; view.verification!.passed = 5; }],
    ["nonzero exit claimed as passed", () => { view.verification!.exit_code = 1; }],
    ["unpreserved tests", () => { view.verification!.existing_tests_preserved = false; }],
    ["missing tests", () => { view.verification!.all_tests_present = false; }],
    ["missing verification", () => { view.verification = null; }],
    ["unpublished file", () => { view.applied_paths = []; }],
    ["unplanned file", () => { view.applied_paths = ["src/test/java/Other.java"]; }],
    ["path traversal", () => { plan.files[0]!.path = "../outside.java"; view.applied_paths = ["../outside.java"]; }],
    ["wrong verification scope", () => { Object.assign(view.verification!, { scope: "AFFECTED_SCOPE" }); }],
  ] as const)("fails closed for %s", (_name, corrupt) => {
    corrupt(); persist(); expect(getApplyOperationView(db, "job")).toBeNull();
  });
  it("chooses the newest operation deterministically and does not fall back from a corrupt newest row", () => {
    persist(); view.operation_id = "operation-z"; view.state = "ROLLED_BACK"; view.message = "Rollback"; persist();
    expect(getApplyOperationView(db, "job")?.state).toBe("ROLLED_BACK");
    db.prepare("UPDATE apply_operations SET view_json='invalid' WHERE operation_id='operation-z'").run();
    expect(getApplyOperationView(db, "job")).toBeNull();
  });
  it("checks row and plan identity instead of trusting serialized claims", () => {
    persist(); db.prepare("UPDATE apply_operations SET operation_id='other-operation'").run();
    expect(getApplyOperationView(db, "job")).toBeNull();
    db.exec("DELETE FROM apply_operations"); plan.job_id = "other-job"; persist();
    expect(getApplyOperationView(db, "job")).toBeNull();
  });
  it("projects only the declared application fields from stored JSON", () => {
    Object.assign(view, { private_debug: "must not reach report" });
    Object.assign(view.verification!, { private_debug: "must not reach report" }); persist();
    const result = getApplyOperationView(db, "job");
    expect(result).not.toHaveProperty("private_debug");
    expect(result?.verification).not.toHaveProperty("private_debug");
  });
});
