import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { createToolRegistry, createMcpServer } from "../../src/mcp/server-setup.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { InventoryRepository } from "../../src/storage/inventory-repository.js";
import { JobDispatcher, type GoalContract } from "../../src/orchestration/job-dispatcher.js";

describe("user requests through the real MCP registry", () => {
  let root: string;
  let a: string;
  let b: string;
  let services: ReturnType<typeof createDefaultServicesForTest>;
  let registry: ReturnType<typeof createToolRegistry>;
  let job: string;
  let otherJob: string;
  let projectId: string;
  const context = { requestId: "user-flow", services: {} };
  const start = { targets: [{ selector: "demo.Service", kind: "class" }], coverage: { percent: 80 } };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aitest-user-flow-"));
    a = join(root, "project-a"); b = join(root, "project-b");
    mkdirSync(a); mkdirSync(b);
    services = createDefaultServicesForTest(join(root, "state.db"), join(root, "runtime"));
    services.config.storage.root = join(root, "runtime");
    registry = createToolRegistry(services);
    const projects = new ProjectRepository(services.storage!.db);
    const first = projects.ensureLocation(a, "project-a", null);
    const second = projects.ensureLocation(b, "project-b", null);
    projectId = first.project.id;
    job = services.jobs!.createJob({ locationId: first.location.id, requestDigest: "first" }).id;
    otherJob = services.jobs!.createJob({ locationId: second.location.id, requestDigest: "other" }).id;
    for (const id of [job, otherJob]) {
      services.jobs!.updateLifecycle(id, "RUNNING", services.jobs!.getJob(id).row_version);
      services.jobs!.updateLifecycle(id, "COMPLETED", services.jobs!.getJob(id).row_version);
    }
  });
  afterEach(() => { vi.restoreAllMocks(); services.storage!.close(); rmSync(root, { recursive: true, force: true }); });
  const call = (name: string, input: unknown) => registry.call(name, input, context);

  it.each(["project_inspect", "project_coverage", "project_query", "test_start", "test_status", "test_resume", "test_cancel", "test_result", "test_apply"])("returns a parameter error for null input to %s", async name => {
    expect((await call(name, null)).error?.code).toBe("INVALID_PARAMETERS");
    expect(services.storage!.db.prepare("SELECT COUNT(*) n FROM test_jobs").get()).toEqual({ n: 2 });
  });
  it("asks the user to choose when two Maven projects exist under the supplied folder", async () => {
    for (const path of [a,b]) writeFileSync(join(path,"pom.xml"),"<project/>");
    const result=await call("project_coverage",{project_root:root});
    expect(result.error?.code).toBe("INVALID_PARAMETERS");
    expect((result.error?.details?.candidates as string[]).sort()).toEqual(["project-a","project-b"]);
    expect(services.storage!.db.prepare("SELECT COUNT(*) n FROM test_jobs").get()).toEqual({n:2});
  });
  it("serves schema discovery and normal requests over the real MCP SDK transport", async () => {
    const server=createMcpServer(services,"v1");
    const client=new Client({name:"user-flow-test",version:"1"});
    const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport); await client.connect(clientTransport);
      const list=await client.listTools();
      expect(list.tools.some(tool=>tool.name==="test_start")).toBe(true);
      const reply=await client.callTool({name:"test_status",arguments:{project_root:`  ${a}  `}});
      const content=reply.content as Array<{type:string;text?:string}>;
      const result=JSON.parse(content.find(item=>item.type==="text")!.text!);
      expect(result.status).toBe("ok"); expect(result.data.job_id).toBe(job);
    } finally {await client.close();await server.close();}
  });

  it.each(["project_inspect", "project_coverage", "test_start", "test_status", "test_resume", "project_query"])("rejects whitespace-only roots for %s without doing work", async name => {
    const result = await call(name, { ...start, project_root: "   ", view: "projects" });
    expect(result.error?.code).toBe("INVALID_PARAMETERS");
    expect(services.storage!.db.prepare("SELECT COUNT(*) n FROM test_jobs").get()).toEqual({ n: 2 });
  });
  it("normalizes surrounding whitespace in a copied project path", async () => {
    const result = await call("test_status", { project_root: `  ${a}  ` });
    expect(result.status).toBe("ok"); expect(result.data?.job_id).toBe(job);
  });
  it.each([{metrics:[]}, {metrics:["LINE", "LINE"]}, {metrics:["BRANCH", "BRANCH"]}])("rejects empty or repeated metrics $metrics before creating a job", async ({metrics}) => {
    const result = await call("test_start", { ...start, project_root: a, coverage: { percent: 80, metrics } });
    expect(result.error?.code).toBe("INVALID_PARAMETERS");
    expect(services.storage!.db.prepare("SELECT COUNT(*) n FROM test_jobs").get()).toEqual({ n: 2 });
  });
  it("rejects an explicit branch goal that would otherwise be silently ignored", async () => {
    const result = await call("test_start", { ...start, project_root: a, coverage: { percent: 80, branch_percent: 90, metrics: ["LINE"] } });
    expect(result.error?.code).toBe("INVALID_PARAMETERS");
  });
  it("rejects a blank class selector before inventory discovery", async () => {
    const result = await call("test_start", { ...start, project_root: a, targets: [{ selector: "  ", kind: "class" }] });
    expect(result.error?.code).toBe("INVALID_PARAMETERS");
  });
  it.each(["-1", "2oops", "1.5", "NaN", "9007199254740992", ""])("does not turn malformed pagination %j into the first page", async cursor => {
    const result = await call("project_query", { project_root: a, view: "job_history", cursor });
    expect(result.error?.code).toBe("INVALID_PARAMETERS");
  });
  it.each(["test_status", "test_resume"])("rejects a job from another project for %s without changing its state", async name => {
    const before = services.jobs!.getJob(job);
    const events = services.jobs!.listEvents(job);
    const result = await call(name, { job_id: job, project_root: b });
    expect(result.error?.code).toBe("INVALID_PARAMETERS");
    expect(result.error?.details?.reason_code).toBe("JOB_PROJECT_MISMATCH");
    expect(services.jobs!.getJob(job)).toEqual(before);
    expect(services.jobs!.listEvents(job)).toEqual(events);
    expect((await call(name, { job_id: job, project_root: a })).status).toBe("ok");
  });
  it("rejects conflicting project ID and root instead of using either silently", async () => {
    const result = await call("project_query", { project_root: b, project_id: projectId, view: "job_history" });
    expect(result.error?.code).toBe("INVALID_PARAMETERS");
    expect(result.error?.details?.reason_code).toBe("PROJECT_CONTEXT_MISMATCH");
  });
  it("keeps an explicit project ID scoped when a renamed project shares the same root", async () => {
    const renamed=new ProjectRepository(services.storage!.db).ensureLocation(a,"renamed-a",null);
    services.jobs!.createJob({locationId:renamed.location.id,requestDigest:"renamed"});
    const result=await call("project_query",{project_root:a,project_id:projectId,view:"job_history"});
    expect(result.status).toBe("ok");
    expect(result.data?.rows).toMatchObject([{id:job}]);
    expect(result.data?.rows).toHaveLength(1);
  });
  it("lists known projects when the user asks which projects exist", async () => {
    const result = await call("project_query", { view: "projects", limit: 1 });
    expect(result.status).toBe("ok");
    expect(result.data?.rows).toHaveLength(1); expect(result.data?.next_cursor).toBe("1");
    const next = await call("project_query", { view: "projects", limit: 1, cursor: "1" });
    expect(next.data?.rows).toHaveLength(1); expect(next.data?.next_cursor).toBeNull();
    const rows = [...result.data!.rows as Array<{name:string}>, ...next.data!.rows as Array<{name:string}>];
    expect(rows.map(r => r.name).sort()).toEqual(["project-a", "project-b"]);
  });
  it("returns actual coverage history in stable pages without mixing projects", async () => {
    const inventory = new InventoryRepository(services.storage!.db);
    for (const [id, covered, stage] of [[job, 2, "before"], [job, 8, "after"], [otherJob, 10, "after"]] as const) {
      inventory.writeCoverageSnapshot({ job_id:id, target_symbol_id:null, run_id:null, fqn:"demo.Service", source_sha256:null, binary_class_id:null, line_covered:covered, line_missed:10-covered, branch_covered:null, branch_missed:null, line_validity:"OK", branch_validity:"NOT_APPLICABLE", before_after:stage, checkpoint_id:null });
    }
    services.storage!.db.prepare("UPDATE coverage_snapshots SET created_at = 42").run();
    const first = await call("project_query", { project_root:a, view:"coverage_history", limit:1 });
    expect(first.data?.rows).toMatchObject([{job_id:job,line_covered:8,before_after:"after",line_validity:"OK",branch_validity:"NOT_APPLICABLE",branch_covered:null,branch_missed:null}]);
    expect(first.data?.next_cursor).toBe("1");
    const next = await call("project_query", { project_root:a, view:"coverage_history", limit:1, cursor:"1" });
    expect(next.data?.rows).toMatchObject([{job_id:job,line_covered:2,before_after:"before"}]);
    expect(next.data?.next_cursor).toBeNull();
  });
  it.each(["test_status", "test_resume"])("asks for context when %s has no job or project", async name => {
    expect((await call(name, {})).error?.code).toBe("INVALID_PARAMETERS");
    expect((await call(name, {job_id:job})).status).toBe("ok");
  });
  it.each([-1, 101, 80.001, "80%", null])("rejects an invalid target %j and accepts a subsequent normal request", async percent => {
    expect((await call("test_start", {...start,project_root:a,coverage:{percent}})).error?.code).toBe("INVALID_PARAMETERS");
    expect((await call("test_status", {job_id:job})).data?.lifecycle).toBe("COMPLETED");
  });
  it("does not restart a completed job when resume or cancel is repeated", async () => {
    const before=services.jobs!.getJob(job);
    expect((await call("test_resume", {job_id:job})).data?.resumed).toBe(false);
    expect((await call("test_cancel", {job_id:job,reason:"cancel"})).data?.lifecycle).toBe("COMPLETED");
    expect(services.jobs!.getJob(job)).toEqual(before);
  });
  it.each(["classes", "modules", "packages", "tests", "job_history", "coverage_history"])("asks which project when the user requests %s without context", async view => {
    expect((await call("project_query", {view})).error?.code).toBe("INVALID_PARAMETERS");
  });
  it.each([
    {metrics:["BRANCH"],line:0,branch:8000},
    {metrics:["LINE"],line:8000,branch:0},
    {metrics:["LINE","BRANCH"],line:8000,branch:8000},
  ])("carries only the requested metrics $metrics and deduplicates repeated starts", async ({metrics,line,branch}) => {
    cpSync(join(process.cwd(), "tests/fixtures/sample-maven-project"), a, {recursive:true});
    let goal: GoalContract | undefined;
    const dispatch=vi.spyOn(JobDispatcher.prototype,"dispatch").mockImplementation(async (j,g) => {
      goal=g; return {job_id:j.id,phases_completed:[],final_outcome:"STUB",best_coverage:null,error:null};
    });
    const input={project_root:a,targets:[{selector:"com.example.payment.PaymentService",kind:"class"}],coverage:{percent:80,metrics},idempotency_key:"repeat-request"};
    const first=await call("test_start",input);
    expect(first.status).toBe("ok"); expect(first.data?.created).toBe(true);
    await new Promise<void>(resolve=>setImmediate(resolve));
    expect(goal?.targets[0]).toMatchObject({line_target_bps:line,branch_target_bps:branch});
    const persisted=services.storage!.db.prepare("SELECT line_target_bps,branch_target_bps FROM job_targets WHERE job_id = ?").get(first.data!.job_id);
    expect(persisted).toEqual({line_target_bps:line,branch_target_bps:metrics.includes("BRANCH")?branch:null});
    const again=await call("test_start",{...input,coverage:{...input.coverage,metrics:[...metrics].reverse()}});
    await new Promise<void>(resolve=>setImmediate(resolve));
    expect(again.data).toMatchObject({job_id:first.data!.job_id,created:false});
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
