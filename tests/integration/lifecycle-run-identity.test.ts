import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../../src/storage/storage.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { InventoryRepository, type RunOutputTruncation } from "../../src/storage/inventory-repository.js";
import { CandidateLoop, type IterateOptions } from "../../src/orchestration/candidate-loop.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import { createDefaultServicesForTest, handleTestStart } from "../../src/application/services.js";
import { JobDispatcher, type GoalContract } from "../../src/orchestration/job-dispatcher.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";
import * as buildPlans from "../../src/orchestration/build-plan.js";

describe("physical run and candidate identity across continuation", () => {
  let root: string;
  let storage: Storage;
  let inventory: InventoryRepository;
  let jobId: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aitest-lifecycle-identity-"));
    storage = new Storage({ dbPath: join(root, "state.db") }); storage.migrate();
    inventory = new InventoryRepository(storage.db, new ArtifactStore({ root }));
    const { location } = new ProjectRepository(storage.db).ensureLocation(root, "continuation", null);
    jobId = new JobRepository(storage.db).createJob({ locationId: location.id, requestDigest: "fixture" }).id;
  });
  afterEach(() => { vi.restoreAllMocks(); storage.close(); rmSync(root, { recursive: true, force: true }); });
  const truncation = (bytes: number): RunOutputTruncation => ({ stdout_raw_dropped_bytes: bytes,
    stderr_raw_dropped_bytes: 0, stdout_rendered_dropped_bytes: 0, stderr_rendered_dropped_bytes: 0,
    stdout_reason: "BYTE_BUDGET_EXCEEDED", stderr_reason: null });
  const input = (job_id: string, started_at: number) => ({ job_id, stage: "baseline" as const,
    attempt_ordinal: null, iteration_ordinal: null, execution_root: root,
    command: ["fixture"], stdout_log_path: join(root, "stdout.log"), stderr_log_path: join(root, "stderr.log"),
    exit_code: 0, timed_out: false, test_inventory: [], coverage_report_path: "", coverage_report_sha256: null,
    coverage_report_paths: [], started_at, finished_at: started_at + 100 });

  it("keeps distinct baseline executions and their truncation receipts while retrying the same receipt idempotently", () => {
    const first = { ...input(jobId, 1000), output_truncation: truncation(2) };
    const second = { ...input(jobId, 2000), output_truncation: truncation(3), exit_code: 1 };
    const firstId = inventory.writeTestRunProvenance(first);
    const secondId = inventory.writeTestRunProvenance(second);
    expect(secondId).not.toBe(firstId);
    expect(inventory.writeTestRunProvenance(first)).toBe(firstId);
    expect(inventory.writeTestRunProvenance(second)).toBe(secondId);
    expect(inventory.listTestRunProvenance(jobId).map(row => [row.id, row.started_at, row.exit_code]))
      .toEqual([[firstId, 1000, 0], [secondId, 2000, 1]]);
    expect(storage.db.prepare("SELECT id FROM artifacts WHERE job_id=? AND kind='run_output_truncation'").all(jobId)).toHaveLength(2);
  });

  it("does not replace a resumed baseline with the earlier successful run", () => {
    const firstId = inventory.writeTestRunProvenance(input(jobId, 1000));
    const secondId = inventory.writeTestRunProvenance({ ...input(jobId, 2000), exit_code: 1 });
    expect(secondId).not.toBe(firstId);
    expect(inventory.listTestRunProvenance(jobId).map(row => row.exit_code)).toEqual([0, 1]);
  });

  it("does not reclaim legacy consumed slots when a newer attempt fails before an agent task is created", () => {
    inventory.reserveCandidateAttempt(jobId, 2, 1, null);
    expect(inventory.candidateAttemptUsage(jobId)).toEqual({ attempts_used: 2, next_ordinal: 3 });
  });

  it("continues durable candidate ordinals after resume or a preceding target", async () => {
    const decisions: number[] = [];
    const options: IterateOptions = { project_root: root, target_fqn: "fixture.Target", target_module_path: "",
      target_test_root: "src/test/java", target_relative_path: "src/main/java/fixture/Target.java",
      line_target_bps: 8000, branch_target_bps: 0,
      budget: { max_candidate_iterations: 5, max_repairs_per_candidate: 0, no_progress_window: 1 },
      attempt_budget: 1, baseline_coverage: { line: { covered: 1, missed: 9 }, branch: undefined },
      workspace_root: join(root, "candidate"), timeout_ms_per_run: 1000,
      generate_candidate: async () => { throw new Error("synthetic provider interruption"); },
      on_decision: info => {
        decisions.push(info.attempt_ordinal);
        inventory.writeCandidateIteration({ job_id: jobId, parent_checkpoint_id: null,
          attempt_ordinal: info.attempt_ordinal, iteration_ordinal: info.iteration,
          changeset_hash: `fixture-${info.iteration}`, strategy_key: null, decision: info.decision,
          decision_reason: info.reason, coverage_before_bps: info.coverage_before_bps,
          coverage_after_bps: info.coverage_after_bps, error_fingerprint: null });
      },
    };
    const loop = new CandidateLoop(new MavenRunner());
    await loop.iterate(options, 1);
    await loop.iterate({ ...options, start_attempt_ordinal: 2 }, 2);
    expect(decisions).toEqual([1, 2]);
    expect(inventory.listCandidateIterations(jobId).map(row => row.attempt_ordinal)).toEqual([1, 2]);
  });

  it("dispatch allocates job-wide ordinals for resumed decisions and every later target", async () => {
    const project = join(root, "project");
    cpSync(join(process.cwd(), "tests/fixtures/sample-maven-project"), project, { recursive: true });
    writeFileSync(join(project, "src/main/java/com/example/payment/OtherService.java"), "package com.example.payment;\npublic class OtherService {}\n");
    const services = createDefaultServicesForTest(join(root, "app/state.db"), join(root, "runtime"));
    services.config.storage.root = join(root, "runtime");
    let goal: GoalContract | undefined;
    const launch = vi.spyOn(JobDispatcher.prototype, "dispatch").mockImplementation(async (job, inputGoal) => {
      goal = inputGoal; return { job_id: job.id, phases_completed: [], final_outcome: "BOUNDARY", best_coverage: null, error: null };
    });
    try {
      const start = await handleTestStart({ project_root: project,
        targets: [{ selector: "PaymentService", kind: "class" }, { selector: "OtherService", kind: "class" }],
        coverage: { percent: 80, metrics: ["LINE"] } }, services);
      launch.mockRestore();
      const inv = new InventoryRepository(services.storage!.db);
      inv.writeCandidateIteration({ job_id: start.job_id, parent_checkpoint_id: null, attempt_ordinal: 4,
        iteration_ordinal: 2, changeset_hash: "previous", strategy_key: null, decision: "rejected", decision_reason: "fixture",
        coverage_before_bps: 0, coverage_after_bps: null, error_fingerprint: null });
      vi.spyOn(CustomerRunnerFactory.prototype, "assertHostDevOnlyAllowed").mockImplementation(() => undefined);
      vi.spyOn(buildPlans, "runBaseline").mockResolvedValue({ status: "PASSED", run: null, failed_tests: [], total_tests: 1,
        failures: 0, errors: 0, skipped: 0, reason_code: null, malformed_reports: [], skip_config_detected: [],
        execution_root: project, test_inventory: [], run_started_at: null, run_finished_at: null });
      const ordinals: number[] = [];
      vi.spyOn(CandidateLoop.prototype, "iterate").mockImplementation(async options => {
        const ordinal = options.start_attempt_ordinal!; ordinals.push(ordinal);
        const iteration = ordinal - 2;
        options.on_attempt!({ attempt_ordinal: ordinal, iteration });
        options.on_accepted!({ attempt_ordinal: ordinal, iteration, changeset_hash: `candidate-${ordinal}`,
          coverage_before_bps: 0, reason: "fixture accepted", files: [], line_bps: 1000, branch_bps: null,
          remaining_budget: { max_candidate_iterations: 1, max_repairs_per_candidate: 0, no_progress_window: 1 } });
        // A process may die immediately after checkpoint publication and
        // before CandidateLoop invokes on_decision. The decision is durable.
        expect(services.storage!.db.prepare("SELECT decision FROM candidate_iterations WHERE job_id=? AND attempt_ordinal=?")
          .get(start.job_id, ordinal)).toEqual({ decision: "adopted" });
        options.on_decision!({ attempt_ordinal: ordinal, iteration: 3, decision: "rejected", reason: "fixture",
          changeset_hash: `candidate-${ordinal}`, coverage_before_bps: 0, coverage_after_bps: null });
        return { best_coverage_bps: 0, best_branch_coverage_bps: null, iterations: [], budget_exhausted: false,
          plateau: true, outcome: "TARGET_NOT_MET_PLATEAU", trusted_workspace: null, repairs_used: 0, no_progress_count: 1, attempts_used: 1 };
      });
      vi.spyOn(CandidateLoop.prototype, "replayAcceptedSet").mockRejectedValue(new Error("fixture final boundary"));
      const dispatcher = new JobDispatcher({ services, runnerKind: "host_dev_only", workerEnabled: false, workspaceRoot: services.config.storage.root });
      await dispatcher.dispatch(services.jobs!.getJob(start.job_id), { ...goal!, runner_kind: "host_dev_only", start_iteration: 3 }, project);
      expect(ordinals).toEqual([5, 6]);
      expect(inv.listCandidateIterations(start.job_id).map(row => row.attempt_ordinal)).toEqual([4, 5, 6]);
    } finally { services.storage!.close(); }
  });
});
