import { describe, expect, it, afterEach } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Storage } from "../../src/storage/storage.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { AgentTaskRepository } from "../../src/storage/agent-task-repository.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";
import { AgentScheduler, type AgentTaskContract } from "../../src/index.js";
import { CandidateAgentSessionAdapter } from "../../src/orchestration/candidate-agent-session-adapter.js";
import { FileSystemContextProvider } from "../../src/workers/opencode/context-provider.js";
import { OpenCodeWorkerClient } from "../../src/workers/opencode/worker-client.js";

async function start(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ server: Server; port: number }> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return { server, port: typeof address === "object" && address !== null ? address.port : 0 };
}

function contract(jobId: string, projectId: string, locationId: string, sourceSnapshotId: string, rootPath: string): AgentTaskContract {
  return {
    schema_version: 1,
    task_id: randomUUID(), job_id: jobId, project_id: projectId, location_id: locationId, job_revision: 0,
    source_snapshot_id: sourceSnapshotId, source_digest: "a".repeat(64), role: "test_developer", parent_task_id: null,
    dependency_task_ids: [], input_artifact_refs: [],
    allowed_context_scope: { snapshot_id: sourceSnapshotId, root_digest: "b".repeat(64), relative_paths: [rootPath], line_ranges: [], max_bytes: 4096, secrets_excluded: true },
    expected_output_schema: "candidate-change-set-v1",
    budget: { max_attempts: 1, remaining_attempts: 1, max_minutes: 5, remaining_minutes: 5, max_output_bytes: 512 * 1024 },
    model_binding: { provider_id: "opencode", model_id: "glm-test", revision: 0 },
    idempotency_key: `candidate-${randomUUID()}`,
  };
}

