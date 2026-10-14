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

describe("WN40-WN42: durable task recovery", () => {
  let dir: string;
  let dbPath: string;
  let storage: Storage;
  let contract: AgentTaskContract;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-wn-agent-recovery-"));
    dbPath = join(dir, "state.db");
    storage = new Storage({ dbPath });
    storage.migrate();
    const projects = new ProjectRepository(storage.db);
    const { project, location } = projects.ensureLocation("C:/work/agent-recovery", "agent-recovery", null);
    const job = new JobRepository(storage.db).createJob({ locationId: location.id, requestDigest: randomUUID() });
    contract = {
      schema_version: 1, task_id: randomUUID(), job_id: job.id, project_id: project.id, location_id: location.id, job_revision: 4,
      source_snapshot_id: randomUUID(), source_digest: "1".repeat(64), role: "test_architect", parent_task_id: null,
      dependency_task_ids: [], input_artifact_refs: [], allowed_context_scope: { snapshot_id: randomUUID(), root_digest: "2".repeat(64), relative_paths: [], line_ranges: [], max_bytes: 2048, secrets_excluded: true },
      expected_output_schema: "agent-task-result-v1", budget: { max_attempts: 4, remaining_attempts: 3, max_minutes: 20, remaining_minutes: 17, max_output_bytes: 4096 },
      model_binding: { provider_id: "opencode", model_id: "gpt-5.6-luna", revision: 1 }, idempotency_key: `recovery-${randomUUID()}`,
    };
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("restart sonrasi ayni task'ta yeni attempt ve model revision korunur", () => {
    const firstRepo = new AgentTaskRepository(storage.db);
    const created = firstRepo.createTask(contract);
    const base = Date.now();
    const firstClaim = firstRepo.claimTask(created.task_id, "owner-a", 1000, base);
    const firstAttempt = firstRepo.recordAttempt({ task_id: created.task_id, owner_id: "owner-a", fence_token: firstClaim.fence_token, attempt_ordinal: 1, provider_id: "opencode", model_id: "gpt-5.6-luna", model_revision: 1 });
    storage.close();

    storage = new Storage({ dbPath });
    const recovered = new AgentTaskRepository(storage.db);
    expect(recovered.getTask(created.task_id).state).toBe("RUNNING");
    const takeover = recovered.claimTask(created.task_id, "owner-b", 300000, base + 2001);
    const secondAttempt = recovered.recordAttempt({ task_id: created.task_id, owner_id: "owner-b", fence_token: takeover.fence_token, attempt_ordinal: 2, provider_id: "opencode", model_id: "glm-4.7", model_revision: 2 });
    const attempts = storage.db.prepare<[string], { attempt_ordinal: number; model_id: string; model_revision: number }>("SELECT attempt_ordinal, model_id, model_revision FROM agent_attempts WHERE task_id = ? ORDER BY attempt_ordinal").all(created.task_id);
    expect(firstAttempt.attempt_id).not.toBe(secondAttempt.attempt_id);
    expect(attempts).toEqual([
      { attempt_ordinal: 1, model_id: "gpt-5.6-luna", model_revision: 1 },
      { attempt_ordinal: 2, model_id: "glm-4.7", model_revision: 2 },
    ]);
  });
});
