import { describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { OpenCodeWorkerClient } from "../../src/workers/opencode/worker-client.js";
import { OpenCodeAgentSessionAdapter } from "../../src/workers/opencode/agent-session-adapter.js";
import type { AgentTaskContract } from "../../src/domain/agent-contracts.js";

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function start(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ server: Server; port: number }> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return { server, port: typeof address === "object" && address !== null ? address.port : 0 };
}

function contract(): AgentTaskContract {
  const snapshot = randomUUID();
  return {
    schema_version: 1,
    task_id: randomUUID(), job_id: randomUUID(), project_id: randomUUID(), location_id: randomUUID(), job_revision: 2,
    source_snapshot_id: snapshot, source_digest: "a".repeat(64), role: "test_architect", parent_task_id: null,
    dependency_task_ids: [], input_artifact_refs: [],
    allowed_context_scope: { snapshot_id: snapshot, root_digest: "b".repeat(64), relative_paths: ["src/X.java"], line_ranges: [], max_bytes: 4096, secrets_excluded: true },
    expected_output_schema: "agent-task-result-v1",
    budget: { max_attempts: 2, remaining_attempts: 2, max_minutes: 5, remaining_minutes: 5, max_output_bytes: 6144 },
    model_binding: { provider_id: "opencode", model_id: "glm-5.3-flash", revision: 4 },
    idempotency_key: `adapter-${randomUUID()}`,
  };
}

describe("WN44 OpenCode agent session adapter", () => {
  it("session lineage, model binding ve bounded JSON sonucu korur", async () => {
    let prompt: Record<string, unknown> | null = null;
    const { server, port } = await start(async (req, res) => {
      if (req.method === "POST" && req.url === "/session") {
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: "child-session" })); return;
      }
      if (req.method === "POST" && req.url === "/session/child-session/prompt_async") {
        prompt = await body(req); res.writeHead(204); res.end(); return;
      }
      if (req.method === "GET" && req.url === "/session/child-session/message") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify([{ info: { id: "assistant-1", role: "assistant", sessionID: "child-session", finish: "stop", completed: true, tokens: { input: 11, output: 7 } }, parts: [{ type: "text", text: JSON.stringify({ kind: "COMPLETED", summary: "hazir", findings_count: 1, blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "continue" }) }] }]));
        return;
      }
      res.writeHead(404); res.end();
    });
    try {
      const task = contract();
      const adapter = new OpenCodeAgentSessionAdapter(new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}` }));
      const descriptor = await adapter.createSession({ task_id: task.task_id, parent_session_id: "parent-session", role: task.role, model: task.model_binding, context_manifest_digest: "c".repeat(64) });
      const result = await adapter.execute({
        contract: task,
        context: { task_id: task.task_id, job_id: task.job_id, source_snapshot_id: task.source_snapshot_id, role: task.role, model: task.model_binding, root_digest: "b".repeat(64), manifest_digest: "c".repeat(64), text: "scoped", omitted: [], bytes: 6 },
        session_id: descriptor.session_id, parent_session_id: "parent-session", role: task.role, model: task.model_binding, signal: new AbortController().signal,
      });
      expect(result.kind).toBe("COMPLETED");
      expect(result.usage).toEqual({ input_tokens: 11, output_tokens: 7 });
      expect(JSON.stringify(prompt)).toContain("Context manifest digest");
      expect(JSON.stringify(prompt)).toContain("parent-session");
    } finally { server.close(); }
  }, 15000);

  it("empty final'i basarisiz typed sonuca cevirir", async () => {
    const { server, port } = await start((req, res) => {
      if (req.method === "POST" && req.url === "/session") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: "empty-session" })); return; }
      if (req.method === "POST" && req.url === "/session/empty-session/prompt_async") { res.writeHead(204); res.end(); return; }
      if (req.method === "GET" && req.url === "/session/empty-session/message") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify([{ info: { id: "empty", role: "assistant", sessionID: "empty-session", finish: "stop", completed: true }, parts: [] }])); return; }
      res.writeHead(404); res.end();
    });
    try {
      const task = contract();
      const adapter = new OpenCodeAgentSessionAdapter(new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}` }));
      const descriptor = await adapter.createSession({ task_id: task.task_id, parent_session_id: "parent-session", role: task.role, model: task.model_binding, context_manifest_digest: "c".repeat(64) });
      const result = await adapter.execute({ contract: task, context: { task_id: task.task_id, job_id: task.job_id, source_snapshot_id: task.source_snapshot_id, role: task.role, model: task.model_binding, root_digest: "b".repeat(64), manifest_digest: "c".repeat(64), text: "scoped", omitted: [], bytes: 6 }, session_id: descriptor.session_id, parent_session_id: "parent-session", role: task.role, model: task.model_binding, signal: new AbortController().signal });
      expect(result.kind).toBe("EMPTY_FINAL");
      expect(result.next_action).toMatch(/empty/i);
    } finally { server.close(); }
  }, 15000);
});
