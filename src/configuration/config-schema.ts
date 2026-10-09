/**
 * Configuration schema ve varsayilanlar.
 * Secret degerleri config'de tasimaz; secret_reference_names ile referanslanir.
 */
import { z } from "zod";

export const StorageConfigSchema = z.object({
  root: z.string().min(1).max(1024),
});
export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export const CoverageDefaultsSchema = z.object({
  metrics: z.array(z.enum(["LINE", "BRANCH"])).max(2).default(["LINE", "BRANCH"]),
});
export type CoverageDefaults = z.infer<typeof CoverageDefaultsSchema>;

export const BudgetDefaultsSchema = z.object({
  max_candidate_iterations: z.number().int().min(1).max(1000).default(20),
  max_repairs_per_candidate: z.number().int().min(0).max(10).default(2),
  no_progress_window: z.number().int().min(1).max(100).default(3),
  total_job_minutes: z.number().int().min(1).max(10080).default(120),
});
export type BudgetDefaults = z.infer<typeof BudgetDefaultsSchema>;

export const WorkerProfileSchema = z.object({
  profile_name: z.string().min(1).max(128),
  provider_id: z.string().min(1).max(128),
  model_id: z.string().min(1).max(256),
  secret_reference_names: z.array(z.string().min(1).max(128)).max(16).default([]),
});
export type WorkerProfile = z.infer<typeof WorkerProfileSchema>;

export const AppConfigSchema = z.object({
  schema_version: z.literal(1),
  storage: StorageConfigSchema,
  coverage_defaults: CoverageDefaultsSchema,
  budgets: BudgetDefaultsSchema,
  worker_profiles: z.array(WorkerProfileSchema).max(16).default([]),
  default_worker_profile: z.string().max(128).optional(),
  allowed_project_roots: z.array(z.string().min(1).max(1024)).max(64).default([]),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export function defaultStorageRoot(): string {
  const platform = process.platform;
  if (platform === "win32") {
    const appData = process.env["LOCALAPPDATA"];
    if (appData && appData.length > 0) {
      return `${appData}\\ai-test-engineering`;
    }
    const userProfile = process.env["USERPROFILE"];
    if (userProfile && userProfile.length > 0) {
      return `${userProfile}\\AppData\\Local\\ai-test-engineering`;
    }
  } else if (platform === "darwin") {
    const home = process.env["HOME"];
    if (home && home.length > 0) {
      return `${home}/Library/Application Support/ai-test-engineering`;
    }
  } else {
    const xdgData = process.env["XDG_DATA_HOME"];
    if (xdgData && xdgData.length > 0) {
      return `${xdgData}/ai-test-engineering`;
    }
    const home = process.env["HOME"];
    if (home && home.length > 0) {
      return `${home}/.local/share/ai-test-engineering`;
    }
  }
  throw new Error("Kullaniciya ozel veri dizini cozumlenemedi");
}
