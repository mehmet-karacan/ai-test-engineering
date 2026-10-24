import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleTestApply, handleTestResult, handleTestCancel } from "../../src/application/job-tools.js";
import { waitWorkspaceApply } from "../../src/application/test-apply.js";
import { approvedApplyFixture, applyTestPath, originalSuite, acceptedSuite } from "../support/approved-apply-fixture.js";
import type { ApplyPlan } from "../../src/domain/apply-contracts.js";
import * as buildPlan from "../../src/orchestration/build-plan.js";
import { registerWindowsNativeTestLock } from "../support/windows-native-test-lock.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { ApplyOperationRepository } from "../../src/storage/apply-operation-repository.js";
import { WorkspaceTestPublisher } from "../../src/orchestration/workspace-test-publisher.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../../src/mcp/server-setup.js";
registerWindowsNativeTestLock("approved-test-apply");

describe("human approved application workflow", () => {
  let root: string;
  let fixture: ReturnType<typeof approvedApplyFixture>;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "approved-apply-")); fixture = approvedApplyFixture(root); });
  afterEach(async () => { await waitWorkspaceApply(fixture.jobId); vi.restoreAllMocks(); fixture.services.storage!.close(); rmSync(root, { recursive: true, force: true }); });
  it("returns an engine-generated concrete preview without writing the original checkout", async () => {
    const result = await handleTestApply({ job_id: fixture.jobId, mode: "preview" }, fixture.services);
    expect(result.state).toBe("READY_FOR_REVIEW");
    expect(result).toHaveProperty("plan.files", [{ path: applyTestPath, sha256: fixture.file.sha256, bytes: Buffer.byteLength(fixture.file.content) }]);
    expect(existsSync(join(fixture.project, applyTestPath))).toBe(false);
  });
  it("ignores a model-written approval reference and requires the human transport", async () => {
    const result = await handleTestApply({ job_id: fixture.jobId, mode: "apply", approval_reference: "user-approved-trust-me" }, fixture.services);
    expect(result.state).toBe("APPROVAL_REQUIRED");
    expect(existsSync(join(fixture.project, applyTestPath))).toBe(false);
  });
  it.each(["decline", "cancel"] as const)("does not write after human %s", async action => {
    const result = await handleTestApply({ job_id: fixture.jobId, mode: "apply" }, fixture.services, {
      requestApplyApproval: async () => ({ action, approved: false }),
    });
    expect(result.state).toBe("REJECTED"); expect(existsSync(join(fixture.project, applyTestPath))).toBe(false);
  });
  it("rechecks the source when the user confirms instead of applying a stale preview", async () => {
    let shown: ApplyPlan | undefined;
    const result = await handleTestApply({ job_id: fixture.jobId, mode: "apply" }, fixture.services, {
      requestApplyApproval: async plan => { shown = plan; writeFileSync(join(fixture.project, "pom.xml"), "changed-by-user"); return { action: "accept", approved: true }; },
    });
    expect(shown?.files[0]?.path).toBe(applyTestPath);
    expect(result.state).toBe("CONFLICT"); expect(existsSync(join(fixture.project, applyTestPath))).toBe(false);
    expect(readFileSync(join(fixture.project, "pom.xml"), "utf8")).toBe("changed-by-user");
  });
  function fullResult(execution: string): buildPlan.BaselineResult {
    return { status: "PASSED", run: { exit_code: 0, duration_ms: 1, stdout_log_path: join(execution, "stdout.log"), stderr_log_path: join(execution, "stderr.log"), command: ["mvn", "test"], timed_out: false },
      failed_tests: [], total_tests: 4, failures: 0, errors: 0, skipped: 0, reason_code: null, malformed_reports: [], skip_config_detected: [], execution_root: execution,
      test_inventory: [originalSuite, acceptedSuite], run_started_at: Date.now()-1, run_finished_at: Date.now() };
  }
  const yes = { requestApplyApproval: async () => ({ action: "accept" as const, approved: true }) };
  it.each(["missing", "new-skip", "same-name-other-module"])("rejects baseline-only module regression: %s", async kind => {
    const other = { ...acceptedSuite, module_relative_path: "other-module", name: "OtherTest", test_names: kind === "same-name-other-module" ? acceptedSuite.test_names : ["OtherTest#existing"] };
    fixture.services.storage!.db.prepare("UPDATE test_run_provenance SET test_inventory_json=?,total_tests=? WHERE id=?")
      .run(JSON.stringify([originalSuite, other]), 4, fixture.baselineRunId);
    vi.spyOn(buildPlan, "runBaseline").mockImplementation(async execution => {
      const run = fullResult(execution);
      if (kind === "new-skip") { run.test_inventory.push({ ...other, skipped: 1, skipped_test_names: other.test_names }); run.total_tests++; run.skipped++; }
      return run;
    });
    await handleTestApply({ job_id: fixture.jobId, mode: "apply" }, fixture.services, yes); await waitWorkspaceApply(fixture.jobId);
    const result = await handleTestResult({ job_id: fixture.jobId }, fixture.services);
    expect(result.application?.state).toBe("ROLLED_BACK"); expect(result.application?.verification?.reason_code).toBe("APPLY_TEST_INVENTORY_REGRESSION");
    expect(existsSync(join(fixture.project, applyTestPath))).toBe(false);
  });
  it("publishes only new files, runs every test once and updates result/report after verification", async () => {
    const existingPath = join(fixture.project, "src/test/java/com/example/payment/PaymentServiceTest.java"), before = readFileSync(existingPath);
    const run = vi.spyOn(buildPlan, "runBaseline").mockImplementation(async (execution, _runner, _timeout, options) => {
      expect(options).toMatchObject({ coverage_mode: "cli", collect_coverage: true, test_selectors: [] });
      expect(execution).not.toBe(fixture.project);
      expect(readFileSync(join(execution, applyTestPath), "utf8")).toBe(fixture.file.content);
      expect(fixture.services.jobs!.getJob(fixture.jobId).apply_state).toBe("APPLYING");
      return fullResult(execution);
    });
    const first = await handleTestApply({ job_id: fixture.jobId, mode: "apply" }, fixture.services, yes);
    expect(first.state).toBe("APPLYING");
    await waitWorkspaceApply(fixture.jobId);
    const result = await handleTestResult({ job_id: fixture.jobId }, fixture.services);
    expect(result).toMatchObject({ lifecycle: "COMPLETED", outcome: "TARGET_REACHED", apply_state: "APPLIED", application: { operation_id: first.operation_id, state: "APPLIED", verification: { scope: "FULL_PROJECT_SNAPSHOT", status: "PASSED", total: 4, existing_tests_preserved: true, all_tests_present: true } } });
    expect(readFileSync(existingPath)).toEqual(before);
    expect(readFileSync(join(fixture.project, applyTestPath), "utf8")).toBe(fixture.file.content);
    expect((await handleTestApply({ job_id: fixture.jobId, mode: "apply" }, fixture.services)).state).toBe("APPLIED");
    expect(run).toHaveBeenCalledTimes(1);
    const report = JSON.parse(readFileSync(join(fixture.runtime, "jobs", fixture.jobId, "reports/report.json"), "utf8"));
    expect(report.application?.verification.total).toBe(4);
  });
  it.each(["failure", "missing", "new-skip", "source-change"])("rolls back only own added tests on %s", async kind => {
    const existingPath = join(fixture.project, "src/test/java/com/example/payment/PaymentServiceTest.java"), before = readFileSync(existingPath);
    vi.spyOn(buildPlan, "runBaseline").mockImplementation(async execution => {
      const result = fullResult(execution);
      if (kind === "failure") { result.status = "FAILED"; result.failures = 1; result.run!.exit_code = 1; }
      if (kind === "missing") result.test_inventory = [originalSuite];
      if (kind === "new-skip") { result.test_inventory = [originalSuite, { ...acceptedSuite, skipped: 1, skipped_test_names: acceptedSuite.test_names }]; result.skipped = 1; }
      if (kind === "source-change") writeFileSync(existingPath, "user edit during run");
      return result;
    });
    await handleTestApply({ job_id: fixture.jobId, mode: "apply" }, fixture.services, yes); await waitWorkspaceApply(fixture.jobId);
    const result = await handleTestResult({ job_id: fixture.jobId }, fixture.services);
    expect(result.apply_state).toBe("REJECTED"); expect(result.application?.state).toBe("ROLLED_BACK");
    expect(existsSync(join(fixture.project, applyTestPath))).toBe(false);
    expect(readFileSync(existingPath)).toEqual(kind === "source-change" ? Buffer.from("user edit during run") : before);
    expect(result.application?.verification?.total).toBe(4);
  });
  it("preserves a user edit to the new file and reports recovery required after failure", async () => {
    vi.spyOn(buildPlan, "runBaseline").mockImplementation(async execution => {
      writeFileSync(join(fixture.project, applyTestPath), "user saved work");
      return { ...fullResult(execution), status: "FAILED", failures: 1 };
    });
    await handleTestApply({ job_id: fixture.jobId, mode: "apply" }, fixture.services, yes); await waitWorkspaceApply(fixture.jobId);
    const result = await handleTestResult({ job_id: fixture.jobId }, fixture.services);
    expect(result.application?.state).toBe("RECOVERY_REQUIRED");
    expect(result.apply_state).toBe("CONFLICT"); expect(readFileSync(join(fixture.project, applyTestPath), "utf8")).toBe("user saved work");
  });
  it.each(["checkpoint", "patch", "missing-report", "corrupt-blob", "running", "collision"])("rejects %s without approval or project writes", async kind => {
    const ask = vi.fn(yes.requestApplyApproval);
    const extra = kind === "checkpoint" ? { checkpoint_id: crypto.randomUUID() } : kind === "patch" ? { patch_digest: "f".repeat(64) } : {};
    if (kind === "missing-report") rmSync(join(fixture.runtime, "jobs", fixture.jobId, "reports/PUBLISHED"));
    if (kind === "corrupt-blob") writeFileSync(join(fixture.runtime, "blobs/accepted", fixture.jobId, fixture.file.sha256.slice(0,2), fixture.file.sha256.slice(2,4), fixture.file.sha256), "corrupt");
    if (kind === "running") fixture.services.jobs!.updateLifecycle(fixture.jobId,"RUNNING",fixture.services.jobs!.getJob(fixture.jobId).row_version);
    if (kind === "collision") writeFileSync(join(fixture.project, applyTestPath),"preexisting-user-test");
    const result = await handleTestApply({ job_id: fixture.jobId, mode: "apply", ...extra }, fixture.services, { requestApplyApproval: ask });
    expect(["REJECTED","CONFLICT"]).toContain(result.state); expect(ask).not.toHaveBeenCalled();
    if (kind === "collision") expect(readFileSync(join(fixture.project,applyTestPath),"utf8")).toBe("preexisting-user-test");
    else expect(existsSync(join(fixture.project,applyTestPath))).toBe(false);
  });
  it("does not treat accept with an unchecked checkbox as approval", async () => {
    const result=await handleTestApply({job_id:fixture.jobId,mode:"apply"},fixture.services,{requestApplyApproval:async()=>({action:"accept",approved:false})});
    expect(result.state).toBe("REJECTED");expect(existsSync(join(fixture.project,applyTestPath))).toBe(false);
  });
  it("cancels verification and rolls back while preserving completed generation", async () => {
    let rejectRun: ((error:Error)=>void) | undefined;
    const entered=vi.spyOn(buildPlan,"runBaseline").mockImplementation(()=>new Promise((_resolve,reject)=>{rejectRun=reject;}));
    vi.spyOn(MavenRunner.prototype,"stopAll").mockImplementation(()=>rejectRun?.(new Error("cancelled")));
    await handleTestApply({job_id:fixture.jobId,mode:"apply"},fixture.services,yes);
    await expect.poll(()=>entered.mock.calls.length).toBe(1);
    const cancelled=await handleTestCancel({job_id:fixture.jobId,reason:"cancel"},fixture.services);
    expect(cancelled.lifecycle).toBe("COMPLETED");expect(cancelled.cleanup_pending).toBe(false);
    const result=await handleTestResult({job_id:fixture.jobId},fixture.services);
    expect(result.application?.verification?.status).toBe("CANCELLED");expect(result.apply_state).toBe("REJECTED");
    expect(existsSync(join(fixture.project,applyTestPath))).toBe(false);
  });
  it("recovers a published operation from its durable journal without running tests or reapplying", async () => {
    const preview=await handleTestApply({job_id:fixture.jobId,mode:"preview"},fixture.services),plan=preview.plan!;
    const leases=new LeaseManager(fixture.services.storage!.db),owner="fixture-old-owner",lease=leases.acquireNative(fixture.jobId,owner,120000).lease;
    const approval=fixture.services.jobs!.recordApproval({job_id:fixture.jobId,project_id:plan.project_id,approval_kind:"TEST_APPLY",scope_digest:plan.patch_digest,model_digest:"a".repeat(64),budget_digest:"b".repeat(64),decision:"APPROVED",decided_by:"test-human"});
    const op=new ApplyOperationRepository(fixture.services.storage!.db).start(plan,owner,lease.fencing_token,approval.approval_id);
    const publisher=new WorkspaceTestPublisher({workspace:plan.project_root,storeRoot:join(fixture.runtime,"jobs",fixture.jobId,"apply",op.operation_id,"publisher"),operationId:op.operation_id,allowedTestRoots:plan.test_roots!});
    publisher.prepare([{path:fixture.file.path,sha256:fixture.file.sha256,content:Buffer.from(fixture.file.content)}]);publisher.publish();leases.release(fixture.jobId,owner);
    const runner=vi.spyOn(buildPlan,"runBaseline");
    const result=await handleTestApply({job_id:fixture.jobId,mode:"recover"},fixture.services);
    expect(result.state, result.message).toBe("ROLLED_BACK");expect(runner).not.toHaveBeenCalled();expect(existsSync(join(fixture.project,applyTestPath))).toBe(false);
  });
  it("routes actual MCP human form approval to this application instead of trusting model fields", async () => {
    vi.spyOn(buildPlan,"runBaseline").mockImplementation(async execution=>fullResult(execution));
    const server=createMcpServer(fixture.services),client=new Client({name:"synthetic-human-ui",version:"1"},{capabilities:{elicitation:{form:{}}}});
    const [serverTransport,clientTransport]=InMemoryTransport.createLinkedPair();
    let confirmations=0;
    client.setRequestHandler(ElicitRequestSchema,async request=>{
      expect(request.params.message).toContain(applyTestPath);expect(request.params.message).toContain("FULL_PROJECT_SNAPSHOT");confirmations++;
      expect(existsSync(join(fixture.project,applyTestPath))).toBe(false);
      return {action:"accept",content:{approved:true}};
    });
    await server.connect(serverTransport);await client.connect(clientTransport);
    try{
      const response=await client.callTool({name:"test_apply",arguments:{job_id:fixture.jobId,mode:"apply"}});
      const payload=JSON.parse((response.content as Array<{type:string;text:string}>).find(item=>item.type==="text")!.text);
      expect(payload.data.state).toBe("APPLYING");await waitWorkspaceApply(fixture.jobId);
      expect(confirmations).toBe(1);expect(fixture.services.jobs!.getJob(fixture.jobId).apply_state).toBe("APPLIED");
    }finally{await client.close();await server.close();}
  });
  it("does not claim an unprovable journal rollback completed", async () => {
    vi.spyOn(buildPlan,"runBaseline").mockImplementation(async execution=>{
      const op=fixture.services.storage!.db.prepare<[string],{operation_id:string}>("SELECT operation_id FROM apply_operations WHERE job_id=?").get(fixture.jobId)!;
      writeFileSync(join(fixture.runtime,"jobs",fixture.jobId,"apply",op.operation_id,"publisher/apply-publisher",op.operation_id,"journal.jsonl"),"broken-journal");
      return { ...fullResult(execution), status:"FAILED", failures:1 };
    });
    await handleTestApply({job_id:fixture.jobId,mode:"apply"},fixture.services,yes);await waitWorkspaceApply(fixture.jobId);
    const result=await handleTestResult({job_id:fixture.jobId},fixture.services);
    expect(result.application?.state).toBe("RECOVERY_REQUIRED");expect(result.application?.conflicts?.[0]?.path).toBe(applyTestPath);
    expect(readFileSync(join(fixture.project,applyTestPath),"utf8")).toBe(fixture.file.content);
  });
});
