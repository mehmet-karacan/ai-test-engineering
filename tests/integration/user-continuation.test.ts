import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { createToolRegistry } from "../../src/mcp/server-setup.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobDispatcher } from "../../src/orchestration/job-dispatcher.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { CheckpointStore, type CheckpointManifest } from "../../src/orchestration/checkpoint-store.js";
import type { Lifecycle } from "../../src/domain/job-state.js";
import { NativeProcessRegistry } from "../../src/orchestration/native-process-registry.js";

describe("user continuation and repository changes", () => {
  let root: string;
  let a: string;
  let b: string;
  let services: ReturnType<typeof createDefaultServicesForTest>;
  let registry: ReturnType<typeof createToolRegistry>;
  let job: string;
  const request = { requestId: "continuation", services: {} };
  const call = (tool: string, input: unknown) => registry.call(tool, input, request);
  const setState = (state: Lifecycle) => services.jobs!.updateLifecycle(job, state, services.jobs!.getJob(job).row_version);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aitest-continuation-"));
    a = join(root, "repo-a"); b = join(root, "repo-b");
    mkdirSync(a); mkdirSync(b);
    services = createDefaultServicesForTest(join(root, "state.db"), join(root, "runtime"));
    services.config.storage.root = join(root, "runtime");
    registry = createToolRegistry(services);
    const location = new ProjectRepository(services.storage!.db).ensureLocation(a, "repo-a", null).location;
    new ProjectRepository(services.storage!.db).ensureLocation(b, "repo-b", null);
    job = services.jobs!.createJob({ locationId: location.id, requestDigest: "continuation-job" }).id;
    services.storage!.db.prepare("INSERT INTO job_targets (id, job_id, selector, target_kind, line_target_bps, branch_target_bps, created_at) VALUES (?, ?, ?, 'class', 8000, 8000, ?)").run(crypto.randomUUID(), job, "demo.Service", Date.now());
    setState("PAUSED");
    vi.spyOn(JobDispatcher.prototype, "stopOwnedProcesses").mockImplementation(() => undefined);
    vi.spyOn(JobDispatcher.prototype, "waitForOwnedProcessCleanup").mockResolvedValue(undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); services.storage!.close(); rmSync(root, { recursive: true, force: true }); });

  it.each(["test_status", "test_resume", "test_result", "test_cancel", "test_apply"])("rejects an old job paired with the new repository in %s", async tool => {
    const before = services.jobs!.getJob(job);
    const events = services.jobs!.listEvents(job);
    const result = await call(tool, { job_id: job, project_root: b,
      ...(tool === "test_cancel" ? {reason:"pause"} : {}),
      ...(tool === "test_apply" ? {checkpoint_id:crypto.randomUUID(),patch_digest:"a".repeat(64),target_workspace:a,approval_reference:"explicit-user"} : {}),
    });
    expect(result.error?.details?.reason_code).toBe("JOB_PROJECT_MISMATCH");
    expect(services.jobs!.getJob(job)).toEqual(before);
    expect(services.jobs!.listEvents(job)).toEqual(events);
    expect(JobDispatcher.prototype.stopOwnedProcesses).not.toHaveBeenCalled();
  });

  it.each(["test_status", "test_result"])("returns persisted project and target facts to a new chat through %s", async tool => {
    const result = await call(tool, {job_id:job});
    expect(result.status).toBe("ok");
    const context = result.data?.job_context as {project_root:string;targets:unknown[]};
    expect(context.project_root.replace(/\\/g,"/").toLowerCase()).toBe(a.replace(/\\/g,"/").toLowerCase());
    expect(context.targets).toMatchObject([{selector:"demo.Service",line_target_bps:8000,branch_target_bps:8000}]);
    expect(result.data?.required_action).toContain("test_resume");
  });

  it("allows an explicitly selected old repository while the current directory is another repo", async () => {
    // No ambient CWD lock: the caller supplies the user's chosen repository.
    const result = await call("test_result", {job_id:job,project_root:a});
    expect(result.status).toBe("ok");
    expect(result.data?.job_id).toBe(job);
  });

  it("does not tell a new chat to poll forever when RUNNING has no active lease", async () => {
    setState("RUNNING");
    const result=await call("test_status",{job_id:job});
    expect(result.data?.job_context).toMatchObject({execution_state:"NO_ACTIVE_LEASE"});
    expect(result.data?.required_action).toContain("test_resume");
  });

  it.each(["CANCELLED", "COMPLETED"] as const)("does not launch recovery or mutate a %s job", async state => {
    setState(state);
    const before = services.jobs!.getJob(job);
    const probe = vi.spyOn(JobDispatcher.prototype, "assertRecordedRunnerKind");
    const result = await call("test_resume", {job_id:job,project_root:a});
    expect(result.status).toBe("ok"); expect(result.data?.resumed).toBe(false);
    expect(result.data?.required_action).toContain(state === "CANCELLED" ? "test_start" : "test_result");
    expect(probe).not.toHaveBeenCalled(); expect(services.jobs!.getJob(job)).toEqual(before);
  });

  it.each([{coverage:{percent:95}}, {targets:[{selector:"demo.Other",kind:"class"}]}])("does not silently ignore a changed resume contract %j", async change => {
    const before = services.jobs!.getJob(job);
    const result = await call("test_resume", {job_id:job,...change});
    expect(result.error?.code).toBe("INVALID_PARAMETERS");
    expect(services.jobs!.getJob(job)).toEqual(before);
  });

  it("keeps multiple interrupted jobs available for the user's choice", async () => {
    const first = services.jobs!.getJob(job);
    const other = services.jobs!.createJob({locationId:first.location_id,requestDigest:"second"});
    services.jobs!.updateLifecycle(other.id,"INTERRUPTED",other.row_version);
    const result = await call("test_resume", {project_root:a});
    expect(result.data?.resumed).toBe(false);
    expect(result.data?.candidates).toHaveLength(2);
    expect(result.data?.required_action).toContain("job_id");
    expect(JobDispatcher.prototype.stopOwnedProcesses).not.toHaveBeenCalled();
  });

  it("publishes pause intent before terminating the worker so a late error cannot become FAILED", async () => {
    setState("RUNNING");
    let observed: string | undefined;
    vi.mocked(JobDispatcher.prototype.waitForOwnedProcessCleanup).mockImplementation(async () => {
      observed=services.jobs!.getJob(job).lifecycle;
      if (observed === "RUNNING") setState("FAILED");
    });
    const result=await call("test_cancel",{job_id:job,reason:"pause"});
    expect(observed).toBe("PAUSED"); expect(result.data?.lifecycle).toBe("PAUSED");
  });

  it("repeating pause is idempotent and preserves the event stream", async () => {
    const before=services.jobs!.getJob(job);const events=services.jobs!.listEvents(job);
    expect((await call("test_cancel",{job_id:job,reason:"pause"})).data?.lifecycle).toBe("PAUSED");
    expect(services.jobs!.getJob(job)).toEqual(before);
    expect(services.jobs!.listEvents(job)).toEqual(events);
  });

  it("does not describe a failed process cleanup as successfully stopped", async () => {
    setState("RUNNING");
    vi.mocked(JobDispatcher.prototype.waitForOwnedProcessCleanup).mockRejectedValue(new Error("cleanup unavailable"));
    const result=await call("test_cancel",{job_id:job,reason:"pause"});
    expect(result.data?.lifecycle).toBe("PAUSED");
    expect(result.data?.cleanup_pending).toBe(true);
    expect(result.data?.required_action).toContain("test_status");
  });

  it.each(["pause","cancel"] as const)("persists a cleanup failure across status calls and allows retrying %s without resurrection", async reason => {
    setState("RUNNING");
    const cleanup=vi.mocked(JobDispatcher.prototype.waitForOwnedProcessCleanup);
    cleanup.mockRejectedValueOnce(new Error("cleanup unavailable"));
    await call("test_cancel",{job_id:job,reason});
    const status=await call("test_status",{job_id:job});
    expect(status.data?.job_context).toMatchObject({execution_state:"CLEANUP_PENDING"});
    if(reason === "pause") {
      const resume=await call("test_resume",{job_id:job});
      expect(resume.data?.resumed).toBe(false);expect(resume.data?.required_action).toContain("test_cancel");
    }
    await call("test_cancel",{job_id:job,reason});
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect((await call("test_status",{job_id:job})).data?.job_context).toMatchObject({execution_state:"NO_ACTIVE_LEASE"});
    expect(services.jobs!.getJob(job).lifecycle).toBe(reason === "pause" ? "PAUSED" : "CANCELLED");
  });

  it("does not release a successor's lease when old cleanup finishes late", async () => {
    setState("RUNNING");const leases=new LeaseManager(services.storage!.db);
    leases.acquire(job,"original-owner",60000);
    vi.mocked(JobDispatcher.prototype.waitForOwnedProcessCleanup).mockImplementation(async () => {
      leases.release(job,"original-owner"); leases.acquire(job,"successor",60000);setState("RUNNING");
    });
    await call("test_cancel",{job_id:job,reason:"pause"});
    expect(leases.get(job).owner_id).toBe("successor");
    expect(leases.get(job).expires_at).toBeGreaterThan(Date.now());
    expect(services.jobs!.getJob(job).lifecycle).toBe("RUNNING");
  });

  it("does not stop the successor when ownership changes during the cancel import boundary",async()=>{
    setState("RUNNING");const leases=new LeaseManager(services.storage!.db);
    leases.acquire(job,"old",60000);
    const stopping=call("test_cancel",{job_id:job,reason:"pause"});
    leases.release(job,"old");leases.acquire(job,"new",60000);setState("RUNNING");
    const before=services.jobs!.getJob(job);
    await stopping;
    expect(JobDispatcher.prototype.stopOwnedProcesses).not.toHaveBeenCalled();
    expect(services.jobs!.getJob(job)).toEqual(before);
    expect(leases.get(job).owner_id).toBe("new");
  });

  it("keeps the exact native fence alive while a timed-out cleanup is still pending", async () => {
    setState("RUNNING");const leases=new LeaseManager(services.storage!.db);
    const lease=leases.acquire(job,"slow-cleanup",60000).lease;
    const native=new NativeProcessRegistry(services.storage!.db,job,lease.owner_id,lease.fencing_token);
    native.beforeSpawn({executable:join(a,"mvn.cmd"),cwd:a,argv:["-v"],timeoutMs:30000,env:{}});
    native.afterSpawn(process.pid);
    await call("test_cancel",{job_id:job,reason:"pause"});
    expect(leases.get(job).expires_at).toBeGreaterThan(Date.now());
    native.afterTerminal({status:"cancelled",exitCode:null,stdout:"",stderr:"",stdoutTruncatedBytes:0,stderrTruncatedBytes:0,durationMs:1,ownedTreeDrained:true});
    expect((await call("test_cancel",{job_id:job,reason:"pause"})).data?.cleanup_pending).toBe(false);
    expect(leases.get(job).expires_at).toBeLessThanOrEqual(Date.now());
  });

  it("does not turn FAILED into CANCELLED when the user repeats a stop", async () => {
    setState("FAILED");const before=services.jobs!.getJob(job);
    expect((await call("test_cancel",{job_id:job,reason:"cancel"})).data?.lifecycle).toBe("FAILED");
    expect(services.jobs!.getJob(job)).toEqual(before);
    expect(JobDispatcher.prototype.stopOwnedProcesses).not.toHaveBeenCalled();
  });

  it("does not claim that a patch was already applied in a different checkout", async () => {
    services.jobs!.updateApplyState(job,"APPLIED",services.jobs!.getJob(job).row_version);
    const result=await call("test_apply",{job_id:job,checkpoint_id:crypto.randomUUID(),patch_digest:"a".repeat(64),target_workspace:b,approval_reference:"explicit-user"});
    expect(result.error?.details?.reason_code).toBe("JOB_PROJECT_MISMATCH");
  });

  it("explains class selection instead of resuming a completed coverage scan as generation", async () => {
    setState("WAITING_INPUT");
    services.jobs!.updateOutcome(job,"COVERAGE_ANALYZED",services.jobs!.getJob(job).row_version);
    services.jobs!.appendEvent({job_id:job,event_type:"project_coverage_requested",origin:"fixture"});
    const result=await call("test_resume",{job_id:job});
    expect(result.data?.resumed).toBe(false);
    expect(result.data?.required_action).toContain("test_start");
  });

  it.each(["PAUSED","CANCELLED"] as const)("rejects a late accepted checkpoint while %s even before process cleanup releases the lease", state => {
    const lease = new LeaseManager(services.storage!.db).acquire(job,"late-worker",60000).lease;
    setState(state);
    const manifest: CheckpointManifest = {
      schema_version:1,job_id:job,project_id:"fixture",location_id:services.jobs!.getJob(job).location_id,
      target_ids:["demo.Service"],user_goal:"coverage:80",source_snapshot_id:null,head_commit:null,
      source_digest:"a".repeat(64),dirty_digest:null,build_digest:"b".repeat(64),policy_digest:null,
      parser_version:"fixture",toolchain:{},accepted_changes:[],parent_checkpoint_id:null,
      baseline_run_id:null,last_trusted_run_id:null,active_phase:"generation",next_action:"candidate_accepted",
      remaining_budget:{max_candidate_iterations:2},requested_model:null,resolved_model:null,
      worker_session_ref:null,generation:1,created_at:Date.now(),
    };
    const store=new CheckpointStore(services.storage!.db,services.config.storage.root);
    expect(() => store.publishCheckpoint(manifest,lease,null,[])).toThrow(/JOB_STOPPED/);
    expect(store.bestCheckpoint(job)).toBeNull();
  });
});
