/**
 * Config yukleme: dosya yoksa varsayilan; varsa schema dogrulamasi.
 * Guvensiz paylasimli root reddedilir.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { AppConfigSchema, defaultStorageRoot, type AppConfig } from "./config-schema.js";
import { AppError } from "../domain/errors.js";
import { resolveConfigPath } from "./runtime-paths.js";

export function loadConfig(configPath?: string): AppConfig {
  const effectivePath = configPath ?? defaultConfigPath();
  if (!existsSync(effectivePath)) {
    return defaultConfig();
  }
  let raw: unknown;
  try {
    const content = readFileSync(effectivePath, "utf8").replace(/^\uFEFF/, "");
    raw = JSON.parse(content);
  } catch (error) {
    throw new AppError("INVALID_PARAMETERS", `Config dosyasi JSON parse hatasi: ${effectivePath}`, {
      cause: String(error),
    });
  }
  assertNoLegacyRunnerField(raw);
  const parsed = AppConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("INVALID_PARAMETERS", `Config schema dogrulamasi basarisiz: ${effectivePath}`, {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

export function defaultConfig(): AppConfig {
  return AppConfigSchema.parse({
    schema_version: 1,
    storage: { root: defaultStorageRoot() },
    coverage_defaults: { metrics: ["LINE", "BRANCH"] },
    budgets: {
      max_candidate_iterations: 20,
      max_repairs_per_candidate: 2,
      no_progress_window: 3,
      total_job_minutes: 120,
    },
    discovery: { max_concrete_targets: 500 },
    // Bagimlilik hazirlama varsayilan olarak kapali; onayli mirror kullanici
    // tarafindan private config'e acikca yazilmalidir.
    dependency_provisioning: {
      enabled: false,
      allowed_mirrors: [],
      timeout_ms: 900000,
    },
  });
}

export function defaultConfigPath(): string {
  return resolveConfigPath();
}

export function saveConfig(config: AppConfig, configPath: string): void {
  assertNoLegacyRunnerField(config);
  const parsed = AppConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new AppError("INVALID_PARAMETERS", "Kaydedilecek config schema dogrulamasi basarisiz", {
      issues: parsed.error.issues,
    });
  }
  const absPath = resolve(configPath);
  if (!isAbsolute(configPath)) {
    throw new AppError("INVALID_PARAMETERS", "Config yolu mutlak olmali");
  }
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, JSON.stringify(parsed.data, null, 2) + "\n", "utf8");
}

function assertNoLegacyRunnerField(raw: unknown): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  if (["runner", "runner_kind", "runnerKind"].some((key) => Object.hasOwn(raw, key))) {
    throw new AppError("INVALID_PARAMETERS", "Legacy runner config requires explicit migration/revision", {
      reason_code: "LEGACY_RUNNER_MIGRATION_REQUIRED",
    });
  }
}
