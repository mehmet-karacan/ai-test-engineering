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
import { NativeToolchainRecordStore } from "../../src/orchestration/native-toolchain-record.js";
import { NativeToolchainResolver, effectiveMavenEnvironment, verifyNativeToolchain } from "../../src/runners/native-toolchain.js";
import { AppError } from "../../src/domain/errors.js";
import { RecoveryManager } from "../../src/orchestration/recovery-manager.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
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

  // Synthetic -v fixture pins the same native toolchain contract the real
  // preflight would persist. It never runs customer Maven goals.
  const executable = join(dir, "mvn.cmd");
  writeFileSync(executable, "@echo off\r\necho Apache Maven 3.9.16\r\necho Java version: 25.0.3, vendor: Fixture\r\n");
  const options = { cwd: projectDir, env: process.env, executable };
  const env = effectiveMavenEnvironment(options.env);
  const verified = await verifyNativeToolchain(NativeToolchainResolver.resolve({ ...options, env }), env);
  new NativeToolchainRecordStore(services.storage!.db, artifactRoot).pin(started.job_id, options, verified);

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
    for (let i = 0; i < 60 && resumedGoal === null; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
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
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);

    await expect(dispatcher.resumeDispatch(prepared.services.jobs!.getJob(prepared.jobId), prepared.projectDir, "litellm/GLM-5.3-Flash-IT"))
      .rejects.toMatchObject({ code: "POLICY_VIOLATION", details: { reason_code: "CONTRACT_CONFLICT" } });
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(prepared.services.storage!.db.prepare<[string], { expires_at: number }>("SELECT expires_at FROM job_leases WHERE job_id = ?").get(prepared.jobId)!.expires_at)
      .toBeLessThan(Date.now());
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

  it("native identity kaydi eksikse ownership test kapisi gecilse bile RUNNING olmaz", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => {
      prepared.services.storage?.close();
      rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true });
    });
    prepared.services.storage!.db.prepare("DELETE FROM artifacts WHERE job_id = ? AND kind = 'native_toolchain_contract'").run(prepared.jobId);
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    const dispatchSpy = vi.spyOn(JobDispatcher.prototype, "dispatch");
    const before = prepared.services.jobs!.getJob(prepared.jobId).lifecycle;
    await expect(handleTestResume({ job_id: prepared.jobId, model_profile: MODEL }, prepared.services))
      .rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_MISSING" } });
    expect(prepared.services.jobs!.getJob(prepared.jobId).lifecycle).toBe(before);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("direct resume native identity drift'ini checkpoint event ve restore oncesi reddeder", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => { prepared.services.storage?.close(); rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true }); });
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    vi.spyOn(NativeToolchainRecordStore.prototype, "verify").mockRejectedValue(new AppError("BLOCKED_ISOLATION", "changed", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" }));
    const dispatcher = new JobDispatcher({ services: prepared.services, runnerKind: "windows_native", workerEnabled: false, workspaceRoot: prepared.artifactRoot });
    await expect(dispatcher.resumeDispatch(prepared.services.jobs!.getJob(prepared.jobId), prepared.projectDir, MODEL))
      .rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" } });
    const events = prepared.services.storage!.db.prepare<[string], { event_type: string }>("SELECT event_type FROM job_events WHERE job_id = ?").all(prepared.jobId);
    expect(events.some((event) => event.event_type === "resume_fresh_start" || event.event_type === "resume_checkpoint_verified")).toBe(false);
    expect(prepared.services.storage!.db.prepare<[string], { expires_at: number }>("SELECT expires_at FROM job_leases WHERE job_id = ?").get(prepared.jobId)).toBeUndefined();
  });

  it("recovery plan lease aldiktan sonra hata verirse owner serbest kalir", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => { prepared.services.storage?.close(); rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true }); });
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    vi.spyOn(RecoveryManager.prototype, "planRecovery").mockImplementation((_job, ownerId) => {
      new LeaseManager(prepared.services.storage!.db).acquire(prepared.jobId, ownerId, 300000);
      throw new AppError("STORAGE_ERROR", "checkpoint read failed");
    });
    const dispatcher = new JobDispatcher({ services: prepared.services, runnerKind: "windows_native", workerEnabled: false, workspaceRoot: prepared.artifactRoot });
    await expect(dispatcher.resumeDispatch(prepared.services.jobs!.getJob(prepared.jobId), prepared.projectDir, MODEL))
      .rejects.toMatchObject({ code: "STORAGE_ERROR" });
    expect(prepared.services.storage!.db.prepare<[string], { expires_at: number }>("SELECT expires_at FROM job_leases WHERE job_id = ?").get(prepared.jobId)!.expires_at)
      .toBeLessThan(Date.now());
  });

  it("async resume identity hatasi RUNNING'de asili kalmaz", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => { prepared.services.storage?.close(); rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true }); });
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    const realVerify = NativeToolchainRecordStore.prototype.verify;
    let checks = 0;
    vi.spyOn(NativeToolchainRecordStore.prototype, "verify").mockImplementation(function (jobId, options, verifier) {
      checks++;
      if (checks > 1) return Promise.reject(new AppError("BLOCKED_ISOLATION", "changed", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" }));
      return realVerify.call(this, jobId, options, verifier);
    });
    const started = await handleTestResume({ job_id: prepared.jobId, model_profile: MODEL }, prepared.services);
    expect(started.lifecycle).toBe("RUNNING");
    for (let i = 0; i < 60 && prepared.services.jobs!.getJob(prepared.jobId).lifecycle === "RUNNING"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(prepared.services.jobs!.getJob(prepared.jobId)).toMatchObject({ lifecycle: "FAILED", outcome: "BLOCKED_ISOLATION" });
    expect(new LeaseManager(prepared.services.storage!.db).get(prepared.jobId).expires_at).toBeLessThan(Date.now());
  });

  it("baska canli lease sahibinin RUNNING isini reddedilen resume bozmaz", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => { prepared.services.storage?.close(); rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true }); });
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    const before = prepared.services.jobs!.updateLifecycle(prepared.jobId, "RUNNING", prepared.services.jobs!.getJob(prepared.jobId).row_version);
    new LeaseManager(prepared.services.storage!.db).acquire(prepared.jobId, "other-live-owner", 300000);
    const eventCount = prepared.services.storage!.db.prepare<[string], { count: number }>("SELECT COUNT(*) AS count FROM job_events WHERE job_id = ? AND event_type = 'test_resume_accepted'").get(prepared.jobId)!.count;
    await expect(handleTestResume({ job_id: prepared.jobId, model_profile: MODEL }, prepared.services))
      .rejects.toMatchObject({ details: { reason_code: "LEASE_HELD" } });
    expect(prepared.services.jobs!.getJob(prepared.jobId)).toMatchObject({ lifecycle: "RUNNING", outcome: null, row_version: before.row_version });
    expect(prepared.services.storage!.db.prepare<[string], { count: number }>("SELECT COUNT(*) AS count FROM job_events WHERE job_id = ? AND event_type = 'test_resume_accepted'").get(prepared.jobId)!.count).toBe(eventCount);
    expect(new LeaseManager(prepared.services.storage!.db).get(prepared.jobId).owner_id).toBe("other-live-owner");
  });

  it("canli owner varken direct resume pre-acquire identity hatasi state bozmaz", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => { prepared.services.storage?.close(); rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true }); });
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    const before = prepared.services.jobs!.updateLifecycle(prepared.jobId, "RUNNING", prepared.services.jobs!.getJob(prepared.jobId).row_version);
    new LeaseManager(prepared.services.storage!.db).acquire(prepared.jobId, "other-live-owner", 300000);
    vi.spyOn(NativeToolchainRecordStore.prototype, "verify").mockRejectedValue(new AppError("BLOCKED_ISOLATION", "changed", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" }));
    const dispatcher = new JobDispatcher({ services: prepared.services, runnerKind: "windows_native", workerEnabled: false, workspaceRoot: prepared.artifactRoot });
    await expect(dispatcher.resumeDispatch(prepared.services.jobs!.getJob(prepared.jobId), prepared.projectDir, MODEL))
      .rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" } });
    expect(prepared.services.jobs!.getJob(prepared.jobId)).toMatchObject({ lifecycle: "RUNNING", outcome: null, row_version: before.row_version });
    expect(new LeaseManager(prepared.services.storage!.db).get(prepared.jobId).owner_id).toBe("other-live-owner");
  });

  it("async identity hatasi sonrasi lease fence devredildiyse yeni owner'in RUNNING state'i korunur", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => { prepared.services.storage?.close(); rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true }); });
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    const realVerify = NativeToolchainRecordStore.prototype.verify;
    let checks = 0;
    vi.spyOn(NativeToolchainRecordStore.prototype, "verify").mockImplementation(function (jobId, options, verifier) {
      checks++;
      if (checks === 1) return realVerify.call(this, jobId, options, verifier);
      prepared.services.storage!.db.prepare("UPDATE job_leases SET owner_id = 'other-live-owner', fencing_token = fencing_token + 1, expires_at = ? WHERE job_id = ?")
        .run(Date.now() + 300000, prepared.jobId);
      return Promise.reject(new AppError("BLOCKED_ISOLATION", "changed", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" }));
    });
    await handleTestResume({ job_id: prepared.jobId, model_profile: MODEL }, prepared.services);
    for (let i = 0; i < 40 && checks < 2; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(checks).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(prepared.services.jobs!.getJob(prepared.jobId)).toMatchObject({ lifecycle: "RUNNING", outcome: null });
    expect(new LeaseManager(prepared.services.storage!.db).get(prepared.jobId).owner_id).toBe("other-live-owner");
  });
});
