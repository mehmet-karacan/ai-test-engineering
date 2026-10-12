/**
 * Configuration schema ve varsayilanlar.
 * Secret degerleri config'de tasimaz; secret_reference_names ile referanslanir.
 */
import { z } from "zod";
import { resolveRuntimeRoot } from "./runtime-paths.js";

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
  /**
   * P05/PR06: frozen concrete hedef listesi icin maximum sembol sayisi.
   * Package/module expansion'i somut hedef sayisina gore sinirlar; asilinsa
   * typed BLOCKED_TARGET_RESOLUTION (EXPANSION_LIMIT_EXCEEDED) fail-closed.
   */
  discovery: z.object({
    max_concrete_targets: z.number().int().min(1).max(10000).default(500),
  }).default({ max_concrete_targets: 500 }),
  worker_profiles: z.array(WorkerProfileSchema).max(16).default([]),
  default_worker_profile: z.string().max(128).optional(),
  allowed_project_roots: z.array(z.string().min(1).max(1024)).max(64).default([]),
  /**
   * 8.3: Bagimlilik hazirlama profili. Hazirlama ayri asamada yalniz bu mirror'lara gider;
   * execution workspace egress'i `none` kalir. Bos ise hazirlama BLOCKED_DEPENDENCIES.
   */
  dependency_provisioning: z.object({
    enabled: z.boolean().default(false),
    allowed_mirrors: z.array(z.string().min(1).max(256)).max(16).default([]),
    timeout_ms: z.number().int().min(30000).max(3600000).default(900000),
  }).default({ enabled: false, allowed_mirrors: [], timeout_ms: 900000 }),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export function defaultStorageRoot(): string {
  return resolveRuntimeRoot();
}
