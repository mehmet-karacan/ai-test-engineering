import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { saveConfig } from "../../src/configuration/config-loader.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { CheckpointStore, type CheckpointManifest } from "../../src/orchestration/checkpoint-store.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import type { ToolResult } from "../../src/mcp/tool-registry.js";

// Real MCP child processes and durable SQLite/artifacts. No model/JVM is run.
describe("continuation across real stdio processes", () => {
  let root:string,a:string,b:string,job:string,checkpoint:string,config:string;
  let services:ReturnType<typeof createDefaultServicesForTest>;
  let client:Client|undefined,transport:StdioClientTransport;
  let store:CheckpointStore;
  const content="package demo; class AcceptedTest {}\n";
  const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
  const call=async(name:string,args:Record<string,unknown>)=>{
    const result=await client!.callTool({name,arguments:args});
    return JSON.parse((result.content as Array<{type:string;text?:string}>).find(p=>p.type==="text")!.text!) as ToolResult;
  };
  async function connect(cwd:string) {
    transport=new StdioClientTransport({command:process.execPath,args:[join(process.cwd(),"dist/mcp/stdio-entry.js")],cwd,
      env:{...process.env as Record<string,string>,AITEST_CONFIG:config,AITEST_DB_PATH:join(root,"state.db"),AITEST_WORKER_ENABLED:"0"},stderr:"pipe"});
    client=new Client({name:"continuation-user",version:"1"});
    await client.connect(transport);
  }
  beforeEach(()=>{
    root=mkdtempSync(join(tmpdir(),"aitest-continuation-stdio-"));
    a=join(root,"repo-a");b=join(root,"repo-b");mkdirSync(a);mkdirSync(b);
    writeFileSync(join(a,"pom.xml"),"<project/>");
    services=createDefaultServicesForTest(join(root,"state.db"),join(root,"runtime"));
    services.config.storage.root=join(root,"runtime");config=join(root,"config.json");saveConfig(services.config,config);
    const repo=new ProjectRepository(services.storage!.db);const location=repo.ensureLocation(a,"repo-a",null).location;
    repo.ensureLocation(b,"repo-b",null);
    job=services.jobs!.createJob({locationId:location.id,requestDigest:"persisted-work"}).id;
    services.storage!.db.prepare("INSERT INTO job_targets (id,job_id,selector,target_kind,line_target_bps,branch_target_bps,created_at) VALUES (?,?,'demo.Service','class',8000,8000,?)").run(randomUUID(),job,Date.now());
    store=new CheckpointStore(services.storage!.db,services.config.storage.root);
    const path="src/test/java/demo/AcceptedTest.java";
    const manifest:CheckpointManifest={schema_version:1,job_id:job,project_id:location.project_id,location_id:location.id,
      target_ids:["demo.Service"],user_goal:"coverage:80",source_snapshot_id:null,head_commit:null,source_digest:"a".repeat(64),dirty_digest:null,build_digest:"b".repeat(64),policy_digest:null,parser_version:"fixture",toolchain:{},
      accepted_changes:[{path,sha256:hash(content),action:"create"}],parent_checkpoint_id:null,baseline_run_id:null,last_trusted_run_id:null,
      active_phase:"generation",next_action:"candidate_accepted",remaining_budget:{max_candidate_iterations:3},requested_model:"fixture/model",resolved_model:"fixture/model",worker_session_ref:null,generation:2,created_at:Date.now()};
    const blobs=store.publishAcceptedBlobs(job,[{path,sha256:hash(content),action:"create",content}]);
    checkpoint=store.publishCheckpoint(manifest,null,null,blobs).checkpoint_id;
    services.jobs!.updateLifecycle(job,"PAUSED",services.jobs!.getJob(job).row_version);
  });
  afterEach(async()=>{
    try{await client?.close();}finally{client=undefined;services.storage!.close();rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
  });

  it("reopens from another repo and recovers the old job without mixing roots or rewriting its checkpoint",async()=>{
    const before=store.verifyCheckpoint(checkpoint);
    await connect(a);
    expect((await call("test_status",{job_id:job,project_root:a})).data?.job_context).toMatchObject({best_checkpoint_id:checkpoint});
    await client!.close();client=undefined;
    await connect(b);
    const wrong=await call("test_result",{job_id:job,project_root:b});
    expect(wrong.error?.details?.reason_code).toBe("JOB_PROJECT_MISMATCH");
    const old=await call("test_result",{job_id:job,project_root:a});
    expect(old.data?.job_context).toMatchObject({best_checkpoint_id:checkpoint,targets:[{selector:"demo.Service",line_target_bps:8000,branch_target_bps:8000}]});
    expect(old.data?.required_action).toContain("test_resume");
    expect(store.verifyCheckpoint(checkpoint)).toEqual(before);
    expect(services.storage!.db.prepare("SELECT COUNT(*) n FROM test_jobs").get()).toEqual({n:1});
  });

  it("preserves durable work after killing only its owned MCP process and exposes expired ownership",async()=>{
    services.jobs!.updateLifecycle(job,"RUNNING",services.jobs!.getJob(job).row_version);
    const lease=new LeaseManager(services.storage!.db).acquire(job,"interrupted-owner",1000).lease;
    await connect(a);const pid=transport.pid;expect(pid).toBeTypeOf("number");
    process.kill(pid!); // PID obtained from this exact test-owned transport.
    await client!.close();client=undefined;
    await expect.poll(()=>Date.now()>lease.expires_at,{timeout:5000}).toBe(true);
    await connect(b);
    const status=await call("test_status",{job_id:job,project_root:a});
    expect(status.data?.lifecycle).toBe("RUNNING");
    expect(status.data?.job_context).toMatchObject({best_checkpoint_id:checkpoint,execution_state:"NO_ACTIVE_LEASE"});
    expect(status.data?.required_action).toContain("test_resume");
    expect(store.verifyCheckpoint(checkpoint).valid).toBe(true);
    const accepted=store.verifyCheckpoint(checkpoint).manifest!.accepted_changes[0]!;
    const blob=join(services.config.storage.root,"blobs/accepted",job,accepted.sha256.slice(0,2),accepted.sha256.slice(2,4),accepted.sha256);
    expect(readFileSync(blob,"utf8")).toBe(content);
  });

  it("pauses then cancels through MCP and repeated resume cannot resurrect the cancelled job",async()=>{
    services.jobs!.updateLifecycle(job,"RUNNING",services.jobs!.getJob(job).row_version);
    await connect(b);
    const paused=await call("test_cancel",{job_id:job,project_root:a,reason:"pause"});
    expect(paused.data).toMatchObject({lifecycle:"PAUSED",cleanup_pending:false});
    const stopped=await call("test_cancel",{job_id:job,project_root:a,reason:"cancel"});
    expect(stopped.data?.lifecycle).toBe("CANCELLED");
    const before=services.jobs!.getJob(job);
    for(let n=0;n<3;n++) expect((await call("test_resume",{job_id:job,project_root:a})).data?.resumed).toBe(false);
    expect(services.jobs!.getJob(job)).toEqual(before);
    expect(store.bestCheckpoint(job)).toBe(checkpoint);
  });
});