describe("S05 durable candidate agent bridge", () => {
  let root: string | undefined;
  let storage: Storage | undefined;
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    storage?.close();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("changeset'i AgentTask sonucu olarak READY artifact'a baglar", async () => {
    root = mkdtempSync(join(tmpdir(), "aitest-s05-candidate-bridge-"));
    storage = new Storage({ dbPath: join(root, "state.db") });
    storage.migrate();
    const project = new ProjectRepository(storage.db).ensureLocation(join(root, "project"), "s05-bridge", null);
    const job = new JobRepository(storage.db).createJob({ locationId: project.location.id, requestDigest: randomUUID() });
    const artifacts = new ArtifactStore({ root: join(root, "artifacts") });
    const sourceSnapshotId = randomUUID();
    const sourcePath = "src/main/java/Payment.java";
    mkdirSync(join(root, "src", "main", "java"), { recursive: true });
    writeFileSync(join(root, sourcePath), "class Payment {}\n", "utf8");
    const task = contract(job.id, project.project.id, project.location.id, sourceSnapshotId, sourcePath);
    const taskRepo = new AgentTaskRepository(storage.db);
    taskRepo.createTask(task);

    const { server: workerServer, port } = await start((req, res) => {
      if (req.method === "POST" && req.url === "/session") {
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: "candidate-session" })); return;
      }
      if (req.method === "POST" && req.url === "/session/candidate-session/prompt_async") {
        res.writeHead(204); res.end(); return;
      }
      if (req.method === "GET" && req.url === "/session/candidate-session/message") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify([{
          info: { id: "assistant-candidate", role: "assistant", sessionID: "candidate-session", finish: "stop", completed: true, tokens: { input: 13, output: 9 } },
          parts: [{ type: "text", text: JSON.stringify({ schema_version: 1, changes: [{ path: "src/test/java/PaymentTest.java", action: "create", new_content: "class PaymentTest {}" }] }) }],
        }]));
        return;
      }
      res.writeHead(404); res.end();
    });
    server = workerServer;

    const adapter = new CandidateAgentSessionAdapter(new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}` }), {
      db: storage.db,
      artifacts,
      jobId: job.id,
      toolFlags: { write: false, bash: false, task: false, webfetch: false },
    });
    const provider = new FileSystemContextProvider({ rootPath: root, rootDigest: task.allowed_context_scope.root_digest });
    const reports = await new AgentScheduler({ tasks: taskRepo, adapter, contextProvider: provider, maxConcurrency: 1, ownerId: "s05-bridge-test" })
      .run({ taskIds: [task.task_id], parentSessionId: "dispatch-test" });

    expect(reports[0]?.status).toBe("COMPLETED");
    const output = reports[0]?.result?.artifact_refs[0];
    expect(output?.kind).toBe("agent_candidate_changeset");
    expect(output && artifacts.verify(output.sha256)).toBe(true);
    const row = storage.db.prepare<[string], { status: string; job_id: string }>("SELECT status, job_id FROM artifacts WHERE id = ?").get(output!.artifact_id);
    expect(row).toEqual({ status: "READY", job_id: job.id });
    expect(taskRepo.getTask(task.task_id).accepted_output_artifact_id).toBe(output!.artifact_id);
  }, 15000);
  it.each(["ok", "invalid", "TIMEOUT", "CANCELLED"])("supports a protocol-neutral candidate transport (%s)", async kind => {
    root = mkdtempSync(join(tmpdir(), "aitest-candidate-transport-"));
    storage = new Storage({dbPath:join(root,"state.db")});storage.migrate();
    const project = new ProjectRepository(storage.db).ensureLocation(root,"cli",null);
    const job = new JobRepository(storage.db).createJob({locationId:project.location.id,requestDigest:randomUUID()});
    const artifacts = new ArtifactStore({root:join(root,"artifacts")}), snapshot=randomUUID(), sourcePath="src/main/java/Payment.java";
    mkdirSync(join(root,"src/main/java"),{recursive:true});writeFileSync(join(root,sourcePath),"class Payment {}\n");
    const task=contract(job.id,project.project.id,project.location.id,snapshot,sourcePath);
    const repo=new AgentTaskRepository(storage.db);repo.createTask(task);let calls=0;
    const transport={createSession:async()=>({session_id:"generic-session"}),abortSession:async()=>{},generate:async(input:{prompt:string;model:{providerID:string;modelID:string};max_output_bytes:number;signal:AbortSignal})=>{
      calls++;expect(input.prompt).toContain("Payment");expect(input.model).toEqual({providerID:task.model_binding.provider_id,modelID:task.model_binding.model_id});expect(input.max_output_bytes).toBe(task.budget.max_output_bytes);expect(input.signal).toBeInstanceOf(AbortSignal);
      if(kind==="TIMEOUT"||kind==="CANCELLED")throw Object.assign(new Error("bounded failure"),{kind});
      const value=kind==="invalid"?{unexpected:true}:{schema_version:1,changes:[{path:"src/test/java/PaymentCliTest.java",action:"create",new_content:"class PaymentCliTest {}"}]};
      return {value,text:JSON.stringify(value),message_id:null,usage:{input_tokens:3,output_tokens:4}};
    }};
    const adapter=new CandidateAgentSessionAdapter(transport as never,{db:storage.db,artifacts,jobId:job.id,toolFlags:{}});
    const provider=new FileSystemContextProvider({rootPath:root,rootDigest:task.allowed_context_scope.root_digest});
    const result=(await new AgentScheduler({tasks:repo,adapter,contextProvider:provider,ownerId:"transport-test"}).run({taskIds:[task.task_id],parentSessionId:"dispatcher"}))[0]!;
    expect(calls).toBe(1);
    expect(result.outcome_kind).toBe(kind==="ok"?"COMPLETED":kind==="invalid"?"PROVIDER_ERROR":kind);
    if(kind==="ok"){expect(result.accepted).toBe(true);expect(artifacts.verify(result.result!.artifact_refs[0]!.sha256)).toBe(true);}
    else expect(repo.getTask(task.task_id).accepted_output_artifact_id).toBeNull();
  });

});
