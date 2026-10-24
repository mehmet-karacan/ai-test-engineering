import { afterEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { ElicitRequestSchema, type ClientCapabilities, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ToolRegistry, type ToolContext } from "../../src/mcp/tool-registry.js";
import { registerToolsOnServer } from "../../src/mcp/server-setup.js";
import { TestApplyInputSchema } from "../../src/domain/tool-schemas.js";
import type { ApplyPlan, RequestApplyApproval } from "../../src/domain/apply-contracts.js";

const jobId = "00000000-0000-4000-8000-000000000001";
const plan: ApplyPlan = {
  schema_version: 1, job_id: jobId, project_id: "project-one", checkpoint_id: "checkpoint-one",
  project_root: "C:/synthetic/project", source_digest: "a".repeat(64), build_digest: "b".repeat(64),
  patch_digest: "c".repeat(64), files: [{ path: "src/test/java/NewTest.java", sha256: "d".repeat(64), bytes: 27 }],
  verification_scope: "FULL_PROJECT_SNAPSHOT",
};
const closers: Array<() => Promise<void>> = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(closers.splice(0).map(close => close())); });

async function fixture(
  answer: ElicitResult | (() => Promise<ElicitResult>) = { action: "accept", content: { approved: true } },
  capabilities: ClientCapabilities = { elicitation: { form: {} } },
  handle?: (context: ToolContext) => Promise<Record<string, unknown>>,
) {
  const registry = new ToolRegistry();
  registry.register({ name: "test_apply", description: "Synthetic approval boundary", inputSchema: z.object({}),
    readOnly: false, idempotent: true, handler: async (_, context) => handle ? handle(context) : {
      approval: context.requestApplyApproval ? await context.requestApplyApproval(plan) : null,
    } });
  const server = new McpServer({ name: "approval-test", version: "1" });
  registerToolsOnServer(server, registry);
  const client = new Client({ name: "approval-client", version: "1" }, { capabilities });
  const forms: unknown[] = [];
  if (capabilities.elicitation) client.setRequestHandler(ElicitRequestSchema, async request => {
    forms.push(request.params);
    return typeof answer === "function" ? answer() : answer;
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const outgoing = vi.spyOn(serverTransport, "send");
  const incoming = vi.spyOn(clientTransport, "send");
  await server.connect(serverTransport); await client.connect(clientTransport);
  closers.push(async () => { await client.close(); await server.close(); });
  const call = async (signal?: AbortSignal) => {
    const result = await client.callTool({ name: "test_apply", arguments: {} }, undefined,
      { timeout: 180_000, ...(signal ? { signal } : {}) });
    const content = result.content as Array<{ type: string; text?: string }>;
    return JSON.parse(content.find(item => item.type === "text")!.text!);
  };
  return { call, forms, outgoing, incoming, server, client };
}

describe("trusted MCP apply approval", () => {
  it("requires only job id and defaults to preview", () => {
    expect(TestApplyInputSchema.safeParse({ job_id: jobId })).toMatchObject({ success: true, data: { mode: "preview" } });
  });
  it.each(["preview", "apply", "recover"])("accepts %s with optional legacy hints", mode => {
    expect(TestApplyInputSchema.safeParse({ job_id: jobId, mode, patch_digest: "A".repeat(64) }).success).toBe(true);
  });
  it("retains legacy hints without treating them as approval", () => {
    const parsed = TestApplyInputSchema.parse({ job_id: jobId, checkpoint_id: jobId,
      project_root: "  C:/synthetic/project  ", target_workspace: "  C:/synthetic/project  ",
      patch_digest: "a".repeat(64), approval_reference: "model-supplied-reference" });
    expect(parsed).toMatchObject({ mode: "preview", project_root: "C:/synthetic/project", target_workspace: "C:/synthetic/project" });
    expect("approved" in parsed).toBe(false);
  });
  it.each([{ approved: true }, { approval_text: "human approved" }, { patch_digest: "g".repeat(64) }, { mode: "approve" }])(
    "rejects spoofed or malformed input %j", input => {
      expect(TestApplyInputSchema.safeParse({ job_id: jobId, ...input }).success).toBe(false);
    });
  it("sends the concrete immutable plan in a required boolean form with default false", async () => {
    const f = await fixture();
    expect((await f.call()).data.approval).toEqual({ action: "accept", approved: true });
    expect(f.forms).toHaveLength(1);
    const form = f.forms[0] as { message: string; requestedSchema: unknown };
    for (const text of [plan.project_root, plan.checkpoint_id, plan.patch_digest, plan.source_digest,
      plan.files[0]!.path, plan.files[0]!.sha256, "FULL_PROJECT_SNAPSHOT"]) expect(form.message).toContain(text);
    expect(form.requestedSchema).toMatchObject({ type: "object", required: ["approved"],
      properties: { approved: { type: "boolean", default: false } } });
    const request = f.incoming.mock.calls.find(([message]) => "method" in message && message.method === "tools/call")![0];
    const elicitation = f.outgoing.mock.calls.find(([message]) => "method" in message && message.method === "elicitation/create")!;
    expect(elicitation[1]?.relatedRequestId).toBe("id" in request ? request.id : undefined);
  });
  it.each([
    { action: "accept", content: { approved: false } },
    { action: "decline", content: { approved: true } },
    { action: "cancel", content: { approved: true } },
  ] satisfies ElicitResult[])("does not authorize $action with $content", async answer => {
    const f = await fixture(answer);
    expect((await f.call()).data.approval.approved).toBe(false);
  });
  it.each([
    { action: "accept" },
    { action: "accept", content: {} },
    { action: "accept", content: { approved: "true" } },
  ] satisfies ElicitResult[])("fails closed on malformed acceptance %j", async answer => {
    const f = await fixture(answer);
    expect((await f.call()).data.approval.approved).toBe(false);
  });
  it.each([{}, { elicitation: { url: {} } }] satisfies ClientCapabilities[])(
    "provides no approval callback without explicit form capability %j", async capabilities => {
      const f = await fixture(undefined, capabilities);
      expect((await f.call()).data.approval).toBeNull(); expect(f.forms).toHaveLength(0);
    });
  it("uses legacy elicitation capability normalized by the installed SDK to form support", async () => {
    const f = await fixture(undefined, { elicitation: {} });
    expect((await f.call()).data.approval).toEqual({ action: "accept", approved: true });
  });
  it("binds simultaneous client decisions to their own originating request", async () => {
    const a = await fixture({ action: "accept", content: { approved: true } });
    const b = await fixture({ action: "decline" }, undefined, async context => ({
      approval: await context.requestApplyApproval!({ ...plan, project_root: "C:/synthetic/other", patch_digest: "e".repeat(64) }),
    }));
    const [accepted, declined] = await Promise.all([a.call(), b.call()]);
    expect(accepted.data.approval).toEqual({ action: "accept", approved: true });
    expect(declined.data.approval).toEqual({ action: "decline", approved: false });
    expect(a.forms).toHaveLength(1); expect(b.forms).toHaveLength(1);
    expect((a.forms[0] as { message: string }).message).toContain("C:/synthetic/project");
    expect((b.forms[0] as { message: string }).message).toContain("C:/synthetic/other");
  });
  it("expires an unanswered form within a bounded deadline", async () => {
    const f = await fixture(() => new Promise(() => {}));
    vi.useFakeTimers();
    const result = f.call();
    await vi.advanceTimersByTimeAsync(125_000);
    expect((await result).data.approval).toEqual({ action: "cancel", approved: false });
  });
  it("cancels the approval when its tool request is cancelled", async () => {
    let outcome: unknown;
    const f = await fixture(() => new Promise(() => {}), undefined, async context => {
      outcome = await context.requestApplyApproval!(plan);
      return { approval: outcome };
    });
    const controller = new AbortController();
    const call = f.call(controller.signal).catch(() => undefined);
    await vi.waitFor(() => expect(f.forms).toHaveLength(1));
    controller.abort(); await call;
    await vi.waitFor(() => expect(outcome).toEqual({ action: "cancel", approved: false }));
  });
  it("honors the coordinator cancellation signal and ignores late acceptance", async () => {
    const controller = new AbortController();
    let accept!: (answer: ElicitResult) => void;
    const f = await fixture(() => new Promise(resolve => { accept = resolve; }), undefined, async context => ({
      approval: await context.requestApplyApproval!(plan, controller.signal),
    }));
    const call = f.call();
    await vi.waitFor(() => expect(f.forms).toHaveLength(1));
    controller.abort(); accept({ action: "accept", content: { approved: true } });
    expect((await call).data.approval).toEqual({ action: "cancel", approved: false });
  });
  it("does not allow a completed request callback to request later approval", async () => {
    let callback!: RequestApplyApproval;
    const f = await fixture(undefined, undefined, async context => { callback = context.requestApplyApproval!; return {}; });
    await f.call();
    expect(await callback(plan)).toEqual({ action: "cancel", approved: false });
    expect(f.forms).toHaveLength(0);
  });
  it("requires a new tool request after a declined form", async () => {
    const f = await fixture({ action: "decline" }, undefined, async context => ({
      first: await context.requestApplyApproval!(plan), second: await context.requestApplyApproval!(plan),
    }));
    const result = await f.call();
    expect(result.data.first).toEqual({ action: "decline", approved: false });
    expect(result.data.second).toEqual({ action: "cancel", approved: false });
    expect(f.forms).toHaveLength(1);
  });
  it.each(["accept", "decline"] as const)("exercises actual stdio transport with %s response", async action => {
    // The suite's existing stdio tests also use the freshly built dist tree.
    const moduleUrl = (file: string) => JSON.stringify(pathToFileURL(resolve("dist", file)).href);
    const script = `
      import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
      import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
      import { z } from 'zod';
      import { ToolRegistry } from ${moduleUrl("mcp/tool-registry.js")};
      import { registerToolsOnServer } from ${moduleUrl("mcp/server-setup.js")};
      const registry = new ToolRegistry();
      registry.register({ name: 'test_apply', description: 'Synthetic form test', inputSchema: z.object({}),
        readOnly: false, idempotent: true, handler: async (_, context) => ({
          approval: context.requestApplyApproval ? await context.requestApplyApproval(${JSON.stringify(plan)}) : null,
        }) });
      const server = new McpServer({name:'stdio-approval-fixture', version:'1'});
      registerToolsOnServer(server, registry); await server.connect(new StdioServerTransport());
    `;
    const client = new Client({ name: "stdio-approval-client", version: "1" }, { capabilities: { elicitation: { form: {} } } });
    let forms = 0;
    client.setRequestHandler(ElicitRequestSchema, async request => {
      forms++; expect(request.params.mode).toBe("form");
      return { action, content: { approved: true } };
    });
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--input-type=module", "-e", script],
      cwd: process.cwd(), stderr: "pipe" });
    closers.push(async () => client.close());
    await client.connect(transport);
    const result = await client.callTool({ name: "test_apply", arguments: {} });
    const content = result.content as Array<{ text: string }>;
    expect(JSON.parse(content[0]!.text).data.approval).toEqual({ action, approved: action === "accept" });
    expect(forms).toBe(1);
  });
});
