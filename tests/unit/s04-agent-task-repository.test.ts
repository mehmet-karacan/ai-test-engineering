import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Storage } from "../../src/storage/storage.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { AgentTaskRepository } from "../../src/storage/agent-task-repository.js";
import type { AgentTaskContract } from "../../src/domain/agent-contracts.js";

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
    contract = {
      schema_version: 1,
      task_id: randomUUID(),
      job_id: job.id,
      project_id: project.id,
      location_id: location.id,
      job_revision: 0,
      source_snapshot_id: randomUUID(),
      source_digest: "a".repeat(64),
      role: "test_developer",
      parent_task_id: null,
      dependency_task_ids: [],
      input_artifact_refs: [],
      allowed_context_scope: {
        snapshot_id: randomUUID(),
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
});
