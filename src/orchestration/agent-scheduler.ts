import { randomUUID } from "node:crypto";
import {
  AgentTaskResultSchema,
  type AgentRole,
  type AgentTaskContract,
  type AgentTaskResult,
  type ArtifactRef,
  type ModelBinding,
} from "../domain/agent-contracts.js";
import type { AgentTaskRepository, AgentAttemptRow } from "../storage/agent-task-repository.js";
import type { AgentContextPackage, AgentContextProvider } from "../workers/opencode/context-provider.js";

export type AgentExecutionKind =
  | "COMPLETED"
  | "EMPTY_FINAL"
  | "INTERMEDIATE_TOOL"
  | "TRUNCATED_JSON"
  | "PROVIDER_ERROR"
  | "TIMEOUT"
  | "CANCELLED"
  | "BLOCKED";

export interface AgentExecutionOutcome {
  kind: AgentExecutionKind;
  summary: string;
  findings_count: number;
  blocking_findings_count: number;
  artifact_refs: ArtifactRef[];
  changed_paths: string[];
  run_refs: string[];
  next_action: string;
  usage?: { input_tokens: number | null; output_tokens: number | null };
}

export interface AgentSessionDescriptor {
  session_id: string;
  parent_session_id: string;
  role: AgentRole;
  model: ModelBinding;
}

export interface AgentSessionAdapter {
  createSession(input: { task_id: string; parent_session_id: string; role: AgentRole; model: ModelBinding; context_manifest_digest: string }): Promise<AgentSessionDescriptor>;
  execute(input: { contract: AgentTaskContract; context: AgentContextPackage; session_id: string; parent_session_id: string; role: AgentRole; model: ModelBinding; signal: AbortSignal }): Promise<AgentExecutionOutcome>;
  cancelSession(sessionId: string): Promise<void>;
}

export interface AgentRunReport {
  task_id: string;
  attempt_id: string | null;
  parent_session_id: string;
  session_id: string | null;
  status: AgentTaskResult["status"];
  outcome_kind: AgentExecutionKind;
  context_manifest_digest: string | null;
  usage: { input_tokens: number | null; output_tokens: number | null };
  result: AgentTaskResult | null;
  accepted: boolean;
}

export interface AgentSchedulerOptions {
  tasks: AgentTaskRepository;
  adapter: AgentSessionAdapter;
  contextProvider: AgentContextProvider;
  maxConcurrency?: number;
  ownerId?: string;
  leaseTtlMs?: number;
}

export interface AgentSchedulerRunRequest {
  taskIds: string[];
  parentSessionId: string;
  signal?: AbortSignal;
}

const NULL_USAGE = { input_tokens: null, output_tokens: null };

function statusFor(kind: AgentExecutionKind): AgentTaskResult["status"] {
  switch (kind) {
    case "COMPLETED": return "COMPLETED";
    case "CANCELLED": return "CANCELLED";
    case "TIMEOUT": return "INTERRUPTED";
    case "BLOCKED": return "BLOCKED";
    default: return "FAILED";
  }
}

function errorOutcome(kind: AgentExecutionKind, message: string): AgentExecutionOutcome {
  return { kind, summary: "", findings_count: 0, blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: message };
}

function sameModel(a: ModelBinding, b: ModelBinding): boolean {
  return a.provider_id === b.provider_id && a.model_id === b.model_id && a.revision === b.revision;
}

export class AgentScheduler {
  private readonly maxConcurrency: number;
  private readonly ownerId: string;
  private readonly leaseTtlMs: number;

  constructor(private readonly options: AgentSchedulerOptions) {
    this.maxConcurrency = options.maxConcurrency ?? 2;
    this.ownerId = options.ownerId ?? `agent-scheduler-${process.pid}-${randomUUID()}`;
    this.leaseTtlMs = options.leaseTtlMs ?? 300000;
    if (!Number.isSafeInteger(this.maxConcurrency) || this.maxConcurrency < 1 || this.maxConcurrency > 2) {
      throw new Error("Agent scheduler eszamanlilik limiti 1 veya 2 olmali");
    }
    if (!Number.isSafeInteger(this.leaseTtlMs) || this.leaseTtlMs <= 0) throw new Error("Agent scheduler lease TTL gecersiz");
  }

