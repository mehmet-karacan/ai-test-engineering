import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { prepareReportVerification, verifyCurrentReport } from "../../src/application/report-runtime.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { ReportExporter, type ReportData } from "../../src/reporting/report-generator.js";
import type { ApplyOperationView, ApplyPlan } from "../../src/domain/apply-contracts.js";
import { report07Data } from "../fixtures/report07-data.js";

describe("application facts remain separate from generation facts", () => {
  let root: string, jobId: string, reportRoot: string;
  let services: ReturnType<typeof createDefaultServicesForTest>;
  let exporter: ReportExporter, operation: ApplyOperationView, plan: ApplyPlan;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aitest-apply-report-"));
    services = createDefaultServicesForTest(join(root, "state.db"), join(root, "runtime"));
    services.config.storage.root = join(root, "runtime");
    const { location } = new ProjectRepository(services.storage!.db).ensureLocation(root, "fixture", null);
    jobId = services.jobs!.createJob({ locationId: location.id, requestDigest: "application" }).id;
    services.storage!.db.prepare("UPDATE test_jobs SET lifecycle='COMPLETED',outcome='TARGET_NOT_MET_BUDGET',verification_level='AFFECTED_SCOPE',apply_state='APPLYING' WHERE id=?").run(jobId);
    services.storage!.db.exec("CREATE TABLE IF NOT EXISTS apply_operations (operation_id TEXT PRIMARY KEY,job_id TEXT,created_at INTEGER,updated_at INTEGER,plan_json TEXT,view_json TEXT,owner_id TEXT,fencing_token INTEGER,approval_id TEXT)");
    plan = { schema_version: 1, job_id: jobId, project_id: "project", checkpoint_id: "checkpoint", project_root: root, source_digest: "a".repeat(64), build_digest: "b".repeat(64), patch_digest: "c".repeat(64), files: [{ path: "src/test/java/NewTest.java", sha256: "d".repeat(64), bytes: 10 }], verification_scope: "FULL_PROJECT_SNAPSHOT" };
    operation = { operation_id: "operation", job_id: jobId, state: "APPLYING", phase: "publishing", checkpoint_id: "checkpoint", patch_digest: plan.patch_digest, applied_paths: [], created_at: 10, updated_at: 10, verification: null, message: "Publishing accepted tests" };
    reportRoot = join(services.config.storage.root, "jobs", jobId, "reports");
    exporter = new ReportExporter(reportRoot);
    exporter.export({ ...report07Data(), job_id: jobId, project_root: root }, { "evidence/original.txt": "unchanged" });
  });
  afterEach(() => { services.storage!.close(); rmSync(root, { recursive: true, force: true }); });
  const read = () => JSON.parse(readFileSync(join(reportRoot, "report.json"), "utf8")) as ReportData;
  function persist() {
    services.storage!.db.prepare("INSERT OR REPLACE INTO apply_operations(operation_id,job_id,created_at,updated_at,plan_json,view_json) VALUES(?,?,?,?,?,?)")
      .run(operation.operation_id, jobId, operation.created_at, operation.updated_at, JSON.stringify(plan), JSON.stringify(operation));
  }
  it("refreshes operation progress even while the job apply state remains APPLYING", () => {
    persist();
    expect(verifyCurrentReport(services, jobId, prepareReportVerification(services, jobId)).missing).toEqual([]);
    expect(read().application).toMatchObject({ operation_id: "operation", phase: "publishing" });
    operation.phase = "verification"; operation.updated_at = 11; operation.applied_paths = [plan.files[0]!.path]; persist();
    verifyCurrentReport(services, jobId, prepareReportVerification(services, jobId));
    expect(read().application).toMatchObject({ phase: "verification", updated_at: 11, applied_paths: ["src/test/java/NewTest.java"] });
    expect(read().apply_state).toBe("APPLYING");
    const stable = readFileSync(join(reportRoot, "manifest.json"));
    verifyCurrentReport(services, jobId, prepareReportVerification(services, jobId));
    expect(readFileSync(join(reportRoot, "manifest.json"))).toEqual(stable);
  });
  it("shows full project verification counters and preserved flags without promoting generation", () => {
    operation.state = "APPLIED"; operation.phase = "done"; operation.applied_paths = [plan.files[0]!.path];
    operation.verification = { status: "PASSED", scope: "FULL_PROJECT_SNAPSHOT", total: 12, passed: 10, failures: 0, errors: 0, skipped: 2, existing_tests_preserved: true, all_tests_present: true, exit_code: 0, reason_code: null, execution_root: "C:/private/owned-copy" }; persist();
    verifyCurrentReport(services, jobId, prepareReportVerification(services, jobId));
    const report = read();
    expect(report).toMatchObject({ outcome: "TARGET_NOT_MET_BUDGET", verification_scope: "AFFECTED_SCOPE", run_summary: { total: 4, passed: 1, failed: 2, skipped: 1 }, application: { state: "APPLIED", verification: { total: 12, skipped: 2, existing_tests_preserved: true, all_tests_present: true } } });
    const html = readFileSync(join(reportRoot, "index.html"), "utf8");
    expect(html).toContain('id="application"'); expect(html).toContain("FULL_PROJECT_SNAPSHOT");
    expect(html).toContain("12 test / 10 gecti / 0 basarisiz / 0 hata / 2 atlandi");
    expect(html).toContain("hash-dogrulanmis owned kopyasi");
    expect(readFileSync(join(reportRoot, "summary.txt"), "utf8")).toContain("Application: APPLIED");
    expect(exporter.verifyExport()).toEqual({ missing: [], hash_mismatch: [] });
  });
  it("renders rollback failure details as text and keeps the original evidence", () => {
    operation.state = "ROLLED_BACK"; operation.phase = "done"; operation.message = "<script>rollback conflict</script>";
    operation.verification = { status: "FAILED", scope: "FULL_PROJECT_SNAPSHOT", total: 4, passed: 1, failures: 1, errors: 1, skipped: 1, existing_tests_preserved: true, all_tests_present: false, exit_code: 1, reason_code: "FULL_SUITE_FAILED", execution_root: "C:/private/owned-copy" }; persist();
    verifyCurrentReport(services, jobId, prepareReportVerification(services, jobId));
    const html = readFileSync(join(reportRoot, "index.html"), "utf8");
    expect(html).toContain("ROLLED_BACK"); expect(html).toContain("FULL_SUITE_FAILED");
    expect(html).toContain("&lt;script&gt;rollback conflict&lt;/script&gt;");
    expect(html).not.toContain("<script>rollback conflict</script>");
    expect(readFileSync(join(reportRoot, "evidence/original.txt"), "utf8")).toBe("unchanged");
  });
  it("leaves legacy publications unchanged after their runtime is synchronized", () => {
    verifyCurrentReport(services, jobId, prepareReportVerification(services, jobId));
    const stable = readFileSync(join(reportRoot, "manifest.json"));
    expect(read()).not.toHaveProperty("application");
    expect(readFileSync(join(reportRoot, "index.html"), "utf8")).not.toContain('id="application"');
    verifyCurrentReport(services, jobId, prepareReportVerification(services, jobId));
    expect(readFileSync(join(reportRoot, "manifest.json"))).toEqual(stable);
  });
  it("never refreshes application data over tampered evidence", () => {
    persist(); writeFileSync(join(reportRoot, "evidence/original.txt"), "tampered");
    const before = readFileSync(join(reportRoot, "report.json"));
    expect(verifyCurrentReport(services, jobId).hash_mismatch).toContain("evidence/original.txt");
    expect(readFileSync(join(reportRoot, "report.json"))).toEqual(before);
  });
});
