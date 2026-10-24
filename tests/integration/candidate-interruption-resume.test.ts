import { afterEach, describe, expect, it, vi } from "vitest";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultServicesForTest, handleTestStart } from "../../src/application/services.js";
import { JobDispatcher, type GoalContract } from "../../src/orchestration/job-dispatcher.js";
import { CandidateLoop } from "../../src/orchestration/candidate-loop.js";
import type { AgentExecutionOutcome } from "../../src/orchestration/agent-scheduler.js";
import { CandidateAgentSessionAdapter } from "../../src/orchestration/candidate-agent-session-adapter.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";
import * as buildPlans from "../../src/orchestration/build-plan.js";
import * as workerServers from "../../src/workers/opencode/worker-server-manager.js";
import * as profiles from "../../src/workers/opencode/profile-reader.js";
import * as dependencies from "../../src/workers/opencode/dependency-context.js";

afterEach(() => vi.restoreAllMocks());
const outcome: AgentExecutionOutcome = { kind: "PROVIDER_ERROR", summary: "", findings_count: 0,
  blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "synthetic stop" };

describe("dispatcher durable candidate interruption recovery", () => {
  it.each([false, true])("consumes the interrupted call and starts a new physical task (legacy=%s)", async legacy => {
    await runInterrupted(2, legacy);
  });
  it("does not restart the model when the interrupted call consumed the final job attempt", async () => {
    await runInterrupted(1, true);
  });
});

async function runInterrupted(maxAttempts: number, legacy: boolean): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "aitest-candidate-resume-"));
  const project = join(root, "project");
  cpSync(join(process.cwd(), "tests/fixtures/sample-maven-project"), project, { recursive: true });
  const services = createDefaultServicesForTest(join(root, "state.db"), join(root, "runtime"));
  services.config.storage.root = join(root, "runtime");
  services.config.budgets.max_candidate_iterations = maxAttempts;
  services.config.budgets.max_repairs_per_candidate = 0;
  services.config.budgets.no_progress_window = 1;
  let goal: GoalContract | undefined;
  const launch = vi.spyOn(JobDispatcher.prototype, "dispatch").mockImplementation(async (job, value) => {
    goal = value; return { job_id: job.id, phases_completed: [], final_outcome: "BOUNDARY", best_coverage: null, error: null };
  });
  let finishOld: ((value: AgentExecutionOutcome) => void) | undefined;
  let firstDispatch: Promise<unknown> | undefined;
  try {
    const start = await handleTestStart({ project_root: project, targets: [{ selector: "PaymentService", kind: "class" }],
      coverage: { percent: 80, metrics: ["LINE"] }, model_profile: "fixture/model" }, services);
    launch.mockRestore();
    vi.spyOn(CustomerRunnerFactory.prototype, "assertHostDevOnlyAllowed").mockImplementation(() => undefined);
    vi.spyOn(buildPlans, "runBaseline").mockResolvedValue({ status: "PASSED", run: null, failed_tests: [], total_tests: 1,
      failures: 0, errors: 0, skipped: 0, reason_code: null, malformed_reports: [], skip_config_detected: [],
      execution_root: project, test_inventory: [], run_started_at: null, run_finished_at: null });
    vi.spyOn(workerServers, "defaultWorkerServerManager").mockImplementation(() => ({
      ensureRunning: async () => ({ createSession: async () => ({ session_id: "synthetic-session" }) }),
      stopOwnedServer: async () => undefined,
    }) as never);
    vi.spyOn(profiles, "readWorkerProfileFromOpencodeConfig").mockReturnValue({ provider_id: "fixture", model_id: "model",
      base_url: null, api_key_reference: null, timeout_ms: null, source: "synthetic" });
    vi.spyOn(dependencies, "buildDependencyContext").mockResolvedValue({ text: "", relativePaths: [], lineRanges: [], omitted: [] });
    const execute = vi.spyOn(CandidateAgentSessionAdapter.prototype, "execute")
      .mockImplementationOnce(async () => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValue(outcome);
    const iterate = vi.spyOn(CandidateLoop.prototype, "iterate");
    vi.spyOn(CandidateLoop.prototype, "replayAcceptedSet").mockRejectedValue(new Error("synthetic final boundary"));
    const dispatcher = new JobDispatcher({ services, runnerKind: "host_dev_only", workerEnabled: true, workspaceRoot: services.config.storage.root });
    firstDispatch = dispatcher.dispatch(services.jobs!.getJob(start.job_id), { ...goal!, runner_kind: "host_dev_only" }, project);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const db = services.storage!.db;
    const pendingBefore = db.prepare("SELECT decision FROM candidate_iterations WHERE job_id=?").all(start.job_id);
    // Simulate a pre-upgrade crash that has durable agent attempt but no
    // candidate decision row. Current runs must reserve that row first.
    if (legacy) db.prepare("DELETE FROM candidate_iterations WHERE job_id=?").run(start.job_id);
    db.prepare("UPDATE job_leases SET expires_at=0 WHERE job_id=?").run(start.job_id);
    if (legacy) db.prepare("UPDATE agent_tasks SET lease_expires_at=0 WHERE job_id=?").run(start.job_id);
    services.jobs!.updateLifecycle(start.job_id, "INTERRUPTED", services.jobs!.getJob(start.job_id).row_version);
    await dispatcher.resumeDispatch(services.jobs!.getJob(start.job_id), project, "fixture/model");
    finishOld!(outcome); await firstDispatch; firstDispatch = undefined;
    const attempts = db.prepare("SELECT status FROM agent_attempts WHERE job_id=? ORDER BY started_at,attempt_id").all(start.job_id);
    expect(attempts[0]).toMatchObject({ status: "INTERRUPTED" });
    if (!legacy) expect(pendingBefore).toEqual([{ decision: "needs_review" }]);
    if (maxAttempts > 1) {
      expect(execute).toHaveBeenCalledTimes(2);
      expect(attempts).toHaveLength(2);
      expect(db.prepare("SELECT task_id FROM agent_tasks WHERE job_id=?").all(start.job_id)).toHaveLength(2);
      expect(iterate.mock.calls[1]![0].attempt_budget).toBe(1);
      if (!legacy) expect(db.prepare("SELECT decision,error_fingerprint FROM candidate_iterations WHERE job_id=? ORDER BY attempt_ordinal").all(start.job_id)[0])
        .toMatchObject({ decision: "rejected", error_fingerprint: "CANDIDATE_ATTEMPT_INTERRUPTED" });
    } else {
      expect(execute).toHaveBeenCalledTimes(1);
      expect(iterate.mock.calls[1]![0].attempt_budget).toBe(0);
      expect((await iterate.mock.results[1]!.value).outcome).toBe("TARGET_NOT_MET_BUDGET");
    }
  } finally {
    finishOld?.(outcome); await firstDispatch;
    services.storage!.close(); rmSync(root, { recursive: true, force: true });
  }
}
