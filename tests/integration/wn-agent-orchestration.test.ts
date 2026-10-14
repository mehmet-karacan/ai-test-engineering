import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Storage } from "../../src/storage/storage.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { AgentTaskRepository } from "../../src/storage/agent-task-repository.js";
import type { AgentTaskContract } from "../../src/domain/agent-contracts.js";
import {
  AgentScheduler,
  type AgentExecutionOutcome,
  type AgentSessionAdapter,
} from "../../src/orchestration/agent-scheduler.js";
import { FileSystemContextProvider } from "../../src/workers/opencode/context-provider.js";

function taskFixture(jobId: string, projectId: string, locationId: string, role: AgentTaskContract["role"], taskId = randomUUID()): AgentTaskContract {
  const sourceSnapshotId = randomUUID();
  return {
    schema_version: 1,
    task_id: taskId,
    job_id: jobId,
    project_id: projectId,
    location_id: locationId,
    job_revision: 0,
    source_snapshot_id: sourceSnapshotId,
    source_digest: "a".repeat(64),
    role,
    parent_task_id: null,
    dependency_task_ids: [],
    input_artifact_refs: [],
    allowed_context_scope: {
      snapshot_id: sourceSnapshotId,
      root_digest: "b".repeat(64),
      relative_paths: ["src/Payment.java"],
      line_ranges: [],
      max_bytes: 4096,
      secrets_excluded: true,
    },
    expected_output_schema: "agent-task-result-v1",
    budget: { max_attempts: 2, remaining_attempts: 2, max_minutes: 5, remaining_minutes: 5, max_output_bytes: 6144 },
    model_binding: { provider_id: "opencode", model_id: "glm-5.3-flash", revision: 4 },
    idempotency_key: `s05-${taskId}`,
  };
}

