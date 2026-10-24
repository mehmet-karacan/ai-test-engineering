import { z } from "zod";
import type {
  AgentExecutionOutcome,
  AgentSessionAdapter,
  AgentSessionDescriptor,
} from "../../orchestration/agent-scheduler.js";
import type { AgentTaskContract } from "../../domain/agent-contracts.js";
import type { AgentContextPackage } from "./context-provider.js";
import { OpenCodeWorkerClient, promptForJsonResult, WorkerRequestFailure } from "./worker-client.js";
import { defaultWorkerConfig, MAX_WORKER_REQUEST_TIMEOUT_MS, workerToolFlags } from "./worker-config.js";
import { renderTaskBrief, defaultAgentAssignment } from "./task-brief.js";

const OutcomeSchema = z.object({
  kind: z.enum(["COMPLETED", "EMPTY_FINAL", "INTERMEDIATE_TOOL", "TRUNCATED_JSON", "PROVIDER_ERROR", "TIMEOUT", "CANCELLED", "BLOCKED"]),
  summary: z.string().max(6144).refine((value) => Buffer.byteLength(value, "utf8") <= 6 * 1024, "summary 6 KiB UTF-8 sinirini asiyor"),
  findings_count: z.number().int().nonnegative(),
  blocking_findings_count: z.number().int().nonnegative(),
  artifact_refs: z.array(z.object({
    artifact_id: z.string().uuid(),
    job_id: z.string().uuid(),
    kind: z.string().min(1).max(128),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    bytes: z.number().int().nonnegative(),
    schema_version: z.string().min(1).max(32),
  })).max(64),
  changed_paths: z.array(z.string().min(1).max(1024)).max(512),
  run_refs: z.array(z.string().min(1).max(256)).max(64),
  next_action: z.string().max(1024),
});

function promptFor(contract: AgentTaskContract, contextText: string, contextManifestDigest: string, parentSessionId: string, sessionId: string): string {
  return [
    ...renderTaskBrief(contract.assignment ?? defaultAgentAssignment(contract.role)),
    `Asama etiketi (kayit icin): ${contract.role}`,
    `Task: ${contract.task_id}`,
    `Parent session: ${parentSessionId}`,
    `Child session: ${sessionId}`,
    `Context manifest digest: ${contextManifestDigest}`,
    `Model binding: ${contract.model_binding.provider_id}/${contract.model_binding.model_id}@${contract.model_binding.revision}`,
    `Expected output schema: ${contract.expected_output_schema}`,
    "Only use the scoped context below. Do not call tools, read files, write files, or access other sessions.",
    "Return only JSON with kind, summary, findings_count, blocking_findings_count, artifact_refs, changed_paths, run_refs, next_action.",
    `JSON Schema: ${JSON.stringify(z.toJSONSchema(OutcomeSchema))}`,
    "Do the analysis/design/development/checking needed for this task; the JSON format limits the final transport, not the skills used to solve it.",
    "\n## Scoped context\n",
    contextText,
  ].join("\n");
}

function mapFailure(error: WorkerRequestFailure): AgentExecutionOutcome {
  const kind = error.outcome_kind;
  if (kind === "REQUEST_TIMEOUT") return { kind: "TIMEOUT", summary: "", findings_count: 0, blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "retry after timeout" };
  if (kind === "CANCELLED") return { kind: "CANCELLED", summary: "", findings_count: 0, blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "resume task" };
  if (kind === "EMPTY_FINAL") return { kind: "EMPTY_FINAL", summary: "", findings_count: 0, blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "retry after empty final" };
  if (kind === "OUTPUT_TRUNCATED") return { kind: "TRUNCATED_JSON", summary: "", findings_count: 0, blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "retry with smaller output" };
  return { kind: "PROVIDER_ERROR", summary: "", findings_count: 0, blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "inspect provider error" };
}

/**
 * Adapter for the installed OpenCode HTTP surface. Parent/session lineage is
 * stored by AgentScheduler; unsupported parentID fields are never sent to the
 * provider. The provider only receives the bounded context package.
 */
export class OpenCodeAgentSessionAdapter implements AgentSessionAdapter {
  private readonly toolFlags: Record<string, boolean>;

  constructor(private readonly client: OpenCodeWorkerClient, toolFlags?: Record<string, boolean>) {
    this.toolFlags = toolFlags ?? workerToolFlags(defaultWorkerConfig("http://127.0.0.1"));
  }

  async createSession(input: { task_id: string; parent_session_id: string; role: AgentTaskContract["role"]; model: AgentTaskContract["model_binding"]; context_manifest_digest: string }): Promise<AgentSessionDescriptor> {
    const session = await this.client.createSession();
    if (!session.session_id.trim()) throw new Error("OpenCode bos session id dondurdu");
    return {
      session_id: session.session_id,
      parent_session_id: input.parent_session_id,
      role: input.role,
      model: input.model,
    };
  }

  async execute(input: { contract: AgentTaskContract; context: AgentContextPackage; session_id: string; parent_session_id: string; role: AgentTaskContract["role"]; model: AgentTaskContract["model_binding"]; signal: AbortSignal }): Promise<AgentExecutionOutcome> {
    const abort = (): void => { void this.client.abortSession(input.session_id).catch(() => undefined); };
    input.signal.addEventListener("abort", abort, { once: true });
    try {
      const timeoutMs = Math.max(1, Math.min(MAX_WORKER_REQUEST_TIMEOUT_MS, Math.floor(input.contract.budget.remaining_minutes * 60_000)));
      const response = await promptForJsonResult(this.client, {
        session_id: input.session_id,
        prompt: promptFor(input.contract, input.context.text, input.context.manifest_digest, input.parent_session_id, input.session_id),
        model: { providerID: input.model.provider_id, modelID: input.model.model_id },
        tools: this.toolFlags,
        timeout_ms: timeoutMs,
      });
      const parsed = OutcomeSchema.safeParse(response.value);
      if (!parsed.success) {
        return { kind: "PROVIDER_ERROR", summary: "", findings_count: 0, blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "invalid agent outcome schema" };
      }
      return { ...parsed.data, usage: response.result.usage };
    } catch (error) {
      if (error instanceof WorkerRequestFailure) return mapFailure(error);
      return { kind: "PROVIDER_ERROR", summary: "", findings_count: 0, blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "provider error" };
    } finally {
      input.signal.removeEventListener("abort", abort);
    }
  }

  async cancelSession(sessionId: string): Promise<void> {
    await this.client.abortSession(sessionId);
  }
}
