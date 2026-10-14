/**
 * CandidateLoop icin durable AgentScheduler -> OpenCode bridge.
 *
 * OpenCode cevabi dogrudan CandidateLoop'a verilmez. Once schema dogrulanir,
 * content-addressed artifact olarak yayinlanir ve ayni job'a ait artifact
 * satiri yazilir. AgentScheduler bu artifact referansini fenced task sonucu
 * olarak kabul eder; caller yalniz bu referansi okuyarak changeset'i alir.
 */
import { createHash } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { CandidateChangeSetSchema, type CandidateChangeSet } from "../workers/opencode/model-schemas.js";
import { OpenCodeWorkerClient, promptForJsonResult, WorkerRequestFailure } from "../workers/opencode/worker-client.js";
import type {
  AgentExecutionOutcome,
  AgentSessionAdapter,
  AgentSessionDescriptor,
} from "./agent-scheduler.js";
import type { AgentTaskContract, ArtifactRef } from "../domain/agent-contracts.js";
import type { AgentContextPackage } from "../workers/opencode/context-provider.js";
import type { ArtifactStore } from "../storage/artifact-store.js";

function emptyOutcome(kind: AgentExecutionOutcome["kind"], nextAction: string): AgentExecutionOutcome {
  return {
    kind,
    summary: "",
    findings_count: 0,
    blocking_findings_count: 0,
    artifact_refs: [],
    changed_paths: [],
    run_refs: [],
    next_action: nextAction,
  };
}

function mapFailure(error: WorkerRequestFailure): AgentExecutionOutcome {
  if (error.outcome_kind === "REQUEST_TIMEOUT") return emptyOutcome("TIMEOUT", "candidate worker timeout; retry");
  if (error.outcome_kind === "CANCELLED") return emptyOutcome("CANCELLED", "candidate worker cancelled; resume");
  if (error.outcome_kind === "EMPTY_FINAL") return emptyOutcome("EMPTY_FINAL", "candidate worker empty final; retry");
  if (error.outcome_kind === "OUTPUT_TRUNCATED") return emptyOutcome("TRUNCATED_JSON", "candidate output truncated; retry with smaller output");
  return emptyOutcome("PROVIDER_ERROR", "candidate worker output invalid or unavailable");
}

function artifactRef(record: { id: string; sha256: string; bytes: number; kind: string; schemaVersion?: string; jobId: string }): ArtifactRef {
  return {
    artifact_id: record.id,
    job_id: record.jobId,
    kind: record.kind,
    sha256: record.sha256,
    bytes: record.bytes,
    schema_version: record.schemaVersion ?? "1",
  };
}

export interface CandidateAgentSessionAdapterOptions {
  db: BetterSqlite3.Database;
  artifacts: ArtifactStore;
  jobId: string;
  toolFlags: Record<string, boolean>;
}

/**
 * Candidate changeset'i AgentTaskResult artifact'i olarak ureten adapter.
 * Session parent/child kimligi AgentScheduler tarafindan dogrulanir.
 */
export class CandidateAgentSessionAdapter implements AgentSessionAdapter {
  constructor(
    private readonly client: OpenCodeWorkerClient,
    private readonly options: CandidateAgentSessionAdapterOptions,
  ) {}

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
      const timeoutMs = Math.max(1, Math.min(300000, Math.floor(input.contract.budget.remaining_minutes * 60_000)));
      const response = await promptForJsonResult(this.client, {
        session_id: input.session_id,
        prompt: input.context.text,
        model: { providerID: input.model.provider_id, modelID: input.model.model_id },
        tools: this.options.toolFlags,
        timeout_ms: timeoutMs,
      });
      const parsed = CandidateChangeSetSchema.safeParse(response.value);
      if (!parsed.success) return emptyOutcome("PROVIDER_ERROR", "candidate changeset schema invalid");
      const changeset: CandidateChangeSet = parsed.data;
      const serialized = JSON.stringify(changeset);
      const published = this.options.artifacts.publish("agent_candidate_changeset", serialized, {
        schemaVersion: "1",
        sensitivity: "internal",
      });
      const existing = this.options.db.prepare<[string, string, string], {
        id: string;
        job_id: string;
        kind: string;
        relative_store_path: string;
        sha256: string;
        bytes: number;
        schema_version: string | null;
      }>(
        "SELECT id, job_id, kind, relative_store_path, sha256, bytes, schema_version FROM artifacts WHERE sha256 = ? AND relative_store_path = ? AND job_id = ? AND kind = 'agent_candidate_changeset' AND status = 'READY'",
      ).get(published.sha256, published.relativeStorePath, this.options.jobId);
      const ref = artifactRef({
        id: existing?.id ?? published.id,
        sha256: existing?.sha256 ?? published.sha256,
        bytes: existing?.bytes ?? published.bytes,
        kind: existing?.kind ?? published.kind,
        jobId: this.options.jobId,
        schemaVersion: existing?.schema_version ?? published.schemaVersion ?? "1",
      });
      // ArtifactStore fiziksel blob'u atomik yayinlar; bu satir onu job'a
      // baglayan durable ownership kaydidir. READY artifact olmadan task
      // complete edilemez.
      if (!existing) {
        this.options.db.prepare(
          `INSERT INTO artifacts (
             id, job_id, kind, relative_store_path, sha256, bytes, schema_version,
             sensitivity, status, pin_reason, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?)`,
        ).run(
          published.id,
          this.options.jobId,
          published.kind,
          published.relativeStorePath,
          published.sha256,
          published.bytes,
          published.schemaVersion ?? "1",
          published.sensitivity,
          `agent_task_output:${input.contract.task_id}`,
          Date.now(),
        );
      }
      return {
        kind: "COMPLETED",
        summary: `Candidate changeset artifact hazir: ${changeset.changes.length} degisiklik`,
        findings_count: 0,
        blocking_findings_count: 0,
        artifact_refs: [ref],
        changed_paths: changeset.changes.map((change) => change.path),
        run_refs: [],
        next_action: "candidate_loop_apply",
        usage: response.result.usage,
      };
    } catch (error) {
      if (error instanceof WorkerRequestFailure) {
        const mapped = mapFailure(error);
        return error.result?.usage ? { ...mapped, usage: error.result.usage } : mapped;
      }
      return emptyOutcome("PROVIDER_ERROR", `candidate bridge error: ${String(error).slice(0, 256)}`);
    } finally {
      input.signal.removeEventListener("abort", abort);
    }
  }

  async cancelSession(sessionId: string): Promise<void> {
    await this.client.abortSession(sessionId);
  }
}

export function candidateArtifactDigest(changeset: CandidateChangeSet): string {
  return createHash("sha256").update(JSON.stringify(changeset), "utf8").digest("hex");
}
