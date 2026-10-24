/**
 * MCP tool giris/cikis semalari (Zod).
 * Yuzde 0-100 araligi, en fazla iki ondalikli; ic hesap basis point kullanir.
 */
import { z } from "zod";

const ProjectRootSchema = z.string().trim().min(1).max(1024);
const WorkerProfileNameSchema = z.string().min(1).max(128).refine(value => !/\s/.test(value), "Worker profil kimligi bosluk iceremez");

export const CoverageMetricSchema = z.enum(["LINE", "BRANCH"]);
export type CoverageMetric = z.infer<typeof CoverageMetricSchema>;

export const TargetKindSchema = z.enum(["class", "package", "module"]);
export type TargetKind = z.infer<typeof TargetKindSchema>;

export const TargetSelectorSchema = z.object({
  selector: z.string().trim().min(1).max(512),
  kind: TargetKindSchema,
});
export type TargetSelector = z.infer<typeof TargetSelectorSchema>;

export const CoverageGoalSchema = z.object({
  /** Optional independent branch goal; legacy percent remains the common default. */
  branch_percent: z.number().min(0).max(100).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-8, {
    message: "En fazla iki ondalikli kabul edilir",
  }).optional(),
  percent: z.number().min(0).max(100).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-8, {
    message: "En fazla iki ondalikli kabul edilir",
  }),
  metrics: z.array(CoverageMetricSchema).min(1).max(2)
    .refine(metrics => new Set(metrics).size === metrics.length, { message: "Coverage metrikleri tekrar edemez" })
    .transform(metrics => (["LINE", "BRANCH"] as const).filter(metric => metrics.includes(metric)))
    .default(["LINE", "BRANCH"]),
}).refine(goal => goal.branch_percent === undefined || goal.metrics.includes("BRANCH"), {
  message: "branch_percent icin BRANCH metrigi secilmelidir", path: ["branch_percent"],
});
export type CoverageGoal = z.infer<typeof CoverageGoalSchema>;

export const ModeSchema = z.enum(["TEST_ONLY"]);
export type Mode = z.infer<typeof ModeSchema>;

export const TestStartInputSchema = z.object({
  coverage_scan_id: z.string().uuid().optional(),
  project_root: ProjectRootSchema,
  targets: z.array(TargetSelectorSchema).min(1).max(50),
  coverage: CoverageGoalSchema,
  mode: ModeSchema.default("TEST_ONLY"),
  model_profile: z.string().min(1).max(128).optional(),
  worker_profile: WorkerProfileNameSchema.optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
});
export type TestStartInput = z.infer<typeof TestStartInputSchema>;

export const TestStatusInputSchema = z.object({
  job_id: z.string().uuid().optional(),
  project_root: ProjectRootSchema.optional(),
  event_cursor: z.number().int().min(0).optional(),
});
export type TestStatusInput = z.infer<typeof TestStatusInputSchema>;

export const TestResumeInputSchema = z.object({
  job_id: z.string().uuid().optional(),
  project_root: ProjectRootSchema.optional(),
  model_profile: z.string().min(1).max(128).optional(),
  worker_profile: WorkerProfileNameSchema.optional(),
}).strict();
export type TestResumeInput = z.infer<typeof TestResumeInputSchema>;

export const TestCancelInputSchema = z.object({
  job_id: z.string().uuid(),
  project_root: ProjectRootSchema.optional(),
  reason: z.enum(["pause", "cancel"]),
  reason_text: z.string().max(512).optional(),
});
export type TestCancelInput = z.infer<typeof TestCancelInputSchema>;

export const TestResultInputSchema = z.object({
  job_id: z.string().uuid(),
  project_root: ProjectRootSchema.optional(),
  detail: z.enum(["summary", "detail"]).default("summary"),
  artifact_kind: z.enum(["report", "diff", "log", "coverage"]).optional(),
});
export type TestResultInput = z.infer<typeof TestResultInputSchema>;

export const ProjectInspectInputSchema = z.object({
  project_root: ProjectRootSchema,
  refresh: z.boolean().default(false),
});

export const ProjectCoverageInputSchema = z.object({
  project_root: ProjectRootSchema,
  below_percent: z.number().min(0).max(100).default(80),
  recommendation_limit: z.number().int().min(1).max(20).default(5),
  idempotency_key: z.string().min(8).max(128).optional(),
});
export type ProjectInspectInput = z.infer<typeof ProjectInspectInputSchema>;

export const ProjectQueryInputSchema = z.object({
  project_id: z.string().uuid().optional(),
  project_root: ProjectRootSchema.optional(),
  view: z.enum(["projects", "modules", "packages", "classes", "tests", "coverage_history", "job_history"]),
  cursor: z.string().max(16).regex(/^\d+$/, "Cursor negatif olmayan tam sayi olmalidir")
    .refine(value => Number.isSafeInteger(Number(value)), { message: "Cursor guvenli tam sayi araliginda olmalidir" }).optional(),
  limit: z.number().int().min(1).max(100).default(20),
}).refine(input => input.view === "projects" || input.project_id !== undefined || input.project_root !== undefined, {
  message: "Bu sorgu icin project_id veya project_root gereklidir", path: ["project_root"],
});
export type ProjectQueryInput = z.infer<typeof ProjectQueryInputSchema>;

export const TestApplyInputSchema = z.object({
  job_id: z.string().uuid(),
  project_root: ProjectRootSchema.optional(),
  checkpoint_id: z.string().uuid(),
  patch_digest: z.string().length(64),
  target_workspace: z.string().min(1).max(1024),
  approval_reference: z.string().min(8).max(256),
});
export type TestApplyInput = z.infer<typeof TestApplyInputSchema>;

export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}
