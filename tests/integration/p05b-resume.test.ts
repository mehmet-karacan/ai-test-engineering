/**
 * P05-B/PP15/PP24: handler -> resumeDispatch -> dispatch zinciri.
 * Docker/Maven calistirmasi bu testin kapsami degildir; son dispatch siniri
 * spy ile durdurulur, frozen hedef/contract/model/butce resume'da gercek koddan
 * yeniden kurulmus olarak assertion'a girer.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createDefaultServicesForTest, handleTestStart } from "../../src/application/services.js";
import { handleTestResume } from "../../src/application/job-tools.js";
import { JobDispatcher, type GoalContract } from "../../src/orchestration/job-dispatcher.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";
import { NativeToolchainRecordStore } from "../../src/orchestration/native-toolchain-record.js";
import { NativeExecutionToolchainRecordStore } from "../../src/orchestration/native-execution-toolchain-record.js";
import { NativeToolchainResolver, effectiveMavenEnvironment, verifyNativeToolchain } from "../../src/runners/native-toolchain.js";
import { AppError } from "../../src/domain/errors.js";
import { RecoveryManager } from "../../src/orchestration/recovery-manager.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { NativeProcessRegistry } from "../../src/orchestration/native-process-registry.js";
import { WindowsProcessSupervisor } from "../../src/runners/windows-process-supervisor.js";
import type { Services } from "../../src/application/services.js";
import { CheckpointStore, type CheckpointManifest } from "../../src/orchestration/checkpoint-store.js";
import { SourceSnapshot, computeSourceIdentity } from "../../src/discovery/source-snapshot.js";
import { handleTestCancel } from "../../src/application/job-tools.js";
import { Storage } from "../../src/storage/storage.js";

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

async function prepareJob(coverageMode: "configured" | "cli" = "configured", completePins = false): Promise<PreparedJob> {
  const dir = join(tmpdir(), `aitest-p05b-resume-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const projectDir = join(dir, "project");
  const artifactRoot = join(dir, "artifacts");
  const services = createDefaultServicesForTest(join(dir, "state.db"), artifactRoot);
  services.config.storage.root = artifactRoot;
  cpSync(join(FIXTURES, "sample-maven-project"), projectDir, { recursive: true });
  if (completePins) {
    mkdirSync(join(projectDir,".mvn"),{recursive:true});
    for (const name of ["maven.config","jvm.config","extensions.xml"]) writeFileSync(join(projectDir,".mvn",name),"");
  }

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
    coverage_mode: coverageMode,
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
  // preflight would persist. A minimal Maven/JDK distribution tree is built
  // so the owned-resume tests reach post-preflight logic without weakening
  // the production complete-manifest gate. It never runs customer Maven goals.
  const mavenRoot = join(dir, "maven");
  const javaRoot = join(dir, "jdk");
  for (const part of ["bin", "boot", "lib", "conf"]) mkdirSync(join(mavenRoot, part), { recursive: true });
  for (const part of ["bin", "lib", "conf"]) mkdirSync(join(javaRoot, part), { recursive: true });
  writeFileSync(join(javaRoot, "release"), "JAVA_VERSION=\"25.0.3\"\n", "utf8");
  const executable = join(mavenRoot, "bin", "mvn.cmd");
  writeFileSync(executable, "@echo off\r\necho Apache Maven 3.9.16\r\necho Java version: 25.0.3, vendor: Fixture\r\n");
  // Resume resolves the effective environment from process.env, so keep the
  // fixture's JAVA_HOME identical until this test's cleanup restores it.
  vi.stubEnv("JAVA_HOME", javaRoot);
  const nativeRoot = coverageMode === "cli" ? join(artifactRoot, "jobs", started.job_id, "coverage-preflight") : projectDir;
  if (coverageMode === "cli") cpSync(projectDir, nativeRoot, { recursive: true });
  const options = { cwd: nativeRoot, env: { ...process.env }, executable, ...(coverageMode === "cli" ? { pinRoot: nativeRoot } : {}) };
  const env = effectiveMavenEnvironment(options.env);
  const verified = await verifyNativeToolchain(NativeToolchainResolver.resolve({ ...options, env }), env);
  new NativeToolchainRecordStore(services.storage!.db, artifactRoot).pin(started.job_id, options, verified);
  const baseline = join(artifactRoot, "jobs", started.job_id, "baseline");
  mkdirSync(baseline, { recursive: true });
  const execution = NativeToolchainResolver.resolve({ cwd: baseline, env, executable });
  new NativeExecutionToolchainRecordStore(services.storage!.db, artifactRoot).pinOrVerify(started.job_id, {
    ...execution, baseIdentity: execution.identity,
    identity: digest(`frozen:${execution.identity}`), mavenVersion: "3.9.16", javaVersion: "25.0.3", outputDigest: digest("fixture version"),
  });

  return { services, projectDir, jobId: started.job_id, goal, artifactRoot };
}

function stubOwnedVersionProbe(): void {
  // Contract/recovery tests need to reach post-preflight logic even when the
  // real helper correctly rejects absent implicit Maven config files.
  vi.spyOn(WindowsProcessSupervisor.prototype, "run").mockImplementation(async (plan, _signal, lifecycle) => {
    expect(plan.argv).toEqual(["-v"]);
    lifecycle?.beforeSpawn(plan);
    lifecycle?.afterSpawn(process.pid);
    const result = { status: "success" as const, exitCode: 0,
      stdout: "Apache Maven 3.9.16\r\nJava version: 25.0.3, vendor: Fixture\r\n", stderr: "",
      stdoutTruncatedBytes: 0, stderrTruncatedBytes: 0, durationMs: 1, ownedTreeDrained: true };
    lifecycle?.afterTerminal(result);
    return result;
  });
}

describe("P05-B resume zinciri", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    while (cleanups.length > 0) {
      cleanups.pop()!();
    }
  });

  it("real owned native version probes resume a paused checkpoint twice without resetting files or attempt budget", async () => {
    const p=await prepareJob("cli",true);
    cleanups.push(()=>{p.services.storage?.close();rmSync(join(p.artifactRoot,".."),{recursive:true,force:true});});
    vi.spyOn(CustomerRunnerFactory.prototype,"assertNativeCustomerReady").mockImplementation(()=>undefined);
    const store=new CheckpointStore(p.services.storage!.db,p.artifactRoot);
    const identity=computeSourceIdentity(p.projectDir,new SourceSnapshot(p.projectDir).buildManifest());
    const path="src/test/java/com/example/payment/AcceptedTest.java",content="package com.example.payment; class AcceptedTest {}\n";
    const job=p.services.jobs!.getJob(p.jobId);
    const manifest:CheckpointManifest={schema_version:1,job_id:job.id,project_id:"fixture",location_id:job.location_id,
      target_ids:["PaymentService"],user_goal:"coverage:90",source_snapshot_id:job.source_snapshot_id,
      head_commit:identity.head_commit,source_digest:identity.source_digest,dirty_digest:identity.dirty_digest,build_digest:identity.build_digest,
      policy_digest:null,parser_version:"fixture",toolchain:{native_maven:new NativeToolchainRecordStore(p.services.storage!.db,p.artifactRoot).read(job.id).identity},
      accepted_changes:[{path,sha256:digest(content),action:"create"}],parent_checkpoint_id:null,baseline_run_id:null,last_trusted_run_id:null,
      active_phase:"generation",next_action:"candidate_accepted",remaining_budget:{max_candidate_iterations:3,max_repairs_per_candidate:1,no_progress_window:2,remaining_attempts:3},
      requested_model:MODEL,resolved_model:MODEL,worker_session_ref:null,generation:2,created_at:Date.now()};
    const blobs=store.publishAcceptedBlobs(job.id,[{path,sha256:digest(content),action:"create",content}]);
    const checkpoint=store.publishCheckpoint(manifest,null,null,blobs).checkpoint_id;
    const consumed=p.goal.budget.max_candidate_iterations-1;
    for(let n=1;n<=consumed;n++) p.services.storage!.db.prepare("INSERT INTO candidate_iterations (id,job_id,attempt_ordinal,iteration_ordinal,changeset_hash,decision,created_at) VALUES (?,?,?,2,?,'rejected',?)").run(randomUUID(),job.id,n,digest(`rejected-${n}`),Date.now());
    const dispatch=vi.spyOn(JobDispatcher.prototype,"dispatch").mockImplementation(async j=>({job_id:j.id,phases_completed:[],final_outcome:"BOUNDARY_ONLY",best_coverage:null,error:null}));
    for (let n=1;n<=2;n++) {
      p.services.jobs!.updateLifecycle(job.id,"PAUSED",p.services.jobs!.getJob(job.id).row_version);
      const result=await handleTestResume({job_id:job.id,project_root:p.projectDir},p.services);
      expect(result.resumed).toBe(true);
      await vi.waitFor(()=>expect(dispatch).toHaveBeenCalledTimes(n),{timeout:65000});
      const goal=dispatch.mock.calls[n-1]![1];
      expect(goal.start_iteration).toBe(3);expect(goal.budget.max_candidate_iterations).toBe(3);
      expect(goal.attempt_budget).toBe(1);
      expect(readFileSync(join(p.artifactRoot,"jobs",job.id,"accepted",path),"utf8")).toBe(content);
      expect(store.bestCheckpoint(job.id)).toBe(checkpoint);
      expect(new LeaseManager(p.services.storage!.db).get(job.id).expires_at).toBeLessThanOrEqual(Date.now());
      await handleTestCancel({job_id:job.id,reason:"pause"},p.services);
    }
  },150000);

  it.each([false,true])("a newer pause invalidates an in-flight resume before RUNNING (native registration %s)",async registered=>{
    const p=await prepareJob();cleanups.push(()=>{p.services.storage?.close();rmSync(join(p.artifactRoot,".."),{recursive:true,force:true});});
    p.services.jobs!.updateLifecycle(p.jobId,"PAUSED",p.services.jobs!.getJob(p.jobId).row_version);
    vi.spyOn(CustomerRunnerFactory.prototype,"assertNativeCustomerReady").mockImplementation(()=>undefined);
    let finish!:()=>void,entered!:()=>void;
    const started=new Promise<void>(resolve=>entered=resolve),pending=new Promise<void>(resolve=>finish=resolve);
    vi.spyOn(NativeToolchainRecordStore.prototype,"verify").mockImplementationOnce(async()=>{
      const lease=new LeaseManager(p.services.storage!.db).get(p.jobId);
      const native=new NativeProcessRegistry(p.services.storage!.db,p.jobId,lease.owner_id,lease.fencing_token);
      if(registered){native.beforeSpawn({executable:join(p.projectDir,"mvn.cmd"),cwd:p.projectDir,argv:["-v"],timeoutMs:30000,env:{}});native.afterSpawn(process.pid);}
      entered();await pending;
      if(registered)native.afterTerminal({status:"success",exitCode:0,stdout:"",stderr:"",stdoutTruncatedBytes:0,stderrTruncatedBytes:0,durationMs:1,ownedTreeDrained:true});
      return {} as never;
    });
    vi.spyOn(JobDispatcher.prototype,"stopOwnedProcesses").mockImplementation(()=>undefined);
    vi.spyOn(JobDispatcher.prototype,"waitForOwnedProcessCleanup").mockResolvedValue(undefined);
    const dispatch=vi.spyOn(JobDispatcher.prototype,"resumeDispatch").mockResolvedValue({job_id:p.jobId,phases_completed:[],final_outcome:"BOUNDARY",best_coverage:null,error:null});
    const resume=handleTestResume({job_id:p.jobId},p.services).catch(error=>error);
    await started;const version=p.services.jobs!.getJob(p.jobId).row_version;
    await handleTestCancel({job_id:p.jobId,reason:"pause"},p.services);
    const stoppedVersion=p.services.jobs!.getJob(p.jobId).row_version;
    finish();await resume;
    expect(stoppedVersion).toBeGreaterThan(version);
    expect(p.services.jobs!.getJob(p.jobId).lifecycle).toBe("PAUSED");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(["successor","old-dispatch"])("an old dispatch rejection cannot stop or fail successor owner %s after pause and resume",async successor=>{
    const p=await prepareJob();cleanups.push(()=>{p.services.storage?.close();rmSync(join(p.artifactRoot,".."),{recursive:true,force:true});});
    let fail!:(error:Error)=>void,entered!:()=>void;
    const started=new Promise<void>(resolve=>entered=resolve);
    vi.spyOn(CustomerRunnerFactory.prototype,"prepareNativeCustomerToolchain").mockImplementation(async()=>{entered();return await new Promise((_,reject)=>fail=reject);});
    const dispatcher=new JobDispatcher({services:p.services,runnerKind:"windows_native",workerEnabled:false,workspaceRoot:p.artifactRoot});
    const running=dispatcher.dispatch(p.services.jobs!.getJob(p.jobId),p.goal,p.projectDir,"old-dispatch");
    await started;
    vi.spyOn(JobDispatcher.prototype,"stopOwnedProcesses").mockImplementation(()=>undefined);
    await handleTestCancel({job_id:p.jobId,reason:"pause"},p.services);
    const next=new LeaseManager(p.services.storage!.db).acquire(p.jobId,successor,60000).lease;
    p.services.jobs!.updateLifecycle(p.jobId,"RUNNING",p.services.jobs!.getJob(p.jobId).row_version);
    const before=p.services.jobs!.getJob(p.jobId),events=p.services.jobs!.listEvents(p.jobId);
    vi.mocked(JobDispatcher.prototype.stopOwnedProcesses).mockClear();fail(new Error("late old rejection"));await running;
    expect(p.services.jobs!.getJob(p.jobId)).toEqual(before);
    expect(p.services.jobs!.listEvents(p.jobId)).toEqual(events);
    expect(JobDispatcher.prototype.stopOwnedProcesses).not.toHaveBeenCalled();
    expect(new LeaseManager(p.services.storage!.db).get(p.jobId)).toMatchObject({owner_id:successor,fencing_token:next.fencing_token});
    expect(new LeaseManager(p.services.storage!.db).get(p.jobId).expires_at).toBeGreaterThan(Date.now());
  });

  it("serializes dispatch failure writes against a real second connection trying to transfer ownership",async()=>{
    const p=await prepareJob();cleanups.push(()=>{p.services.storage?.close();rmSync(join(p.artifactRoot,".."),{recursive:true,force:true});});
    const second=new Storage({dbPath:join(p.artifactRoot,"..","state.db")});second.db.pragma("busy_timeout = 0");cleanups.push(()=>second.close());
    let blocked=false;
    const realAppend=p.services.jobs!.appendEvent.bind(p.services.jobs!);
    vi.spyOn(p.services.jobs!,"appendEvent").mockImplementation(input=>{
      if(input.event_type === "dispatch_failed") {
        try {second.db.prepare("UPDATE job_leases SET owner_id = 'concurrent-successor', fencing_token = fencing_token + 1 WHERE job_id = ?").run(p.jobId);}
        catch(error) {blocked=(error as {code?:string}).code === "SQLITE_BUSY";}
      }
      return realAppend(input);
    });
    vi.spyOn(CustomerRunnerFactory.prototype,"prepareNativeCustomerToolchain").mockRejectedValue(new Error("owned preflight failure"));
    await new JobDispatcher({services:p.services,runnerKind:"windows_native",workerEnabled:false,workspaceRoot:p.artifactRoot})
      .dispatch(p.services.jobs!.getJob(p.jobId),p.goal,p.projectDir,"owned-failure");
    expect(blocked).toBe(true);
    expect(new LeaseManager(p.services.storage!.db).get(p.jobId).owner_id).toBe("owned-failure");
  });

  it("missing frozen workspace identity blocks native resume before recovery mutation", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => {
      prepared.services.storage?.close();
      rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true });
    });
    prepared.services.storage!.db.prepare("DELETE FROM artifacts WHERE job_id = ? AND kind = 'native_execution_toolchain_contract'").run(prepared.jobId);
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    const dispatchSpy = vi.spyOn(JobDispatcher.prototype, "dispatch");
    const dispatcher = new JobDispatcher({ services: prepared.services, runnerKind: "windows_native", workerEnabled: false, workspaceRoot: prepared.artifactRoot });
    await expect(dispatcher.resumeDispatch(prepared.services.jobs!.getJob(prepared.jobId), prepared.projectDir))
      .rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_MISSING" } });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("test_resume gerçek helper ile eksik implicit config yüzünden fail-closed kalir", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => {
      prepared.services.storage?.close();
      rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true });
    });
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    const dispatchSpy = vi.spyOn(JobDispatcher.prototype, "dispatch");
    await expect(handleTestResume({ job_id: prepared.jobId, model_profile: MODEL }, prepared.services))
      .rejects.toMatchObject({ details: { reason_code: "NATIVE_INPUT_PIN_UNAVAILABLE" } });
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(new LeaseManager(prepared.services.storage!.db).get(prepared.jobId).expires_at).toBeLessThan(Date.now());
  });

  it("test-only owned -v stub ile frozen job/target/model/butce resumeDispatch'e ulasir", async () => {
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
    stubOwnedVersionProbe();
    const ownedProbes: string[] = [];
    const realBeforeSpawn = NativeProcessRegistry.prototype.beforeSpawn;
    vi.spyOn(NativeProcessRegistry.prototype, "beforeSpawn").mockImplementation(function (plan) {
      realBeforeSpawn.call(this, plan);
      const identity = prepared.services.storage!.db.prepare<[string], { process_identity: string | null }>(
        "SELECT process_identity FROM job_leases WHERE job_id = ?",
      ).get(prepared.jobId)?.process_identity;
      expect(identity).toMatch(/^\{/u);
      ownedProbes.push(plan.argv.join(" "));
    });

    const result = await handleTestResume({ job_id: prepared.jobId, model_profile: MODEL }, prepared.services);
    // handleTestResume returns before direct resume's second owned -v probe.
    // Each probe has a 30 s contract timeout; wait for that bounded work
    // rather than closing the fixture DB after an arbitrary 3 s.
    for (let i = 0; i < 1300 && resumedGoal === null; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(result).toMatchObject({ job_id: prepared.jobId, resumed: true, lifecycle: "RUNNING" });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(resumedGoal?.job_id).toBe(prepared.jobId);
    expect(resumedGoal?.model_profile).toBe(MODEL);
    expect(resumedGoal?.coverage_mode).toBe("configured");
    expect(resumedGoal?.targets).toEqual(prepared.goal.targets);
    expect(resumedGoal?.concrete_targets_digest).toBe(prepared.goal.concrete_targets_digest);
    expect(resumedGoal?.contract_budget).toEqual(prepared.goal.budget);
    expect(resumedGoal?.attempt_budget).toBe(prepared.goal.budget.max_candidate_iterations);
    expect(ownedProbes).toEqual(["-v", "-v"]);
  });

  it("test_resume preserves CLI coverage mode and customer root with owned coverage preflight", async () => {
    const prepared = await prepareJob("cli");
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
    stubOwnedVersionProbe();
    const result = await handleTestResume({ job_id: prepared.jobId, model_profile: MODEL }, prepared.services);
    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(1), { timeout: 65000, interval: 50 });
    expect(result).toMatchObject({ job_id: prepared.jobId, resumed: true, lifecycle: "RUNNING" });
    expect(resumedGoal?.coverage_mode).toBe("cli");
    expect(resumedGoal?.project_root.replace(/\\/g, "/").toLowerCase()).toBe(prepared.projectDir.replace(/\\/g, "/").toLowerCase());
    expect(resumedGoal?.targets).toEqual(prepared.goal.targets);
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
    stubOwnedVersionProbe();

    await expect(dispatcher.resumeDispatch(prepared.services.jobs!.getJob(prepared.jobId), prepared.projectDir, "litellm/GLM-5.3-Flash-IT"))
      .rejects.toMatchObject({ code: "POLICY_VIOLATION", details: { reason_code: "CONTRACT_CONFLICT" } });
    expect(dispatchSpy).not.toHaveBeenCalled();
    // Contract conflicts are rejected before a resume lease is acquired or
    // any native probe starts.
    expect(prepared.services.storage!.db.prepare<[string], { expires_at: number }>("SELECT expires_at FROM job_leases WHERE job_id = ?").get(prepared.jobId))
      .toBeUndefined();
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

  it("farkli model ile test_resume job'u RUNNING yapmadan contract conflict reddeder", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => { prepared.services.storage?.close(); rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true }); });
    const jobs = prepared.services.jobs!;
    const before = jobs.getJob(prepared.jobId);
    const eventsBefore = prepared.services.storage!.db.prepare<[string], { count: number }>(
      "SELECT COUNT(*) AS count FROM job_events WHERE job_id = ? AND event_type = 'test_resume_accepted'",
    ).get(prepared.jobId)!.count;

    await expect(handleTestResume({ job_id: prepared.jobId, model_profile: "litellm/GLM-5.3-Flash-IT" }, prepared.services))
      .rejects.toMatchObject({ code: "POLICY_VIOLATION", details: { reason_code: "CONTRACT_CONFLICT" } });
    expect(jobs.getJob(prepared.jobId)).toMatchObject({ lifecycle: before.lifecycle, outcome: before.outcome, row_version: before.row_version });
    expect(prepared.services.storage!.db.prepare<[string], { count: number }>(
      "SELECT COUNT(*) AS count FROM job_events WHERE job_id = ? AND event_type = 'test_resume_accepted'",
    ).get(prepared.jobId)!.count).toBe(eventsBefore);
    expect(prepared.services.storage!.db.prepare<[string], { count: number }>(
      "SELECT COUNT(*) AS count FROM job_leases WHERE job_id = ?",
    ).get(prepared.jobId)!.count).toBe(0);
  });

  it("native process ownership eksikse resume lifecycle RUNNING olmaz", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => {
      prepared.services.storage?.close();
      rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true });
    });
    // Keep this negative branch deterministic even when the checked-in helper
    // is available on the host running the suite.
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => {
      throw new AppError("BLOCKED_ISOLATION", "Windows Job Object helper required", {
        reason_code: "NATIVE_PROCESS_OWNERSHIP_UNVERIFIED",
      });
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
    expect(prepared.services.storage!.db.prepare<[string], { expires_at: number }>("SELECT expires_at FROM job_leases WHERE job_id = ?").get(prepared.jobId)!.expires_at)
      .toBeLessThan(Date.now());
  });

  it("recovery plan lease aldiktan sonra hata verirse owner serbest kalir", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => { prepared.services.storage?.close(); rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true }); });
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    stubOwnedVersionProbe();
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
    stubOwnedVersionProbe();
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
    const processRun = vi.spyOn(WindowsProcessSupervisor.prototype, "run");
    const eventCount = prepared.services.storage!.db.prepare<[string], { count: number }>("SELECT COUNT(*) AS count FROM job_events WHERE job_id = ? AND event_type = 'test_resume_accepted'").get(prepared.jobId)!.count;
    await expect(handleTestResume({ job_id: prepared.jobId, model_profile: MODEL }, prepared.services))
      .rejects.toMatchObject({ details: { reason_code: "LEASE_HELD" } });
    expect(prepared.services.jobs!.getJob(prepared.jobId)).toMatchObject({ lifecycle: "RUNNING", outcome: null, row_version: before.row_version });
    expect(prepared.services.storage!.db.prepare<[string], { count: number }>("SELECT COUNT(*) AS count FROM job_events WHERE job_id = ? AND event_type = 'test_resume_accepted'").get(prepared.jobId)!.count).toBe(eventCount);
    expect(new LeaseManager(prepared.services.storage!.db).get(prepared.jobId).owner_id).toBe("other-live-owner");
    expect(processRun).not.toHaveBeenCalled();
  });

  it("canli owner varken direct resume hic Maven probe baslatmaz ve state bozmaz", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => { prepared.services.storage?.close(); rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true }); });
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    const before = prepared.services.jobs!.updateLifecycle(prepared.jobId, "RUNNING", prepared.services.jobs!.getJob(prepared.jobId).row_version);
    new LeaseManager(prepared.services.storage!.db).acquire(prepared.jobId, "other-live-owner", 300000);
    const processRun = vi.spyOn(WindowsProcessSupervisor.prototype, "run");
    vi.spyOn(NativeToolchainRecordStore.prototype, "verify").mockRejectedValue(new AppError("BLOCKED_ISOLATION", "changed", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" }));
    const dispatcher = new JobDispatcher({ services: prepared.services, runnerKind: "windows_native", workerEnabled: false, workspaceRoot: prepared.artifactRoot });
    await expect(dispatcher.resumeDispatch(prepared.services.jobs!.getJob(prepared.jobId), prepared.projectDir, MODEL))
      .rejects.toMatchObject({ details: { reason_code: "LEASE_HELD" } });
    expect(prepared.services.jobs!.getJob(prepared.jobId)).toMatchObject({ lifecycle: "RUNNING", outcome: null, row_version: before.row_version });
    expect(new LeaseManager(prepared.services.storage!.db).get(prepared.jobId).owner_id).toBe("other-live-owner");
    expect(processRun).not.toHaveBeenCalled();
  });

  it("async identity hatasi sonrasi lease fence devredildiyse yeni owner'in RUNNING state'i korunur", async () => {
    const prepared = await prepareJob();
    cleanups.push(() => { prepared.services.storage?.close(); rmSync(join(prepared.artifactRoot, ".."), { recursive: true, force: true }); });
    vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    stubOwnedVersionProbe();
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
