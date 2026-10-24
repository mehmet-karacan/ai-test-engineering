/**
 * S04/S05 ortak runtime agent kontratlari.
 * Agent cevabi kisa bir ozet ve artifact referanslarindan olusur; buyuk
 * changeset veya ham model metni bu zarfın icine tasinmaz.
 */
import { z } from "zod";

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u, "SHA-256 hex bekleniyor");
const IdSchema = z.string().uuid();

export const ArtifactRefSchema = z.object({
  artifact_id: IdSchema,
  job_id: IdSchema,
  kind: z.string().min(1).max(128),
  sha256: DigestSchema,
  bytes: z.number().int().nonnegative().safe(),
  schema_version: z.string().min(1).max(32),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const AllowedContextScopeSchema = z.object({
  snapshot_id: IdSchema,
  root_digest: DigestSchema,
  relative_paths: z.array(z.string().min(1).max(1024)).max(256),
  line_ranges: z.array(z.object({
    relative_path: z.string().min(1).max(1024),
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  }).refine((range) => range.end >= range.start, { message: "line range ters olamaz" })).max(512),
  max_bytes: z.number().int().positive().safe(),
  secrets_excluded: z.literal(true),
});
export type AllowedContextScope = z.infer<typeof AllowedContextScopeSchema>;

export const AgentRoleSchema = z.enum(["explorer", "test_architect", "test_developer", "reviewer"]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AgentBudgetSchema = z.object({
  max_attempts: z.number().int().positive().max(100),
  remaining_attempts: z.number().int().nonnegative().max(100),
  max_minutes: z.number().positive().max(24 * 60),
  remaining_minutes: z.number().nonnegative().max(24 * 60),
  max_output_bytes: z.number().int().positive().safe(),
}).refine((budget) => budget.remaining_attempts <= budget.max_attempts, {
  message: "kalan attempt butcesi toplam limiti asamaz",
}).refine((budget) => budget.remaining_minutes <= budget.max_minutes, {
  message: "kalan zaman butcesi toplam limiti asamaz",
});
export type AgentBudget = z.infer<typeof AgentBudgetSchema>;

export const ModelBindingSchema = z.object({
  provider_id: z.string().min(1).max(128),
  model_id: z.string().min(1).max(256),
  revision: z.number().int().nonnegative(),
});
export type ModelBinding = z.infer<typeof ModelBindingSchema>;

export const TaskAssignmentSchema = z.object({
  objective: z.string().trim().min(1).max(2048),
  deliverables: z.array(z.string().trim().min(1).max(1024)).min(1).max(16),
  acceptance_criteria: z.array(z.string().trim().min(1).max(1024)).min(1).max(16),
}).superRefine((assignment, context) => {
  if (Buffer.byteLength(JSON.stringify(assignment), "utf8") > 8 * 1024) {
    context.addIssue({code:"custom",message:"Task assignment 8 KiB UTF-8 sinirini asiyor"});
  }
});
export type TaskAssignment = z.infer<typeof TaskAssignmentSchema>;

export const AgentTaskContractSchema = z.object({
  schema_version: z.literal(1),
  task_id: IdSchema,
  job_id: IdSchema,
  project_id: IdSchema,
  location_id: IdSchema,
  job_revision: z.number().int().nonnegative(),
  source_snapshot_id: IdSchema,
  source_digest: DigestSchema,
  role: AgentRoleSchema,
  /** Optional for persisted legacy tasks; stage labels never replace a task brief. */
  assignment: TaskAssignmentSchema.optional(),
  parent_task_id: IdSchema.nullable(),
  dependency_task_ids: z.array(IdSchema).max(32),
  input_artifact_refs: z.array(ArtifactRefSchema).max(64),
  allowed_context_scope: AllowedContextScopeSchema,
  expected_output_schema: z.string().min(1).max(128),
  budget: AgentBudgetSchema,
  model_binding: ModelBindingSchema,
  idempotency_key: z.string().min(8).max(256),
}).superRefine((contract, context) => {
  if (contract.parent_task_id === contract.task_id) {
    context.addIssue({ code: "custom", path: ["parent_task_id"], message: "task kendisinin parent'i olamaz" });
  }
  if (new Set(contract.dependency_task_ids).size !== contract.dependency_task_ids.length) {
    context.addIssue({ code: "custom", path: ["dependency_task_ids"], message: "dependency task id'leri tekrar edemez" });
  }
  if (contract.allowed_context_scope.snapshot_id !== contract.source_snapshot_id) {
    context.addIssue({ code: "custom", path: ["allowed_context_scope", "snapshot_id"], message: "context snapshot source snapshot ile ayni olmali" });
  }
  if (contract.input_artifact_refs.some((ref) => ref.job_id !== contract.job_id)) {
    context.addIssue({ code: "custom", path: ["input_artifact_refs"], message: "artifact ref baska job'a ait" });
  }
});
export type AgentTaskContract = z.infer<typeof AgentTaskContractSchema>;

export const AgentTaskResultSchema = z.object({
  schema_version: z.literal(1),
  task_id: IdSchema,
  job_id: IdSchema,
  job_revision: z.number().int().nonnegative(),
  attempt_id: IdSchema,
  status: z.enum(["COMPLETED", "FAILED", "CANCELLED", "INTERRUPTED", "BLOCKED", "WAITING_APPROVAL"]),
  summary: z.string().max(6144),
  findings_count: z.number().int().nonnegative(),
  blocking_findings_count: z.number().int().nonnegative(),
  artifact_refs: z.array(ArtifactRefSchema).max(64),
  changed_paths: z.array(z.string().min(1).max(1024)).max(512),
  run_refs: z.array(z.string().min(1).max(256)).max(64),
  next_action: z.string().max(1024),
}).superRefine((result, context) => {
  if (Buffer.byteLength(result.summary, "utf8") > 6 * 1024) {
    context.addIssue({ code: "custom", path: ["summary"], message: "summary 6 KiB UTF-8 sinirini asiyor" });
  }
  if (result.blocking_findings_count > result.findings_count) {
    context.addIssue({ code: "custom", path: ["blocking_findings_count"], message: "blocking bulgu toplam bulguyu asamaz" });
  }
  if (result.artifact_refs.some((ref) => ref.job_id !== result.job_id)) {
    context.addIssue({ code: "custom", path: ["artifact_refs"], message: "artifact ref baska job'a ait" });
  }
});
export type AgentTaskResult = z.infer<typeof AgentTaskResultSchema>;

/** S03 sayfali metadata envanterinin MCP'ye donen bounded sonucu. */
export const InventoryScanResultSchema = z.object({
  schema_version: z.literal(1),
  scan_id: IdSchema,
  project_id: IdSchema,
  location_id: IdSchema,
  generation: z.number().int().nonnegative(),
  scanned_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  complete: z.boolean(),
  partial: z.boolean(),
  errors: z.array(z.object({
    relative_path: z.string().min(1).max(1024),
    code: z.string().min(1).max(128),
  })).max(512),
  metadata_artifact_ref: ArtifactRefSchema.nullable(),
  next_cursor: z.string().max(4096).nullable(),
}).superRefine((result, context) => {
  if (result.complete && result.partial) {
    context.addIssue({ code: "custom", path: ["partial"], message: "complete ve partial ayni anda true olamaz" });
  }
  if (result.error_count < result.errors.length) {
    context.addIssue({ code: "custom", path: ["error_count"], message: "error_count hata listesinden kucuk olamaz" });
  }
});
export type InventoryScanResult = z.infer<typeof InventoryScanResultSchema>;

export function assertAgentTaskResultMatchesContract(contract: AgentTaskContract, result: AgentTaskResult): void {
  if (contract.task_id !== result.task_id || contract.job_id !== result.job_id || contract.job_revision !== result.job_revision) {
    throw new Error("AgentTaskResult task/job/revision fence'i ile eslesmiyor");
  }
}
