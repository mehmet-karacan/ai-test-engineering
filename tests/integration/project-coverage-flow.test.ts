import { describe, it, expect, vi, afterEach } from "vitest";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDefaultServicesForTest, handleTestStart, handleTestStatus } from "../../src/application/services.js";
import { handleTestResult } from "../../src/application/job-tools.js";
import { writeProjectCoverageResult } from "../../src/storage/project-coverage-result.js";
import * as buildPlans from "../../src/orchestration/build-plan.js";
import * as analysis from "../../src/coverage/project-coverage.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";
import { NativeToolchainRecordStore } from "../../src/orchestration/native-toolchain-record.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { prepareCoverageWorkspace } from "../../src/orchestration/coverage-workspace.js";
import { handleProjectCoverage } from "../../src/application/project-coverage.js";
import { JobDispatcher, type GoalContract } from "../../src/orchestration/job-dispatcher.js";
import { createToolRegistry } from "../../src/mcp/server-setup.js";

afterEach(() => vi.restoreAllMocks());
describe("project coverage proposal flow", () => {
  const candidate = { fqn: "com.example.payment.PaymentService", module_path: "", relative_path: "src/main/java/com/example/payment/PaymentService.java", suitable: true, reasons: [], line: { covered: 0, missed: 10, percent: 0 }, branch: { covered: 0, missed: 2, percent: 0 } };
  const measured = { status: "COMPLETE" as const, selection_required: true as const, overall: { line: candidate.line, branch: candidate.branch }, classes: [candidate], recommendations: [candidate], reports: [], unmeasured: { source_classes: 0, report_classes: 0, details: [] } };
  it("registers an analysis tool, resolves one nested Maven root and starts no target/model generation", async () => {
    const root = mkdtempSync(join(tmpdir(), "coverage-flow-"));
    const services = createDefaultServicesForTest(join(root, "store/state.db"), join(root, "store"));
    services.config.storage.root = join(root, "store");
    const project = join(root, "customer/backend");
    mkdirSync(project, { recursive: true });
    cpSync(join(process.cwd(), "tests/fixtures/sample-maven-project"), project, { recursive: true });
    let captured: GoalContract | undefined;
    const dispatch = vi.spyOn(JobDispatcher.prototype, "dispatch").mockImplementation(async (job, goal) => {
      captured = goal;
      return { job_id: job.id, phases_completed: [], final_outcome: "STUB", best_coverage: null, error: null };
    });
    try {
      expect(createToolRegistry(services).get("project_coverage")).toBeDefined();
      const input = { project_root: join(root, "customer"), idempotency_key: "first-project-scan" };
      const first = await handleProjectCoverage(input, services);
      expect(dispatch).not.toHaveBeenCalled(); // Heavy native preparation starts after the handle is returned.
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(first.project_root).toBe(project);
      expect(first.created).toBe(true);
      expect(captured?.targets).toEqual([]);
      expect(captured?.model_profile).toBeNull();
      expect(captured?.coverage_scan).toMatchObject({ below_percent: 80, recommendation_limit: 5 });
      const again = await handleProjectCoverage(input, services);
      expect(again.job_id).toBe(first.job_id);
      expect(again.created).toBe(false);
      expect(dispatch).toHaveBeenCalledTimes(1);
      await expect(handleTestStart({ project_root: project, targets: [], coverage: { percent: 80 } }, services)).rejects.toThrow();
      const cancelled = await handleProjectCoverage({ ...input, idempotency_key: "cancel-before-preflight" }, services);
      services.jobs!.updateLifecycle(cancelled.job_id, "CANCELLED", services.jobs!.getJob(cancelled.job_id).row_version);
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(dispatch).toHaveBeenCalledTimes(1);
    } finally { services.storage!.close(); rmSync(root, { recursive: true, force: true }); }
  });

  it.each(["PASSED", "FAILED"] as const)("uses an unfiltered baseline (%s) and never generates before selection", async (baselineStatus) => {
    const root = mkdtempSync(join(tmpdir(), "coverage-dispatch-"));
    const project = join(root, "project");
    cpSync(join(process.cwd(), "tests/fixtures/sample-maven-project"), project, { recursive: true });
    const services = createDefaultServicesForTest(join(root, "store/state.db"), join(root, "store"));
    services.config.storage.root = join(root, "store");
    vi.spyOn(LeaseManager.prototype, "acquireNative").mockImplementation(function(this: LeaseManager, id, owner, ttl) { return this.acquire(id, owner, ttl); });
    vi.spyOn(CustomerRunnerFactory.prototype, "prepareNativeCustomerToolchain").mockResolvedValue({ identity: "fixture" } as never);
    vi.spyOn(NativeToolchainRecordStore.prototype, "pin").mockReturnValue("fixture");
    vi.spyOn(analysis, "analyzeProjectCoverage").mockReturnValue(measured);
    const baseline = vi.spyOn(buildPlans, "runBaseline").mockImplementation(async (source, _runner, _timeout, options) => {
      const execution = prepareCoverageWorkspace(source, options!.workspace_root!);
      const logs = join(execution, "target"); mkdirSync(logs, { recursive: true });
      writeFileSync(join(logs, "stdout.log"), "real boundary fixture"); writeFileSync(join(logs, "stderr.log"), "");
      return { status: baselineStatus, run: { exit_code: baselineStatus === "PASSED" ? 0 : 1, duration_ms: 1, stdout_log_path: join(logs, "stdout.log"), stderr_log_path: join(logs, "stderr.log"), command: ["mvn", "test"], timed_out: false }, failed_tests: baselineStatus === "PASSED" ? [] : ["existingBrokenTest"], total_tests: 2, failures: baselineStatus === "PASSED" ? 0 : 1, errors: 0, skipped: 0, reason_code: null, malformed_reports: [], skip_config_detected: [], execution_root: execution, test_inventory: [], run_started_at: Date.now()-10, run_finished_at: Date.now() };
    });
    try {
      const started = await handleProjectCoverage({ project_root: project }, services);
      await expect.poll(() => services.jobs!.getJob(started.job_id).lifecycle).toBe(baselineStatus === "PASSED" ? "WAITING_INPUT" : "FAILED");
      expect(baseline.mock.calls[0]![3]).toMatchObject({ collect_coverage: true, coverage_mode: "cli", test_selectors: [] });
      const result = await handleTestResult({ job_id: started.job_id }, services);
      if (baselineStatus === "FAILED") {
        expect(result.coverage_scan).toBeUndefined();
        expect(result.coverage_scan_failure).toMatchObject({ status: "FAILED", code: "BASELINE_FAILED" });
        expect(analysis.analyzeProjectCoverage).not.toHaveBeenCalled();
        return;
      }
      expect(result.coverage_scan?.recommendations).toEqual([candidate]);
      expect(result.coverage_scan?.class_count).toBe(1);
      expect((await handleTestStatus({ job_id: started.job_id }, services)).required_action).toContain("kullanici");
      expect(services.storage!.db.prepare("SELECT COUNT(*) AS n FROM agent_tasks").get()).toEqual({ n: 0 });
      expect(services.storage!.db.prepare("SELECT COUNT(*) AS n FROM candidate_iterations").get()).toEqual({ n: 0 });
      // A new handler instance reads the same immutable SQLite/blob result.
      expect((await handleTestResult({ job_id: started.job_id }, { ...services })).coverage_scan?.run_id).toBeTruthy();
    } finally { services.storage!.close(); rmSync(root, { recursive: true, force: true }); }
  });

  it("starts only the selected proposal, carries CLI mode, rejects changed/foreign source and altered evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "coverage-selection-"));
    const project = join(root, "project");
    cpSync(join(process.cwd(), "tests/fixtures/sample-maven-project"), project, { recursive: true });
    const services = createDefaultServicesForTest(join(root, "store/state.db"), join(root, "store"));
    services.config.storage.root = join(root, "store");
    let goal: GoalContract | undefined;
    vi.spyOn(JobDispatcher.prototype, "dispatch").mockImplementation(async (job, input) => {
      goal = input; return { job_id: job.id, phases_completed: [], final_outcome: "STUB", best_coverage: null, error: null };
    });
    try {
      const started = await handleProjectCoverage({ project_root: project }, services);
      await new Promise<void>(resolve => setImmediate(resolve));
      const scanGoal = goal!.coverage_scan!;
      writeProjectCoverageResult(services, { ...measured, job_id: started.job_id, project_root: project, source_digest: scanGoal.source_digest, build_digest: scanGoal.build_digest, coverage_mode: "cli", run_id: "baseline-run", tests: { total: 2, failures: 0, errors: 0, skipped: 0 } });
      services.jobs!.updateOutcome(started.job_id, "COVERAGE_ANALYZED", services.jobs!.getJob(started.job_id).row_version);
      services.jobs!.updateLifecycle(started.job_id, "WAITING_INPUT", services.jobs!.getJob(started.job_id).row_version);
      const input = { project_root: project, coverage_scan_id: started.job_id, targets: [{ selector: candidate.fqn, kind: "class" }], coverage: { percent: 80, metrics: ["LINE", "BRANCH"] } };
      const selected = await handleTestStart(input, services);
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(selected.created).toBe(true); expect(goal?.coverage_mode).toBe("cli");
      expect(goal?.targets.map(t => t.selector)).toEqual([candidate.fqn]);
      await expect(handleTestStart({ ...input, targets: [{ selector: "NotRecommended", kind: "class" }] }, services)).rejects.toThrow(/Onerilerden/);
      const foreign = join(root, "foreign"); cpSync(project, foreign, { recursive: true });
      await expect(handleTestStart({ ...input, project_root: foreign }, services)).rejects.toThrow(/baska projeye/);
      writeFileSync(join(project, "new-source.txt"), "changed after scan");
      await expect(handleTestStart(input, services)).rejects.toThrow(/degisti/);
      const row = services.storage!.db.prepare("SELECT sha256 FROM artifacts WHERE kind='project_coverage'").get() as { sha256: string };
      writeFileSync(services.artifacts!.blobPath(row.sha256), "tampered");
      await expect(handleTestResult({ job_id: started.job_id }, services)).rejects.toThrow(/hash|bytes/);
    } finally { services.storage!.close(); rmSync(root, { recursive: true, force: true }); }
  });
});
