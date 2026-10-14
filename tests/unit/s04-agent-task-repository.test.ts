import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { Storage } from "../../src/storage/storage.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { AgentTaskRepository } from "../../src/storage/agent-task-repository.js";
import type { AgentTaskContract } from "../../src/domain/agent-contracts.js";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}
function digest(value: unknown): string { return createHash("sha256").update(stableJson(value), "utf8").digest("hex"); }

describe("S04 durable AgentTask claim/attempt/complete", () => {
  let dir: string;
  let storage: Storage;
  let tasks: AgentTaskRepository;
  let contract: AgentTaskContract;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-s04-task-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    const projects = new ProjectRepository(storage.db);
    const { project, location } = projects.ensureLocation("C:/work/s04-task", "s04-task", null);
    const job = new JobRepository(storage.db).createJob({ locationId: location.id, requestDigest: randomUUID() });
    const sourceSnapshotId = randomUUID();
    contract = {
      schema_version: 1,
      task_id: randomUUID(),
      job_id: job.id,
      project_id: project.id,
      location_id: location.id,
      job_revision: 0,
      source_snapshot_id: sourceSnapshotId,
      source_digest: "a".repeat(64),
      role: "test_developer",
      parent_task_id: null,
      dependency_task_ids: [],
      input_artifact_refs: [],
      allowed_context_scope: {
        snapshot_id: sourceSnapshotId,
        root_digest: "b".repeat(64),
        relative_paths: ["src/main"],
        line_ranges: [],
        max_bytes: 4096,
        secrets_excluded: true,
      },
      expected_output_schema: "agent-task-result-v1",
      budget: { max_attempts: 3, remaining_attempts: 3, max_minutes: 15, remaining_minutes: 15, max_output_bytes: 4096 },
      model_binding: { provider_id: "opencode", model_id: "glm-4.7", revision: 1 },
      idempotency_key: `s04-${randomUUID()}`,
    };
    tasks = new AgentTaskRepository(storage.db);
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("ayni idempotency anahtari ayni kontrati doner; farkli kontrat typed conflict verir", () => {
    const first = tasks.createTask(contract);
    const same = tasks.createTask(contract);
    expect(same.task_id).toBe(first.task_id);
    expect(() => tasks.createTask({ ...contract, task_id: randomUUID(), source_digest: "c".repeat(64) })).toThrow(/idempotency/i);
  });

  it("job/location/project capraz kimligi trusted task olarak yazilmaz", () => {
    expect(() => tasks.createTask({ ...contract, task_id: randomUUID(), project_id: randomUUID(), idempotency_key: `foreign-${randomUUID()}` })).toThrow(/project\/location/i);
  });

  it("parent ve dependency kimlikleri ayni job/location icinde mevcut olmadan task yazilmaz", () => {
    expect(() => tasks.createTask({
      ...contract,
      task_id: randomUUID(),
      idempotency_key: `missing-parent-${randomUUID()}`,
      parent_task_id: randomUUID(),
    })).toThrow(/parent.*bilinmeyen|parent.*baska/i);
    expect(() => tasks.createTask({
      ...contract,
      task_id: randomUUID(),
      idempotency_key: `missing-dependency-${randomUUID()}`,
      dependency_task_ids: [randomUUID()],
    })).toThrow(/dependency.*bilinmeyen|dependency.*baska/i);

    const parent = tasks.createTask({ ...contract, idempotency_key: `parent-${randomUUID()}` });
    const child = tasks.createTask({
      ...contract,
      task_id: randomUUID(),
      idempotency_key: `child-${randomUUID()}`,
      parent_task_id: parent.task_id,
      dependency_task_ids: [parent.task_id],
    });
    expect(child.parent_task_id).toBe(parent.task_id);
    expect(child.contract.dependency_task_ids).toEqual([parent.task_id]);
  });

  it("iki owner yarisi lease ile ayrisir ve basarili sonuc tek CAS ile kapanir", () => {
    const created = tasks.createTask(contract);
    const claim = tasks.claimTask(created.task_id, "owner-a");
    expect(claim.fence_token).toBe(1);
    expect(() => tasks.claimTask(created.task_id, "owner-b")).toThrow(/aktif baska owner/i);

    const attempt = tasks.recordAttempt({
      task_id: created.task_id,
      owner_id: "owner-a",
      fence_token: claim.fence_token,
      attempt_ordinal: claim.attempt_ordinal,
      provider_id: contract.model_binding.provider_id,
      model_id: contract.model_binding.model_id,
      model_revision: contract.model_binding.revision,
    });
    const completed = tasks.completeTask({
      task_id: created.task_id,
      owner_id: "owner-a",
      fence_token: claim.fence_token,
      expected_revision: claim.revision,
      result: {
        schema_version: 1,
        task_id: created.task_id,
        job_id: contract.job_id,
        job_revision: contract.job_revision,
        attempt_id: attempt.attempt_id,
        status: "COMPLETED",
        summary: "ok",
        findings_count: 0,
        blocking_findings_count: 0,
        artifact_refs: [],
        changed_paths: [],
        run_refs: [],
        next_action: "continue",
      },
    });
    expect(completed.state).toBe("COMPLETED");
    expect(completed.lease_owner_id).toBeNull();
  });

  it("expired claim sonrasi eski owner attempt yazamaz", () => {
    const created = tasks.createTask(contract);
    const first = tasks.claimTask(created.task_id, "owner-a", 1000, 1000);
    const takeover = tasks.claimTask(created.task_id, "owner-b", 300000, 2001);
    expect(takeover.fence_token).toBe(first.fence_token + 1);
    expect(() => tasks.recordAttempt({
      task_id: created.task_id,
      owner_id: "owner-a",
      fence_token: first.fence_token,
      attempt_ordinal: first.attempt_ordinal,
      provider_id: "opencode",
      model_id: "glm-4.7",
      model_revision: 1,
    })).toThrow(/stale|eslesmiyor/i);
  });

  it("model degisikligi acik MODEL_CHANGE onayi olmadan baslatilmaz", () => {
    const created = tasks.createTask(contract);
    const now = Date.now();
    const first = tasks.claimTask(created.task_id, "owner-a", 300000, now);
    tasks.recordAttempt({
      task_id: created.task_id,
      owner_id: "owner-a",
      fence_token: first.fence_token,
      attempt_ordinal: 1,
      provider_id: "opencode",
      model_id: "glm-4.7",
      model_revision: 1,
      started_at: now,
    });
    expect(() => tasks.recordAttempt({
      task_id: created.task_id,
      owner_id: "owner-a",
      fence_token: first.fence_token,
      attempt_ordinal: 2,
      provider_id: "opencode",
      model_id: "qwen-3.8",
      model_revision: 2,
      started_at: now + 100,
    })).toThrow(/onay/i);
    const jobs = new JobRepository(storage.db);
    jobs.recordApproval({
      job_id: contract.job_id,
      project_id: contract.project_id,
      approval_kind: "MODEL_CHANGE",
      scope_digest: digest(contract.allowed_context_scope),
      model_digest: digest({ provider_id: "opencode", model_id: "qwen-3.8", revision: 2 }),
      budget_digest: digest(contract.budget),
      decision: "APPROVED",
      decided_by: "mehmet-karacan",
      created_at: now + 200,
    });
    expect(tasks.recordAttempt({
      task_id: created.task_id,
      owner_id: "owner-a",
      fence_token: first.fence_token,
      attempt_ordinal: 2,
      provider_id: "opencode",
      model_id: "qwen-3.8",
      model_revision: 2,
      started_at: now + 300,
    }).model_id).toBe("qwen-3.8");
  });

  it("lease suresi dolan RUNNING task recovery'de INTERRUPTED olur", () => {
    const created = tasks.createTask(contract);
    tasks.claimTask(created.task_id, "owner-a", 1000, 1000);
    const recovered = tasks.recoverExpiredTasks(contract.job_id, 2001);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.state).toBe("INTERRUPTED");
    expect(recovered[0]?.lease_owner_id).toBeNull();
    const takeover = tasks.claimTask(created.task_id, "owner-b", 300000, 2001);
    expect(takeover.attempt_ordinal).toBe(1);
    expect(takeover.fence_token).toBe(2);
  });

  it("attempt ordinal'i task butcesini asarsa durable kayit uretilmez", () => {
    const limited = { ...contract, task_id: randomUUID(), idempotency_key: `budget-${randomUUID()}`, budget: { ...contract.budget, max_attempts: 1, remaining_attempts: 1 } };
    const created = tasks.createTask(limited);
    const claim = tasks.claimTask(created.task_id, "owner-a");
    expect(() => tasks.recordAttempt({
      task_id: created.task_id,
      owner_id: "owner-a",
      fence_token: claim.fence_token,
      attempt_ordinal: 2,
      provider_id: "opencode",
      model_id: "glm-4.7",
      model_revision: 1,
    })).toThrow(/butcesi/i);
    expect(storage.db.prepare<[string], { count: number }>("SELECT COUNT(*) AS count FROM agent_attempts WHERE task_id = ?").get(created.task_id)?.count).toBe(0);
  });
});
