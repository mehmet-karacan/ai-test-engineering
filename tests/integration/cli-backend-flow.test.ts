import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultServicesForTest, handleTestStart } from "../../src/application/services.js";
import { handleTestResume } from "../../src/application/job-tools.js";
import { JobDispatcher, type GoalContract } from "../../src/orchestration/job-dispatcher.js";
import { resolveWorkerBinding } from "../../src/workers/backend-config.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";

describe("CLI backend immutable flow", () => {
  let root: string;
  let project: string;
  let bridge: string;
  let services: ReturnType<typeof createDefaultServicesForTest>;
  let captured: GoalContract;
  let dispatcher: JobDispatcher;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aitest-cli-flow-"));
    project = join(root, "project");
    cpSync(join(process.cwd(), "tests/fixtures/sample-maven-project"), project, { recursive: true });
    bridge = join(root, "client.mjs"); writeFileSync(bridge, "// fixture v1");
    services = createDefaultServicesForTest(join(root, "state.db"), join(root, "runtime"));
    services.config.storage.root = join(root, "runtime");
    services.config.worker_profiles = [{ profile_name: "other", provider_id: "fixture", model_id: "model", secret_reference_names: [], backend: { kind: "cli_json", command: [process.execPath, bridge] } }];
    services.config.default_worker_profile = "other";
    dispatcher = new JobDispatcher({ services, runnerKind: "windows_native", workerEnabled: true, workspaceRoot: services.config.storage.root });
    vi.spyOn(JobDispatcher.prototype, "dispatch").mockImplementation(async (job, goal) => {
      captured = goal;
      return { job_id: job.id, phases_completed: [], final_outcome: "STUB", best_coverage: null, error: null };
    });
  });
  afterEach(() => { vi.restoreAllMocks(); services.storage!.close(); rmSync(root, { recursive: true, force: true }); });
  const request = () => ({ project_root: project, targets: [{ selector: "com.example.payment.PaymentService", kind: "class" }], coverage: { percent: 80 } });
  function persist(jobId: string): void {
    const job = services.jobs!.getJob(jobId);
    // Exercise the actual dispatcher persistence boundary without Maven/model work.
    (dispatcher as unknown as { persistJobContract(...args: unknown[]): unknown }).persistJobContract(services.storage!, job, captured, { source_digest: "a".repeat(64), build_digest: "b".repeat(64) });
  }
  it("freezes the configured CLI and effective model, preserving idempotence", async () => {
    const first = await handleTestStart(request(), services);
    expect(captured.model_profile).toBe("fixture/model");
    expect(captured).toHaveProperty("worker_binding", resolveWorkerBinding(services.config, {}));
    persist(first.job_id);
    const row = services.storage!.db.prepare<[string], { relative_store_path: string }>("SELECT relative_store_path FROM artifacts WHERE job_id=? AND kind='job_contract'").get(first.job_id)!;
    expect(JSON.parse(readFileSync(join(services.config.storage.root, row.relative_store_path), "utf8"))).toHaveProperty("worker_binding", resolveWorkerBinding(services.config, {}));
    expect((await handleTestStart(request(), services)).job_id).toBe(first.job_id);
    writeFileSync(bridge, "// fixture v2");
    expect((await handleTestStart(request(), services)).job_id).not.toBe(first.job_id);
  });
  it("keeps legacy OpenCode goals free of new backend fields", async () => {
    services.config.worker_profiles = [];
    delete services.config.default_worker_profile;
    await handleTestStart(request(), services);
    expect(captured.model_profile).toBeNull();
    expect(captured).not.toHaveProperty("worker_binding");
  });
  it.each(["binary", "profile", "backend", "reference"])("rejects changed %s before resume native probing or lifecycle mutation", async change => {
    const first = await handleTestStart(request(), services); persist(first.job_id);
    const job = services.jobs!.getJob(first.job_id);
    services.jobs!.updateLifecycle(job.id, "PAUSED", job.row_version);
    const before = services.jobs!.getJob(job.id);
    if (change === "binary") writeFileSync(bridge, "// changed input");
    if (change === "profile") services.config.worker_profiles = [];
    if (change === "backend") services.config.worker_profiles[0]!.backend = { kind: "opencode" };
    if (change === "reference") services.config.worker_profiles[0]!.secret_reference_names = ["NEW_CREDENTIAL"];
    const probe = vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => { throw new Error("probe must not run"); });
    await expect(handleTestResume({ job_id: job.id }, services)).rejects.toMatchObject({ code: "POLICY_VIOLATION", details: { reason_code: "CONTRACT_CONFLICT" } });
    expect(probe).not.toHaveBeenCalled();
    expect(services.jobs!.getJob(job.id)).toEqual(before);
  });
});
