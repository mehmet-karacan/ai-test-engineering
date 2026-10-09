/**
 * MCP tool giris/cikis semalari (Zod).
 * Yuzde 0-100 araligi, en fazla iki ondalikli; ic hesap basis point kullanir.
 */
import { z } from "zod";

export const CoverageMetricSchema = z.enum(["LINE", "BRANCH"]);
export type CoverageMetric = z.infer<typeof CoverageMetricSchema>;

export const TargetKindSchema = z.enum(["class", "package", "module"]);
export type TargetKind = z.infer<typeof TargetKindSchema>;

export const TargetSelectorSchema = z.object({
  selector: z.string().min(1).max(512),
  kind: TargetKindSchema,
});
export type TargetSelector = z.infer<typeof TargetSelectorSchema>;

export const CoverageGoalSchema = z.object({
  percent: z.number().min(0).max(100).refine((v) => Math.round(v * 100) === v * 100, {
    message: "En fazla iki ondalikli kabul edilir",
  }),
  metrics: z.array(CoverageMetricSchema).max(2).default(["LINE", "BRANCH"]),
});
export type CoverageGoal = z.infer<typeof CoverageGoalSchema>;

export const ModeSchema = z.enum(["TEST_ONLY"]);
export type Mode = z.infer<typeof ModeSchema>;

export const TestStartInputSchema = z.object({
  project_root: z.string().min(1).max(1024),
  targets: z.array(TargetSelectorSchema).min(1).max(50),
  coverage: CoverageGoalSchema,
  mode: ModeSchema.default("TEST_ONLY"),
  model_profile: z.string().min(1).max(128).optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
});
export type TestStartInput = z.infer<typeof TestStartInputSchema>;

export const TestStatusInputSchema = z.object({
  job_id: z.string().uuid().optional(),
  project_root: z.string().min(1).max(1024).optional(),
  event_cursor: z.number().int().min(0).optional(),
});
export type TestStatusInput = z.infer<typeof TestStatusInputSchema>;

export const TestResumeInputSchema = z.object({
  job_id: z.string().uuid().optional(),
  project_root: z.string().min(1).max(1024).optional(),
  model_profile: z.string().min(1).max(128).optional(),
});
export type TestResumeInput = z.infer<typeof TestResumeInputSchema>;

export const TestCancelInputSchema = z.object({
  job_id: z.string().uuid(),
  reason: z.enum(["pause", "cancel"]),
  reason_text: z.string().max(512).optional(),
});
export type TestCancelInput = z.infer<typeof TestCancelInputSchema>;

export const TestResultInputSchema = z.object({
  job_id: z.string().uuid(),
  detail: z.enum(["summary", "detail"]).default("summary"),
  artifact_kind: z.enum(["report", "diff", "log", "coverage"]).optional(),
});
export type TestResultInput = z.infer<typeof TestResultInputSchema>;

export const ProjectInspectInputSchema = z.object({
  project_root: z.string().min(1).max(1024),
  refresh: z.boolean().default(false),
});
export type ProjectInspectInput = z.infer<typeof ProjectInspectInputSchema>;

export const ProjectQueryInputSchema = z.object({
  project_id: z.string().uuid().optional(),
  project_root: z.string().min(1).max(1024).optional(),
  view: z.enum(["projects", "modules", "packages", "classes", "tests", "coverage_history", "job_history"]),
  cursor: z.string().max(128).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type ProjectQueryInput = z.infer<typeof ProjectQueryInputSchema>;

export const TestApplyInputSchema = z.object({
  job_id: z.string().uuid(),
  checkpoint_id: z.string().uuid(),
  patch_digest: z.string().length(64),
  target_workspace: z.string().min(1).max(1024),
  approval_reference: z.string().min(8).max(256),
});
export type TestApplyInput = z.infer<typeof TestApplyInputSchema>;

export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}