  async run(request: AgentSchedulerRunRequest): Promise<AgentRunReport[]> {
    if (!request.parentSessionId.trim() || request.taskIds.length === 0 || new Set(request.taskIds).size !== request.taskIds.length) {
      throw new Error("Agent scheduler task ve parent session kimlikleri gecersiz");
    }
    const taskRows = request.taskIds.map((taskId) => this.options.tasks.getTask(taskId));
    const taskById = new Map(taskRows.map((task) => [task.task_id, task]));
    for (const task of taskRows) {
      if (task.contract.parent_task_id !== null) {
        const parent = taskById.get(task.contract.parent_task_id);
        if (!parent || parent.contract.parent_task_id !== null) throw new Error("Delegation depth 1 siniri asildi veya parent task eksik");
      }
    }
    const pending = new Set(taskRows.map((task) => task.task_id));
    const reports = new Map<string, AgentRunReport>();
    const active = new Map<string, Promise<AgentRunReport>>();
    const signal = request.signal ?? new AbortController().signal;
    while (pending.size > 0 || active.size > 0) {
      for (const task of taskRows) {
        if (active.size >= this.maxConcurrency || !pending.has(task.task_id)) continue;
        const dependenciesDone = task.contract.dependency_task_ids.every((dependencyId) => {
          const report = reports.get(dependencyId);
          if (report) return report.status === "COMPLETED";
          const external = this.options.tasks.getTask(dependencyId);
          return external.state === "COMPLETED";
        });
        if (!dependenciesDone) continue;
        pending.delete(task.task_id);
        const run = this.runOne(task.contract, request.parentSessionId, signal);
        active.set(task.task_id, run);
        void run.then((report) => { reports.set(task.task_id, report); active.delete(task.task_id); });
      }
      if (active.size === 0 && pending.size > 0) {
        const blocked = [...pending].map((taskId) => taskById.get(taskId)!).filter((task) => task.contract.dependency_task_ids.some((dependencyId) => reports.get(dependencyId)?.status !== "COMPLETED" && this.options.tasks.getTask(dependencyId).state !== "COMPLETED"));
        if (blocked.length === 0) {
          throw new Error("Agent scheduler dependency cycle algiladi");
        }
        for (const task of blocked) {
          pending.delete(task.task_id);
          const run = this.runOne(task.contract, request.parentSessionId, signal, errorOutcome("BLOCKED", "dependency tamamlanmadi"));
          active.set(task.task_id, run);
        }
      }
      if (active.size > 0) await Promise.race(active.values());
    }
    return taskRows.map((task) => reports.get(task.task_id)!).filter(Boolean);
  }

