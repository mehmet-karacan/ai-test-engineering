/**
 * S04 durable AgentTask deposu.
 *
 * Model cagrisi bu sinifin transaction'i icinde yapilmaz: claim/attempt/result
 * kayitlari kisa SQLite islemleridir ve worker sonucu lease + fence + revision
 * ile kabul edilir. Eski worker donerse stale sonuc yazilamaz.
 */
import { createHash, randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";
import {
  AgentTaskContractSchema,
  AgentTaskResultSchema,
  ArtifactRefSchema,
  assertAgentTaskResultMatchesContract,
  type AgentTaskContract,
  type AgentTaskResult,
  type ArtifactRef,
} from "../domain/agent-contracts.js";

type TaskState = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "INTERRUPTED" | "BLOCKED" | "WAITING_APPROVAL";
type AttemptStatus = "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "INTERRUPTED" | "BLOCKED" | "WAITING_APPROVAL";

interface AgentTaskDbRow {
  task_id: string;
  job_id: string;
  project_id: string;
  location_id: string;
  role: AgentTaskContract["role"];
  parent_task_id: string | null;
  dependency_task_ids_json: string;
  input_artifact_refs_json: string;
  contract_json: string;
  contract_digest: string;
  state: TaskState;
  idempotency_key: string;
  job_revision: number;
  revision: number;
  lease_owner_id: string | null;
  lease_fence_token: number;
  lease_expires_at: number | null;
  accepted_output_artifact_id: string | null;
  source_digest: string;
  created_at: number;
  updated_at: number;
  row_version: number;
}
export interface AgentTaskRow extends Omit<AgentTaskDbRow, "contract_json"> {
  contract: AgentTaskContract;
}

export interface AgentTaskClaim {
  task: AgentTaskRow;
  owner_id: string;
  fence_token: number;
  expires_at: number;
  revision: number;
  attempt_ordinal: number;
}

export interface RecordAgentAttemptInput {
  task_id: string;
  attempt_id?: string;
  owner_id: string;
  fence_token: number;
  attempt_ordinal: number;
  provider_id: string;
  model_id: string;
  model_revision: number;
  input_digest?: string | null;
  output_digest?: string | null;
  input_artifact_refs?: ArtifactRef[];
  output_artifact_refs?: ArtifactRef[];
  session_id?: string | null;
  message_id?: string | null;
  status?: AttemptStatus;
  error_class?: string | null;
  started_at?: number;
}

export interface AgentAttemptRow {
  attempt_id: string;
  task_id: string;
  job_id: string;
  attempt_ordinal: number;
  owner_id: string;
  fence_token: number;
  provider_id: string;
  model_id: string;
  model_revision: number;
  status: AttemptStatus;
  input_digest: string | null;
  output_digest: string | null;
  input_artifact_refs_json: string;
  output_artifact_refs_json: string;
  session_id: string | null;
  message_id: string | null;
  error_class: string | null;
  started_at: number;
  finished_at: number | null;
  row_version: number;
}

export interface CompleteAgentTaskInput {
  task_id: string;
  owner_id: string;
  fence_token: number;
  expected_revision: number;
  result: AgentTaskResult;
  finished_at?: number;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function parseContract(row: AgentTaskDbRow): AgentTaskContract {
  try {
    return AgentTaskContractSchema.parse(JSON.parse(row.contract_json) as unknown);
  } catch {
    throw new AppError("STORAGE_ERROR", `AgentTask kontrati bozuk: ${row.task_id}`, { reason_code: "AGENT_TASK_CONTRACT_CORRUPT" });
  }
}
function toTaskRow(row: AgentTaskDbRow): AgentTaskRow {
  const { contract_json: _contractJson, ...rest } = row;
  return { ...rest, contract: parseContract(row) };
}

function leaseError(reasonCode: "AGENT_TASK_LEASE_HELD" | "STALE_FENCE" | "LEASE_EXPIRED", message: string): AppError {
  return new AppError(reasonCode === "AGENT_TASK_LEASE_HELD" ? "BLOCKED_ISOLATION" : "POLICY_VIOLATION", message, { reason_code: reasonCode });
}

export class AgentTaskRepository {
  private readonly db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  createTask(contractInput: AgentTaskContract): AgentTaskRow {
    const contract = AgentTaskContractSchema.parse(contractInput);
    const contractJson = stableJson(contract);
    const contractDigest = digest(contract);
    const now = Date.now();
    const tx = this.db.transaction((): AgentTaskRow => {
      const location = this.db.prepare<[string], { project_id: string }>("SELECT project_id FROM project_locations WHERE id = ?").get(contract.location_id);
      if (!location || location.project_id !== contract.project_id) {
        throw new AppError("POLICY_VIOLATION", "AgentTask project/location kimligi uyusmuyor", { reason_code: "AGENT_TASK_PROJECT_LOCATION_MISMATCH" });
      }
      const job = this.db.prepare<[string], { location_id: string }>("SELECT location_id FROM test_jobs WHERE id = ?").get(contract.job_id);
      if (!job || job.location_id !== contract.location_id) {
        throw new AppError("POLICY_VIOLATION", "AgentTask job/location kimligi uyusmuyor", { reason_code: "AGENT_TASK_JOB_LOCATION_MISMATCH" });
      }
      if (contract.parent_task_id !== null) {
        const parent = this.db.prepare<[string], { job_id: string; project_id: string; location_id: string }>(
          "SELECT job_id, project_id, location_id FROM agent_tasks WHERE task_id = ?",
        ).get(contract.parent_task_id);
        if (!parent || parent.job_id !== contract.job_id || parent.project_id !== contract.project_id || parent.location_id !== contract.location_id) {
          throw new AppError("POLICY_VIOLATION", "AgentTask parent baska veya bilinmeyen job'a ait", {
            reason_code: "AGENT_TASK_PARENT_INVALID",
            parent_task_id: contract.parent_task_id,
          });
        }
      }
      for (const dependencyTaskId of contract.dependency_task_ids) {
        const dependency = this.db.prepare<[string], { job_id: string; project_id: string; location_id: string }>(
          "SELECT job_id, project_id, location_id FROM agent_tasks WHERE task_id = ?",
        ).get(dependencyTaskId);
        if (!dependency || dependency.job_id !== contract.job_id || dependency.project_id !== contract.project_id || dependency.location_id !== contract.location_id) {
          throw new AppError("POLICY_VIOLATION", "AgentTask dependency baska veya bilinmeyen job'a ait", {
            reason_code: "AGENT_TASK_DEPENDENCY_INVALID",
            dependency_task_id: dependencyTaskId,
          });
        }
      }
      for (const ref of contract.input_artifact_refs) {
        const artifact = this.db.prepare<[string], { job_id: string | null; sha256: string; bytes: number; status: string }>("SELECT job_id, sha256, bytes, status FROM artifacts WHERE id = ?").get(ref.artifact_id);
        if (!artifact) {
          throw new AppError("STORAGE_ERROR", "AgentTask input artifact kaydi yok", { reason_code: "AGENT_TASK_ARTIFACT_MISSING", artifact_id: ref.artifact_id });
        }
        if (artifact.job_id !== contract.job_id) {
          throw new AppError("POLICY_VIOLATION", "AgentTask input artifact baska job'a ait", { reason_code: "AGENT_TASK_FOREIGN_ARTIFACT" });
        }
        if (artifact.sha256 !== ref.sha256 || artifact.bytes !== ref.bytes || artifact.status !== "READY") {
          throw new AppError("POLICY_VIOLATION", "AgentTask input artifact hash/ready kimligi uyusmuyor", { reason_code: "AGENT_TASK_ARTIFACT_UNTRUSTED", artifact_id: ref.artifact_id });
        }
      }
      this.db
        .prepare(
          `INSERT INTO agent_tasks (
             task_id, job_id, project_id, location_id, role, parent_task_id,
             dependency_task_ids_json, input_artifact_refs_json, contract_json,
             contract_digest, state, idempotency_key, job_revision, revision,
             lease_owner_id, lease_fence_token, lease_expires_at,
             accepted_output_artifact_id, source_digest, created_at, updated_at, row_version
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, 0, NULL, 0, NULL, NULL, ?, ?, ?, 0)
           ON CONFLICT(job_id, idempotency_key) DO NOTHING`,
        )
        .run(
          contract.task_id,
          contract.job_id,
          contract.project_id,
          contract.location_id,
          contract.role,
          contract.parent_task_id,
          stableJson(contract.dependency_task_ids),
          stableJson(contract.input_artifact_refs),
          contractJson,
          contractDigest,
          contract.idempotency_key,
          contract.job_revision,
          contract.source_digest,
          now,
          now,
        );

      const row = this.rawTaskById(contract.task_id) ?? this.db
        .prepare<[string, string], AgentTaskDbRow>("SELECT * FROM agent_tasks WHERE job_id = ? AND idempotency_key = ?")
        .get(contract.job_id, contract.idempotency_key);
      if (!row) {
        throw new AppError("STORAGE_ERROR", "AgentTask eklenemedi", { reason_code: "AGENT_TASK_INSERT_FAILED" });
      }
      if (row.contract_digest !== contractDigest) {
        throw new AppError("STORAGE_ERROR", "Ayni idempotency anahtari farkli AgentTask kontrati tasiyor", {
          reason_code: "AGENT_TASK_IDEMPOTENCY_CONFLICT",
          task_id: row.task_id,
        });
      }
      return toTaskRow(row);
    });
    return tx();
  }

  getTask(taskId: string): AgentTaskRow {
    const row = this.rawTaskById(taskId);
    if (!row) {
      throw new AppError("INVALID_PARAMETERS", `AgentTask bulunamadi: ${taskId}`);
    }
    return toTaskRow(row);
  }

  listTasks(jobId: string): AgentTaskRow[] {
    return this.db
      .prepare<[string], AgentTaskDbRow>("SELECT * FROM agent_tasks WHERE job_id = ? ORDER BY created_at, task_id")
      .all(jobId)
      .map(toTaskRow);
  }

  claimTask(taskId: string, ownerId: string, ttlMs = 300000, now = Date.now()): AgentTaskClaim {
    if (!ownerId.trim() || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new AppError("INVALID_PARAMETERS", "AgentTask claim parametreleri gecersiz");
    }
    const tx = this.db.transaction((): AgentTaskClaim => {
      const row = this.rawTaskById(taskId);
      if (!row) {
        throw new AppError("INVALID_PARAMETERS", `AgentTask bulunamadi: ${taskId}`);
      }
      const activeLease = row.lease_owner_id !== null && row.lease_expires_at !== null && row.lease_expires_at > now;
      if (activeLease && row.lease_owner_id !== ownerId) {
        throw leaseError("AGENT_TASK_LEASE_HELD", "AgentTask aktif baska owner tarafindan tutuluyor");
      }
      if (row.state === "RUNNING" && activeLease && row.lease_owner_id === ownerId) {
        return {
          task: toTaskRow(row),
          owner_id: ownerId,
          fence_token: row.lease_fence_token,
          expires_at: row.lease_expires_at as number,
          revision: row.revision,
          attempt_ordinal: this.nextAttemptOrdinal(taskId),
        };
      }
      if (!(row.state === "QUEUED" || row.state === "INTERRUPTED" || row.state === "RUNNING")) {
        throw new AppError("STORAGE_ERROR", `AgentTask claim icin uygun durumda degil: ${row.state}`, { reason_code: "AGENT_TASK_STATE_CONFLICT" });
      }

      const nextFence = row.lease_fence_token + 1;
      const expiresAt = now + ttlMs;
      const updated = this.db
        .prepare(
          `UPDATE agent_tasks
           SET state = 'RUNNING', lease_owner_id = ?, lease_fence_token = ?, lease_expires_at = ?,
               revision = revision + 1, updated_at = ?, row_version = row_version + 1
           WHERE task_id = ? AND row_version = ?`,
        )
        .run(ownerId, nextFence, expiresAt, now, taskId, row.row_version);
      if (updated.changes !== 1) {
        throw new AppError("STORAGE_ERROR", "AgentTask claim row_version cakismasi", { reason_code: "AGENT_TASK_ROW_VERSION_CONFLICT" });
      }
      const claimed = this.rawTaskById(taskId);
      if (!claimed) {
        throw new AppError("STORAGE_ERROR", "Claim sonrasi AgentTask okunamadi", { reason_code: "AGENT_TASK_CLAIM_READ_FAILED" });
      }
      return {
        task: toTaskRow(claimed),
        owner_id: ownerId,
        fence_token: nextFence,
        expires_at: expiresAt,
        revision: claimed.revision,
        attempt_ordinal: this.nextAttemptOrdinal(taskId),
      };
    });
    return tx();
  }

  recordAttempt(input: RecordAgentAttemptInput): AgentAttemptRow {
    const refsIn = (input.input_artifact_refs ?? []).map((ref) => ArtifactRefSchema.parse(ref));
    const refsOut = (input.output_artifact_refs ?? []).map((ref) => ArtifactRefSchema.parse(ref));
    const attemptId = input.attempt_id ?? randomUUID();
    const startedAt = input.started_at ?? Date.now();
    const status = input.status ?? "RUNNING";
    const tx = this.db.transaction((): AgentAttemptRow => {
      const task = this.rawTaskById(input.task_id);
      if (!task) throw new AppError("INVALID_PARAMETERS", `AgentTask bulunamadi: ${input.task_id}`);
      this.assertTaskLease(task, input.owner_id, input.fence_token, Date.now());
      const existing = this.db.prepare<[string], AgentAttemptRow>("SELECT * FROM agent_attempts WHERE attempt_id = ?").get(attemptId);
      if (existing) {
        if (existing.task_id !== input.task_id || existing.owner_id !== input.owner_id || existing.fence_token !== input.fence_token) {
          throw leaseError("STALE_FENCE", "Attempt fence task lease ile eslesmiyor");
        }
        return existing;
      }
      const ordinalConflict = this.db
        .prepare<[string, number], { attempt_id: string }>("SELECT attempt_id FROM agent_attempts WHERE task_id = ? AND attempt_ordinal = ?")
        .get(input.task_id, input.attempt_ordinal);
      if (ordinalConflict) {
        throw new AppError("STORAGE_ERROR", "AgentTask attempt ordinal cakismasi", { reason_code: "AGENT_ATTEMPT_ORDINAL_CONFLICT" });
      }
      const contract = parseContract(task);
      if (!Number.isSafeInteger(input.attempt_ordinal) || input.attempt_ordinal < 1 || input.attempt_ordinal > contract.budget.max_attempts || input.attempt_ordinal > contract.budget.remaining_attempts) {
        throw new AppError("POLICY_VIOLATION", "AgentTask attempt butcesi asildi", {
          reason_code: "AGENT_ATTEMPT_BUDGET_EXCEEDED",
          task_id: input.task_id,
          attempt_ordinal: input.attempt_ordinal,
          max_attempts: contract.budget.max_attempts,
          remaining_attempts: contract.budget.remaining_attempts,
        });
      }
      const previous = this.db
        .prepare<[string], { model_id: string; model_revision: number; started_at: number }>(
          "SELECT model_id, model_revision, started_at FROM agent_attempts WHERE task_id = ? ORDER BY attempt_ordinal DESC LIMIT 1",
        )
        .get(input.task_id);
      if (previous && (previous.model_id !== input.model_id || previous.model_revision !== input.model_revision)) {
        const approved = this.db
          .prepare<[string, number, string, string, string], { approval_id: string }>(
            `SELECT approval_id FROM job_approvals
             WHERE job_id = ? AND approval_kind = 'MODEL_CHANGE' AND decision = 'APPROVED' AND created_at >= ?
               AND scope_digest = ? AND model_digest = ? AND budget_digest = ?
             ORDER BY created_at DESC, approval_id DESC LIMIT 1`,
          )
          .get(task.job_id, previous.started_at, digest(contract.allowed_context_scope), digest({ provider_id: input.provider_id, model_id: input.model_id, revision: input.model_revision }), digest(contract.budget));
        if (!approved) {
          throw new AppError("POLICY_VIOLATION", "AgentTask model degisikligi acik onay olmadan baslatilamaz", {
            reason_code: "MODEL_CHANGE_APPROVAL_REQUIRED",
            task_id: input.task_id,
            previous_model_id: previous.model_id,
            previous_model_revision: previous.model_revision,
            requested_model_id: input.model_id,
            requested_model_revision: input.model_revision,
          });
        }
      }
      this.db
        .prepare(
          `INSERT INTO agent_attempts (
             attempt_id, task_id, job_id, attempt_ordinal, owner_id, fence_token,
             provider_id, model_id, model_revision, status, input_digest, output_digest,
             input_artifact_refs_json, output_artifact_refs_json, session_id, message_id,
             error_class, started_at, finished_at, row_version
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
        )
        .run(
          attemptId,
          input.task_id,
          task.job_id,
          input.attempt_ordinal,
          input.owner_id,
          input.fence_token,
          input.provider_id,
          input.model_id,
          input.model_revision,
          status,
          input.input_digest ?? null,
          input.output_digest ?? null,
          stableJson(refsIn),
          stableJson(refsOut),
          input.session_id ?? null,
          input.message_id ?? null,
          input.error_class ?? null,
          startedAt,
        );
      const created = this.db.prepare<[string], AgentAttemptRow>("SELECT * FROM agent_attempts WHERE attempt_id = ?").get(attemptId);
      if (!created) throw new AppError("STORAGE_ERROR", "AgentAttempt kaydi okunamadi", { reason_code: "AGENT_ATTEMPT_INSERT_FAILED" });
      return created;
    });
    return tx();
  }

  /**
   * S04/WN40: restart/resume girisinde suresi dolmus calisan task'lari
   * deterministik olarak INTERRUPTED'a alir. Varsayilan gecerli task'a
   * dokunmaz. Job lease'ini devralmis resume, onceki candidate task'larini
   * da kapatir; yeni fiziksel aday ayri task/fence/butce kaydi kullanir.
   */
  recoverExpiredTasks(jobId: string, now = Date.now(), options: { interruptCandidates?: boolean } = {}): AgentTaskRow[] {
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new AppError("INVALID_PARAMETERS", "Recovery zamani gecersiz");
    }
    const tx = this.db.transaction((): AgentTaskRow[] => {
      const rows = this.db
        .prepare<[string, number, number], AgentTaskDbRow>(
          `SELECT * FROM agent_tasks
           WHERE job_id = ? AND state = 'RUNNING' AND lease_expires_at IS NOT NULL AND (lease_expires_at <= ?
             OR (? = 1 AND json_extract(contract_json, '$.expected_output_schema') = 'candidate-change-set-v1'))
           ORDER BY created_at, task_id`,
        )
        .all(jobId, now, options.interruptCandidates ? 1 : 0);
      for (const row of rows) {
        const updated = this.db
          .prepare(
            `UPDATE agent_tasks
             SET state = 'INTERRUPTED', lease_owner_id = NULL, lease_expires_at = NULL,
                 revision = revision + 1, updated_at = ?, row_version = row_version + 1
             WHERE task_id = ? AND state = 'RUNNING' AND row_version = ?
               AND lease_expires_at IS NOT NULL AND (lease_expires_at <= ?
                 OR (? = 1 AND json_extract(contract_json, '$.expected_output_schema') = 'candidate-change-set-v1'))`,
          )
          .run(now, row.task_id, row.row_version, now, options.interruptCandidates ? 1 : 0);
        if (updated.changes !== 1) {
          throw new AppError("POLICY_VIOLATION", "Expired AgentTask recovery CAS basarisiz", { reason_code: "AGENT_TASK_RECOVERY_CAS_CONFLICT" });
        }
        this.db.prepare(`UPDATE agent_attempts SET status = 'INTERRUPTED', finished_at = ?, row_version = row_version + 1
          WHERE task_id = ? AND owner_id = ? AND fence_token = ? AND status = 'RUNNING'`)
          .run(now, row.task_id, row.lease_owner_id, row.lease_fence_token);
      }
      return rows.map((row) => toTaskRow(this.rawTaskById(row.task_id) as AgentTaskDbRow));
    });
    return tx();
  }

  completeTask(input: CompleteAgentTaskInput): AgentTaskRow {
    const parsedResult = AgentTaskResultSchema.parse(input.result);
    const finishedAt = input.finished_at ?? Date.now();
    const tx = this.db.transaction((): AgentTaskRow => {
      const task = this.rawTaskById(input.task_id);
      if (!task) throw new AppError("INVALID_PARAMETERS", `AgentTask bulunamadi: ${input.task_id}`);
      this.assertTaskLease(task, input.owner_id, input.fence_token, finishedAt);
      if (task.state !== "RUNNING" || task.revision !== input.expected_revision) {
        throw new AppError("POLICY_VIOLATION", "AgentTask sonucu stale revision ile geldi", { reason_code: "AGENT_TASK_REVISION_CONFLICT" });
      }
      try {
        assertAgentTaskResultMatchesContract(parseContract(task), parsedResult);
      } catch (error) {
        throw new AppError("INVALID_MODEL_OUTPUT", error instanceof Error ? error.message : "AgentTask sonucu kontratla eslesmiyor", { reason_code: "AGENT_TASK_RESULT_FENCE" });
      }
      const attempt = this.db
        .prepare<[string], AgentAttemptRow>("SELECT * FROM agent_attempts WHERE attempt_id = ?")
        .get(parsedResult.attempt_id);
      if (!attempt || attempt.task_id !== input.task_id || attempt.owner_id !== input.owner_id || attempt.fence_token !== input.fence_token) {
        throw leaseError("STALE_FENCE", "AgentTask sonucu bilinmeyen veya stale attempt tasiyor");
      }
      const acceptedArtifactId = parsedResult.artifact_refs.find((ref) => {
        const artifact = this.db.prepare<[string], { id: string; job_id: string | null; sha256: string; bytes: number; status: string }>(
          "SELECT id, job_id, sha256, bytes, status FROM artifacts WHERE id = ?",
        ).get(ref.artifact_id);
        if (!artifact) {
          throw new AppError("STORAGE_ERROR", "AgentTask output artifact kaydi yok", { reason_code: "AGENT_TASK_ARTIFACT_MISSING", artifact_id: ref.artifact_id });
        }
        if (artifact.job_id !== parsedResult.job_id) {
          throw new AppError("POLICY_VIOLATION", "AgentTask output artifact baska job'a ait", { reason_code: "AGENT_TASK_FOREIGN_ARTIFACT" });
        }
        if (artifact.sha256 !== ref.sha256 || artifact.bytes !== ref.bytes || artifact.status !== "READY") {
          throw new AppError("POLICY_VIOLATION", "AgentTask output artifact hash/ready kimligi uyusmuyor", { reason_code: "AGENT_TASK_ARTIFACT_UNTRUSTED", artifact_id: ref.artifact_id });
        }
        return true;
      })?.artifact_id ?? null;
      const attemptUpdate = this.db
        .prepare(
          `UPDATE agent_attempts
           SET status = ?, output_digest = ?, output_artifact_refs_json = ?, finished_at = ?, row_version = row_version + 1
           WHERE attempt_id = ? AND row_version = ? AND owner_id = ? AND fence_token = ?`,
        )
        .run(
          parsedResult.status,
          parsedResult.artifact_refs[0]?.sha256 ?? null,
          stableJson(parsedResult.artifact_refs),
          finishedAt,
          parsedResult.attempt_id,
          attempt.row_version,
          input.owner_id,
          input.fence_token,
        );
      if (attemptUpdate.changes !== 1) {
        throw leaseError("STALE_FENCE", "AgentAttempt fence guncellemesi reddedildi");
      }
      const taskUpdate = this.db
        .prepare(
          `UPDATE agent_tasks
           SET state = ?, accepted_output_artifact_id = ?, lease_owner_id = NULL, lease_expires_at = NULL,
               revision = revision + 1, updated_at = ?, row_version = row_version + 1
           WHERE task_id = ? AND state = 'RUNNING' AND revision = ? AND row_version = ?
             AND lease_owner_id = ? AND lease_fence_token = ?`,
        )
        .run(
          parsedResult.status,
          acceptedArtifactId,
          finishedAt,
          input.task_id,
          input.expected_revision,
          task.row_version,
          input.owner_id,
          input.fence_token,
        );
      if (taskUpdate.changes !== 1) {
        throw new AppError("POLICY_VIOLATION", "AgentTask fence/revision CAS basarisiz", { reason_code: "AGENT_TASK_CAS_CONFLICT" });
      }
      const completed = this.rawTaskById(input.task_id);
      if (!completed) throw new AppError("STORAGE_ERROR", "Tamamlanan AgentTask okunamadi", { reason_code: "AGENT_TASK_COMPLETE_READ_FAILED" });
      return toTaskRow(completed);
    });
    return tx();
  }

  private rawTaskById(taskId: string): AgentTaskDbRow | undefined {
    return this.db.prepare<[string], AgentTaskDbRow>("SELECT * FROM agent_tasks WHERE task_id = ?").get(taskId);
  }

  private nextAttemptOrdinal(taskId: string): number {
    const row = this.db.prepare<[string], { max_ordinal: number | null }>("SELECT MAX(attempt_ordinal) AS max_ordinal FROM agent_attempts WHERE task_id = ?").get(taskId);
    return (row?.max_ordinal ?? 0) + 1;
  }

  private assertTaskLease(task: AgentTaskDbRow, ownerId: string, fenceToken: number, now: number): void {
    if (task.lease_owner_id !== ownerId || task.lease_fence_token !== fenceToken) {
      throw leaseError("STALE_FENCE", "AgentTask lease fence eslesmiyor");
    }
    if (task.lease_expires_at === null || task.lease_expires_at <= now) {
      throw leaseError("LEASE_EXPIRED", "AgentTask lease suresi doldu");
    }
  }
}
