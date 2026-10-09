/**
 * Model cikti sozlesmeleri: versiyonlu schema'lar.
 * Zorunlu alan eksikligi, schema uyumsuzluk, kesilmis JSON ve path disina yazma istegi reddedilir.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1;

export const TestPlanScenarioSchema = z.object({
  scenario_id: z.string().min(1).max(128),
  target_behavior: z.string().min(1).max(512),
  target_method: z.string().max(256).optional(),
  input_description: z.string().max(1024).optional(),
  mock_setup: z.string().max(1024).optional(),
  expected_outcome: z.string().min(1).max(1024),
  assertion_rationale: z.string().max(1024).optional(),
  priority: z.enum(["high", "medium", "low"]),
});
export type TestPlanScenario = z.infer<typeof TestPlanScenarioSchema>;

export const TestPlanSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  scenarios: z.array(TestPlanScenarioSchema).min(1).max(100),
});
export type TestPlan = z.infer<typeof TestPlanSchema>;

export const CandidateActionSchema = z.enum(["create", "modify", "delete"]);

export const CandidateChangeSetSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  base_checkpoint: z.string().max(128).optional(),
  parent_hash: z.string().length(64).optional(),
  changes: z
    .array(
      z.object({
        path: z.string().min(1).max(1024),
        action: CandidateActionSchema,
        before_hash: z.string().length(64).optional(),
        after_hash: z.string().length(64).optional(),
        new_content: z.string().max(512 * 1024).optional(),
        patch: z.string().max(512 * 1024).optional(),
        scenario_ids: z.array(z.string().max(128)).max(100).default([]),
      }),
    )
    .min(1)
    .max(50),
});
export type CandidateChangeSet = z.infer<typeof CandidateChangeSetSchema>;

export const AnalysisArtifactSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  observed_behaviors: z.array(z.string().max(1024)).max(200),
  contract_sources: z.array(z.string().max(512)).max(100).default([]),
  dependencies: z.array(z.string().max(512)).max(200).default([]),
  existing_test_status: z.string().max(4096),
  uncertainties: z.array(z.string().max(1024)).max(50).default([]),
});
export type AnalysisArtifact = z.infer<typeof AnalysisArtifactSchema>;

export const ReviewFindingSchema = z.object({
  finding_id: z.string().min(1).max(128),
  severity: z.enum(["critical", "major", "minor", "info"]),
  file: z.string().max(1024),
  location: z.string().max(256).optional(),
  rule: z.string().max(128),
  evidence: z.string().max(2048),
  suggested_fix: z.string().max(2048).optional(),
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

export const ReviewArtifactSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  findings: z.array(ReviewFindingSchema).max(200).default([]),
  verdict: z.enum(["accept", "reject", "needs_review"]),
  reason: z.string().max(2048),
});
export type ReviewArtifact = z.infer<typeof ReviewArtifactSchema>;

export const GapAnalysisSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  remaining_areas: z.array(z.string().max(512)).max(200),
  attempted_approaches: z.array(z.string().max(512)).max(200).default([]),
  evidence_references: z.array(z.string().max(256)).max(100).default([]),
  blocker_class: z.enum([
    "MISSING_SCENARIO",
    "MOCKING_OR_FIXTURE_GAP",
    "UNCONTROLLED_ENVIRONMENT",
    "CONFIGURATION_BARRIER",
    "SUSPECTED_UNREACHABLE_CODE",
    "VERIFIED_POLICY_BARRIER",
    "MODEL_STRATEGY_EXHAUSTED",
    "BUDGET_EXHAUSTED",
    "UNKNOWN",
  ]),
  uncertainty: z.string().max(2048).optional(),
  next_strategy: z.string().max(2048).optional(),
});
export type GapAnalysis = z.infer<typeof GapAnalysisSchema>;

export const WorkerHandoffSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  last_verified_snapshot: z.string().max(256),
  last_checkpoint: z.string().max(256).optional(),
  remaining_plan: z.array(z.string().max(512)).max(200).default([]),
  failed_attempts: z.array(z.string().max(512)).max(200).default([]),
  policy_digest: z.string().max(128).optional(),
  next_single_action: z.string().min(1).max(1024),
});
export type WorkerHandoff = z.infer<typeof WorkerHandoffSchema>;

export function parseModelOutput<T>(schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: unknown } }, raw: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("INVALID_MODEL_OUTPUT: JSON parse hatasi (kesilmis veya bozuk cikti)");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error("INVALID_MODEL_OUTPUT: schema dogrulamasi basarisiz");
  }
  return result.data!;
}

export function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }
  const fenceMatch = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(trimmed);
  if (fenceMatch && (fenceMatch[1]!.trim().startsWith("{") || fenceMatch[1]!.trim().startsWith("["))) {
    return fenceMatch[1]!.trim();
  }
  throw new Error("INVALID_MODEL_OUTPUT: JSON bulunamadi");
}
