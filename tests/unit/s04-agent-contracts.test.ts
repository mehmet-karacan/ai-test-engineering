import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AgentTaskContractSchema, AgentTaskResultSchema, InventoryScanResultSchema, assertAgentTaskResultMatchesContract } from "../../src/domain/agent-contracts.js";

function contractFixture() {
  const jobId = randomUUID();
  return {
    schema_version: 1 as const, task_id: randomUUID(), job_id: jobId, project_id: randomUUID(), location_id: randomUUID(),
    job_revision: 3, source_snapshot_id: randomUUID(), source_digest: "a".repeat(64), role: "reviewer" as const,
    parent_task_id: null, dependency_task_ids: [], input_artifact_refs: [],
    allowed_context_scope: { snapshot_id: randomUUID(), root_digest: "b".repeat(64), relative_paths: ["src/A.java"],
      line_ranges: [{ relative_path: "src/A.java", start: 1, end: 20 }], max_bytes: 4096, secrets_excluded: true as const },
    expected_output_schema: "agent-task-result-v1",
    budget: { max_attempts: 3, remaining_attempts: 2, max_minutes: 20, remaining_minutes: 20, max_output_bytes: 6144 },
    model_binding: { provider_id: "opencode", model_id: "gpt-5.6-luna", revision: 1 }, idempotency_key: "task-idempotency-1",
  };
}

describe("S04 agent runtime contract", () => {
  it("contract artifact ve context kimliklerini dogrular", () => {
    const contract = AgentTaskContractSchema.parse(contractFixture());
    expect(contract.role).toBe("reviewer");
    expect(contract.allowed_context_scope.secrets_excluded).toBe(true);
  });

  it("ayni task kendisini parent yapamaz ve baska job artifact'i alamaz", () => {
    const fixture = contractFixture();
    const bad = { ...fixture, parent_task_id: fixture.task_id, input_artifact_refs: [{ artifact_id: randomUUID(), job_id: randomUUID(), kind: "ctx", sha256: "a".repeat(64), bytes: 1, schema_version: "1" }] };
    expect(() => AgentTaskContractSchema.parse(bad)).toThrow();
  });

  it("result ozetini UTF-8 6 KiB ile sinirlar ve fence eslesmesini ister", () => {
    const contract = AgentTaskContractSchema.parse(contractFixture());
    const result = AgentTaskResultSchema.parse({ schema_version: 1, task_id: contract.task_id, job_id: contract.job_id,
      job_revision: contract.job_revision, attempt_id: randomUUID(), status: "COMPLETED", summary: "ok", findings_count: 1,
      blocking_findings_count: 0, artifact_refs: [], changed_paths: [], run_refs: [], next_action: "" });
    expect(() => assertAgentTaskResultMatchesContract(contract, result)).not.toThrow();
    expect(() => AgentTaskResultSchema.parse({ ...result, summary: "x".repeat(6145) })).toThrow();
    expect(() => assertAgentTaskResultMatchesContract(contract, { ...result, job_revision: 4 })).toThrow();
  });

  it("InventoryScanResult sayim, partial ve cursor sinirlarini korur", () => {
    const contract = AgentTaskContractSchema.parse(contractFixture());
    const result = InventoryScanResultSchema.parse({
      schema_version: 1, scan_id: randomUUID(), project_id: contract.project_id, location_id: contract.location_id,
      generation: 2, scanned_count: 4, error_count: 1, complete: false, partial: true,
      errors: [{ relative_path: "secret.env", code: "ACCESS_DENIED" }], metadata_artifact_ref: null, next_cursor: "cursor-1",
    });
    expect(result.next_cursor).toBe("cursor-1");
    expect(() => InventoryScanResultSchema.parse({ ...result, complete: true, partial: true })).toThrow();
  });
});