  private async runOne(contract: AgentTaskContract, parentSessionId: string, signal: AbortSignal, forced?: AgentExecutionOutcome): Promise<AgentRunReport> {
    const claim = this.options.tasks.claimTask(contract.task_id, this.ownerId, this.leaseTtlMs);
    const attempt = this.options.tasks.recordAttempt({
      task_id: contract.task_id,
      owner_id: claim.owner_id,
      fence_token: claim.fence_token,
      attempt_ordinal: claim.attempt_ordinal,
      provider_id: contract.model_binding.provider_id,
      model_id: contract.model_binding.model_id,
      model_revision: contract.model_binding.revision,
    });
    let context: AgentContextPackage | null = null;
    let descriptor: AgentSessionDescriptor | null = null;
    let outcome = forced ?? (signal.aborted ? errorOutcome("CANCELLED", "scheduler iptal edildi") : null);
    try {
      if (!outcome) {
        try {
          context = await this.options.contextProvider.provide(contract);
          this.assertContext(contract, context);
        } catch (error) {
          outcome = errorOutcome("BLOCKED", error instanceof Error ? error.message : "context saglanamadi");
        }
      }
      if (!outcome && context) {
        descriptor = await this.options.adapter.createSession({ task_id: contract.task_id, parent_session_id: parentSessionId, role: contract.role, model: contract.model_binding, context_manifest_digest: context.manifest_digest });
        this.assertSession(contract, parentSessionId, descriptor);
        const cancel = (): void => { void this.options.adapter.cancelSession(descriptor!.session_id).catch(() => undefined); };
        signal.addEventListener("abort", cancel, { once: true });
        try {
          outcome = await this.options.adapter.execute({ contract, context, session_id: descriptor.session_id, parent_session_id: parentSessionId, role: contract.role, model: contract.model_binding, signal });
        } finally {
          signal.removeEventListener("abort", cancel);
        }
      }
    } catch (error) {
      outcome = signal.aborted ? errorOutcome("CANCELLED", "scheduler iptal edildi") : errorOutcome("PROVIDER_ERROR", error instanceof Error ? error.message : "provider hatasi");
    }
    let normalized = this.normalizeOutcome(outcome ?? errorOutcome("PROVIDER_ERROR", "worker sonucu yok"));
    let result: AgentTaskResult;
    try {
      result = this.buildResult(contract, attempt, normalized);
    } catch (error) {
      normalized = errorOutcome("PROVIDER_ERROR", `worker sonucu kontrata uymuyor: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
      result = this.buildResult(contract, attempt, normalized);
    }
    let accepted = false;
    try {
      this.options.tasks.completeTask({ task_id: contract.task_id, owner_id: claim.owner_id, fence_token: claim.fence_token, expected_revision: claim.revision, result });
      accepted = true;
    } catch {
      accepted = false;
    }
    return {
      task_id: contract.task_id,
      attempt_id: attempt.attempt_id,
      parent_session_id: parentSessionId,
      session_id: descriptor?.session_id ?? null,
      status: result.status,
      outcome_kind: normalized.kind,
      context_manifest_digest: context?.manifest_digest ?? null,
      usage: normalized.usage ?? NULL_USAGE,
      result,
      accepted,
    };
  }

  private assertContext(contract: AgentTaskContract, context: AgentContextPackage): void {
    if (context.task_id !== contract.task_id || context.job_id !== contract.job_id || context.source_snapshot_id !== contract.source_snapshot_id || context.role !== contract.role || !sameModel(context.model, contract.model_binding) || context.root_digest !== contract.allowed_context_scope.root_digest) throw new Error("Context kimligi task kontratiyla eslesmiyor");
  }

  private assertSession(contract: AgentTaskContract, parentSessionId: string, descriptor: AgentSessionDescriptor): void {
    if (!descriptor.session_id.trim() || descriptor.session_id === parentSessionId || descriptor.parent_session_id !== parentSessionId || descriptor.role !== contract.role || !sameModel(descriptor.model, contract.model_binding)) throw new Error("OpenCode session role/model/parent kimligi eslesmiyor");
  }

  private normalizeOutcome(outcome: AgentExecutionOutcome): AgentExecutionOutcome {
    if (outcome.kind === "COMPLETED" && outcome.summary.trim().length === 0) return errorOutcome("EMPTY_FINAL", "empty final");
    return outcome;
  }

  private buildResult(contract: AgentTaskContract, attempt: Pick<AgentAttemptRow, "attempt_id">, outcome: AgentExecutionOutcome): AgentTaskResult {
    return AgentTaskResultSchema.parse({
      schema_version: 1,
      task_id: contract.task_id,
      job_id: contract.job_id,
      job_revision: contract.job_revision,
      attempt_id: attempt.attempt_id,
      status: statusFor(outcome.kind),
      summary: outcome.summary,
      findings_count: outcome.findings_count,
      blocking_findings_count: outcome.blocking_findings_count,
      artifact_refs: outcome.artifact_refs,
      changed_paths: outcome.changed_paths,
      run_refs: outcome.run_refs,
      next_action: outcome.next_action,
    });
  }
}