function successOutcome(task: AgentTaskContract): AgentExecutionOutcome {
  return {
    kind: "COMPLETED",
    summary: `completed ${task.role}`,
    findings_count: 0,
    blocking_findings_count: 0,
    artifact_refs: [],
    changed_paths: [],
    run_refs: [],
    next_action: "continue",
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

class FakeAdapter implements AgentSessionAdapter {
  readonly created: Array<{ task_id: string; parent_session_id: string; session_id: string; role: string; provider_id: string; model_id: string }> = [];
  readonly executed: Array<{ session_id: string; parent_session_id: string; role: string; provider_id: string; model_id: string }> = [];
  active = 0;
  maxActive = 0;
  cancelled = 0;
  outcomeFor: ((task: AgentTaskContract) => AgentExecutionOutcome) | null = null;

  async createSession(input: Parameters<AgentSessionAdapter["createSession"]>[0]) {
    const descriptor = {
      session_id: `ses_child_${input.task_id}`,
      parent_session_id: input.parent_session_id,
      role: input.role,
      model: input.model,
    };
    this.created.push({ task_id: input.task_id, parent_session_id: input.parent_session_id, session_id: descriptor.session_id, role: input.role, provider_id: input.model.provider_id, model_id: input.model.model_id });
    return descriptor;
  }

  async execute(input: Parameters<AgentSessionAdapter["execute"]>[0]) {
    this.executed.push({ session_id: input.session_id, parent_session_id: input.parent_session_id, role: input.role, provider_id: input.model.provider_id, model_id: input.model.model_id });
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.active -= 1;
    return this.outcomeFor?.(input.contract) ?? successOutcome(input.contract);
  }

  async cancelSession(): Promise<void> {
    this.cancelled += 1;
  }
}

describe("S05 agent scheduler foundation", () => {
  let dir: string;
  let storage: Storage;
  let tasks: AgentTaskRepository;
  let jobId: string;
  let projectId: string;
  let locationId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-s05-orchestration-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    const location = new ProjectRepository(storage.db).ensureLocation(join(dir, "project"), "s05-project", null);
    const job = new JobRepository(storage.db).createJob({ locationId: location.location.id, requestDigest: randomUUID() });
    tasks = new AgentTaskRepository(storage.db);
    jobId = job.id;
    projectId = location.project.id;
    locationId = location.location.id;
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("iki eszamanli gorev sinirini korur ve role/model ile parent-child session bagini tasir", async () => {
    const contracts = ["explorer", "test_architect", "test_developer", "reviewer"].map((role) => taskFixture(jobId, projectId, locationId, role as AgentTaskContract["role"]));
    for (const contract of contracts) tasks.createTask(contract);
    const adapter = new FakeAdapter();
    const provider = { provide: async (contract: AgentTaskContract) => ({
      task_id: contract.task_id, job_id: contract.job_id, source_snapshot_id: contract.source_snapshot_id, root_digest: contract.allowed_context_scope.root_digest,
      role: contract.role, model: contract.model_binding, manifest_digest: "c".repeat(64), text: "scoped context",
      omitted: [], bytes: 15,
    }) };
    const scheduler = new AgentScheduler({ tasks, adapter, contextProvider: provider, maxConcurrency: 2, ownerId: "s05-test-owner" });

    const reports = await scheduler.run({ taskIds: contracts.map((contract) => contract.task_id), parentSessionId: "ses_parent_1" });

    expect(reports).toHaveLength(4);
    expect(reports.every((report) => report.status === "COMPLETED")).toBe(true);
    expect(adapter.maxActive).toBe(2);
    expect(adapter.created.every((session) => session.parent_session_id === "ses_parent_1")).toBe(true);
    expect(new Set(adapter.created.map((session) => session.session_id)).size).toBe(4);
    expect(adapter.created.every((session) => session.session_id !== session.parent_session_id)).toBe(true);
    expect(adapter.executed.map((execution) => execution.role)).toEqual(contracts.map((contract) => contract.role));
    expect(adapter.executed.every((execution) => execution.provider_id === "opencode" && execution.model_id === "glm-5.3-flash")).toBe(true);
  });

  it("empty final ve cancellation basariya donmez, typed outcome'i raporda korur", async () => {
    const empty = taskFixture(jobId, projectId, locationId, "explorer");
    const cancelled = taskFixture(jobId, projectId, locationId, "reviewer");
    tasks.createTask(empty);
    tasks.createTask(cancelled);
    const adapter = new FakeAdapter();
    adapter.outcomeFor = (contract) => contract.task_id === empty.task_id
      ? { kind: "EMPTY_FINAL", summary: "", findings_count: 0, blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "retry" }
      : { kind: "CANCELLED", summary: "cancelled", findings_count: 0, blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "resume" };
    const provider = { provide: async (contract: AgentTaskContract) => ({ task_id: contract.task_id, job_id: contract.job_id, source_snapshot_id: contract.source_snapshot_id, root_digest: contract.allowed_context_scope.root_digest, role: contract.role, model: contract.model_binding, manifest_digest: "c".repeat(64), text: "context", omitted: [], bytes: 7 }) };
    const scheduler = new AgentScheduler({ tasks, adapter, contextProvider: provider, maxConcurrency: 1, ownerId: "s05-test-owner" });

    const reports = await scheduler.run({ taskIds: [empty.task_id, cancelled.task_id], parentSessionId: "ses_parent_2" });

    expect(reports.map((report) => report.outcome_kind)).toEqual(["EMPTY_FINAL", "CANCELLED"]);
    expect(reports.map((report) => report.status)).toEqual(["FAILED", "CANCELLED"]);
    expect(reports.every((report) => report.status !== "COMPLETED")).toBe(true);
  });
});

describe("S05 scoped context provider", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-s05-context-"));
    writeFileSync(join(dir, "Payment.java"), "class Payment {\n  int amount() { return 1; }\n}\n", "utf8");
    writeFileSync(join(dir, "secret.env"), "TOKEN=do-not-read\n", "utf8");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("yalniz izinli dosyayi context'e alir ve secret path'i reddeder", async () => {
    const provider = new FileSystemContextProvider({ rootPath: dir, rootDigest: "b".repeat(64) });
    const base = taskFixture(randomUUID(), randomUUID(), randomUUID(), "explorer");
    const packageResult = await provider.provide({ ...base, allowed_context_scope: { ...base.allowed_context_scope, relative_paths: ["Payment.java"] } });
    expect(packageResult.text).toContain("class Payment");
    expect(packageResult.text).not.toContain("TOKEN");
    await expect(provider.provide({ ...base, allowed_context_scope: { ...base.allowed_context_scope, relative_paths: ["../secret.env"] } })).rejects.toThrow(/kok|secret|path/i);
  });

  it("snapshot disi line range ve baslik byte butcesini kabul etmez", async () => {
    const provider = new FileSystemContextProvider({ rootPath: dir, rootDigest: "b".repeat(64) });
    const base = taskFixture(randomUUID(), randomUUID(), randomUUID(), "explorer");
    await expect(provider.provide({ ...base, allowed_context_scope: { ...base.allowed_context_scope, line_ranges: [{ relative_path: "secret.env", start: 1, end: 1 }] } })).rejects.toThrow(/range|izinli/i);
    await expect(provider.provide({ ...base, allowed_context_scope: { ...base.allowed_context_scope, relative_paths: ["Payment.java"], max_bytes: 5 } })).rejects.toThrow(/byte/i);
  });
});
