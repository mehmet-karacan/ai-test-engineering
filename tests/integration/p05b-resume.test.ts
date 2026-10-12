/**
 * P05-B/PP15/PP24: handler -> resumeDispatch -> dispatch zinciri.
 * Docker/Maven calistirmasi bu testin kapsami degildir; son dispatch siniri
 * spy ile durdurulur, frozen hedef/contract/model/butce resume'da gercek koddan
 * yeniden kurulmus olarak assertion'a girer.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createDefaultServicesForTest, handleTestStart } from "../../src/application/services.js";
import { handleTestResume } from "../../src/application/job-tools.js";
import { JobDispatcher, type GoalContract } from "../../src/orchestration/job-dispatcher.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";
import type { Services } from "../../src/application/services.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const MODEL = "litellm/Qwen3.8-27B-IT";

interface PreparedJob {
  services: Services;
  projectDir: string;
  jobId: string;
  goal: GoalContract;
  artifactRoot: string;
}

const digest = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

async function prepareJob(): Promise<PreparedJob> {
  const dir = join(tmpdir(), `aitest-p05b-resume-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const projectDir = join(dir, "project");
  const artifactRoot = join(dir, "artifacts");
  const services = createDefaultServicesForTest(join(dir, "state.db"), artifactRoot);
  services.config.storage.root = artifactRoot;
  cpSync(join(FIXTURES, "sample-maven-project"), projectDir, { recursive: true });

  let initialGoal: GoalContract | null = null;
  const dispatchSpy = vi.spyOn(JobDispatcher.prototype, "dispatch").mockImplementation(async (_job, goal) => {
    initialGoal = goal;
    return { job_id: goal.job_id, phases_completed: [], final_outcome: "TEST_ONLY_STUB", best_coverage: null, error: null };
  });
  const started = await handleTestStart({
    project_root: projectDir,
    targets: [{ selector: "PaymentService", kind: "class" }],
    coverage: { percent: 90, metrics: ["LINE", "BRANCH"] },
    mode: "TEST_ONLY",
    model_profile: MODEL,
  }, services);
  dispatchSpy.mockRestore();

  expect(started.created).toBe(true);
  expect(initialGoal).not.toBeNull();
  const goal = initialGoal!;
  const contract = {
    schema_version: 1,
    job_id: started.job_id,
    project_root: projectDir,
    targets: goal.targets,
    budget: goal.budget,
    runner_kind: goal.runner_kind,
    model_profile: MODEL,
    contract_hash: "pending",
  };
  const contractJson = JSON.stringify(contract, null, 2);
  const contractHash = digest(contractJson);
  const contractDir = join(artifactRoot, "jobs", started.job_id, "contract");
  mkdirSync(contractDir, { recursive: true });
  writeFileSync(join(contractDir, contractHash), contractJson, "utf8");
  services.storage!.db.prepare(
    "INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, pin_reason, created_at) VALUES (?, ?, 'job_contract', ?, ?, ?, '1', 'internal', 'READY', 'job_contract', ?)",
  ).run(
    randomUUID(),
    started.job_id,
    `jobs/${started.job_id}/contract/${contractHash}`,
    contractHash,
    Buffer.byteLength(contractJson, "utf8"),
    Date.now(),
  );

  return { services, projectDir, jobId: started.job_id, goal, artifactRoot };
}

describe("P05-B resume zinciri", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanups.length > 0) {
      cleanups.pop()!();
    }
  });

  it("test_resume ayni frozen job/target/model/butce ile resumeDispatch'e ulasir", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => {
      prepared.services.storage?.close();
      rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true });
    });

    let resumedGoal: GoalContract | null = null;
    const dispatchSpy = vi.spyOn(JobDispatcher.prototype, "dispatch").mockImplementation(async (_job, goal) => {
      resumedGoal = goal;
      return { job_id: goal.job_id, phases_completed: ["resume_dispatch_boundary"], final_outcome: "TEST_ONLY_STUB", best_coverage: null, error: null };
    });
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);

    const result = await handleTestResume({ job_id: prepared.jobId, model_profile: MODEL }, prepared.services);
    for (let i = 0; i < 20 && resumedGoal === null; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(result).toMatchObject({ job_id: prepared.jobId, resumed: true, lifecycle: "RUNNING" });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(resumedGoal?.job_id).toBe(prepared.jobId);
    expect(resumedGoal?.model_profile).toBe(MODEL);
    expect(resumedGoal?.targets).toEqual(prepared.goal.targets);
    expect(resumedGoal?.concrete_targets_digest).toBe(prepared.goal.concrete_targets_digest);
    expect(resumedGoal?.contract_budget).toEqual(prepared.goal.budget);
    expect(resumedGoal?.attempt_budget).toBe(prepared.goal.budget.max_candidate_iterations);
  });

  it("resume modeli immutable contract'tan farkliysa dispatch'e ulasmadan fail-closed olur", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => {
      prepared.services.storage?.close();
      rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true });
    });

    const dispatchSpy = vi.spyOn(JobDispatcher.prototype, "dispatch").mockResolvedValue({
      job_id: prepared.jobId,
      phases_completed: [],
      final_outcome: "UNEXPECTED",
      best_coverage: null,
      error: null,
    });
    const dispatcher = new JobDispatcher({
      services: prepared.services,
      runnerKind: prepared.goal.runner_kind,
      workerEnabled: false,
      workspaceRoot: prepared.artifactRoot,
    });

    await expect(dispatcher.resumeDispatch(prepared.services.jobs!.getJob(prepared.jobId), prepared.projectDir, "litellm/GLM-5.3-Flash-IT"))
      .rejects.toMatchObject({ code: "POLICY_VIOLATION", details: { reason_code: "CONTRACT_CONFLICT" } });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("legacy runner job'u RUNNING yapmadan explicit revision ister", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => {
      prepared.services.storage?.close();
      rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true });
    });
    const jobBefore = prepared.services.jobs!.getJob(prepared.jobId);
    const artifact = prepared.services.storage!.db.prepare<[string], { relative_store_path: string }>(
      "SELECT relative_store_path FROM artifacts WHERE job_id = ? AND kind = 'job_contract'",
    ).get(prepared.jobId)!;
    writeFileSync(join(prepared.artifactRoot, artifact.relative_store_path), JSON.stringify({ runner_kind: "docker" }));
    const dispatchSpy = vi.spyOn(JobDispatcher.prototype, "dispatch");
    await expect(handleTestResume({ job_id: prepared.jobId, model_profile: MODEL }, prepared.services))
      .rejects.toMatchObject({ code: "POLICY_VIOLATION", details: { reason_code: "RUNNER_CONTRACT_CONFLICT" } });
    expect(prepared.services.jobs!.getJob(prepared.jobId).lifecycle).toBe(jobBefore.lifecycle);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("native process ownership eksikse resume lifecycle RUNNING olmaz", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => {
      prepared.services.storage?.close();
      rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true });
    });
    const before = prepared.services.jobs!.getJob(prepared.jobId).lifecycle;
    await expect(handleTestResume({ job_id: prepared.jobId, model_profile: MODEL }, prepared.services))
      .rejects.toMatchObject({ details: { reason_code: "NATIVE_PROCESS_OWNERSHIP_UNVERIFIED" } });
    expect(prepared.services.jobs!.getJob(prepared.jobId).lifecycle).toBe(before);
  });
});
