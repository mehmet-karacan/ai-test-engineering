import {it,expect} from "vitest";
import{mkdtempSync,rmSync}from"node:fs";import{tmpdir}from"node:os";import{join}from"node:path";import{randomUUID}from"node:crypto";
import{Storage}from"../../src/storage/storage.js";import{ProjectRepository}from"../../src/storage/project-repository.js";import{JobRepository}from"../../src/storage/job-repository.js";
import{AgentTaskRepository}from"../../src/storage/agent-task-repository.js";import{InventoryRepository}from"../../src/storage/inventory-repository.js";import type{AgentTaskContract}from"../../src/domain/agent-contracts.js";
it("reports actual durable and legacy model usage once, without unrelated jobs or unused tasks",()=>{
 const root=mkdtempSync(join(tmpdir(),"production-model-usage-")),storage=new Storage({dbPath:join(root,"state.db")});storage.migrate();
 try{const{project,location}=new ProjectRepository(storage.db).ensureLocation(root,"fixture",null),jobs=new JobRepository(storage.db),job=jobs.createJob({locationId:location.id,requestDigest:randomUUID()}),other=jobs.createJob({locationId:location.id,requestDigest:randomUUID()});
 const tasks=new AgentTaskRepository(storage.db),inventory=new InventoryRepository(storage.db),snapshot=randomUUID();
 const contract:AgentTaskContract={schema_version:1,task_id:randomUUID(),job_id:job.id,project_id:project.id,location_id:location.id,job_revision:0,source_snapshot_id:snapshot,source_digest:"a".repeat(64),role:"test_developer",parent_task_id:null,dependency_task_ids:[],input_artifact_refs:[],allowed_context_scope:{snapshot_id:snapshot,root_digest:"b".repeat(64),relative_paths:["src/main"],line_ranges:[],max_bytes:4096,secrets_excluded:true},expected_output_schema:"agent-task-result-v1",budget:{max_attempts:1,remaining_attempts:1,max_minutes:10,remaining_minutes:10,max_output_bytes:4096},model_binding:{provider_id:"fixture",model_id:"test",revision:1},idempotency_key:randomUUID()};
 const task=tasks.createTask(contract),lease=tasks.claimTask(task.task_id,"owner");tasks.recordAttempt({task_id:task.task_id,owner_id:"owner",fence_token:lease.fence_token,attempt_ordinal:lease.attempt_ordinal,provider_id:"fixture",model_id:"test",model_revision:1});
 tasks.createTask({...contract,task_id:randomUUID(),idempotency_key:randomUUID(),model_binding:{provider_id:"unused",model_id:"unused",revision:1}});
 const list=(inventory as unknown as {listUsedModels:(id:string)=>unknown[]}).listUsedModels;
 expect(list).toBeTypeOf("function");expect(list.call(inventory,job.id)).toEqual([{role:"test_developer",provider:"fixture",model:"test"}]);
 for(const id of[job.id,other.id])inventory.writeWorkerAttempt({job_id:id,attempt_ordinal:1,role:"test_developer",provider_id:"fixture",model_id:id===job.id?"test":"foreign",profile_digest:null,session_id:null,message_id:null,status:"ok",input_digest:null,output_digest:null,duration_ms:1,input_tokens:null,output_tokens:null,repair_for_attempt:null,error_class:null});
 expect(list.call(inventory,job.id)).toEqual([{role:"test_developer",provider:"fixture",model:"test"}]);expect(list.call(inventory,other.id)).toEqual([{role:"test_developer",provider:"fixture",model:"foreign"}]);
 }finally{storage.close();rmSync(root,{recursive:true,force:true});}
});
