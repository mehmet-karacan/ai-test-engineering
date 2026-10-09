import { describe, it, expect } from "vitest";
import { TestStartInputSchema, CoverageGoalSchema, percentToBasisPoints } from "../../src/domain/tool-schemas.js";
import { AppConfigSchema, defaultStorageRoot } from "../../src/configuration/config-schema.js";
import { loadConfig, defaultConfig, saveConfig } from "../../src/configuration/config-loader.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("tool semalari", () => {
  it("test_start girdisi %90 hedef ile dogrulanmali", () => {
    const parsed = TestStartInputSchema.parse({
      project_root: "C:/work/sample-project",
      targets: [{ selector: "PaymentService", kind: "class" }],
      coverage: { percent: 90, metrics: ["LINE", "BRANCH"] },
      mode: "TEST_ONLY",
    });
    expect(parsed.coverage.percent).toBe(90);
    expect(parsed.mode).toBe("TEST_ONLY");
    expect(percentToBasisPoints(parsed.coverage.percent)).toBe(9000);
  });

  it("metrics verilmediginde LINE+BRANCH varsayilani gelmeli", () => {
    const parsed = CoverageGoalSchema.parse({ percent: 80 });
    expect(parsed.metrics).toEqual(["LINE", "BRANCH"]);
  });

  it("uc ondalikli yuzde reddedilmeli", () => {
    const result = CoverageGoalSchema.safeParse({ percent: 90.123 });
    expect(result.success).toBe(false);
  });

  it("101 yuzde reddedilmeli", () => {
    const result = CoverageGoalSchema.safeParse({ percent: 101 });
    expect(result.success).toBe(false);
  });
});

describe("config", () => {
  it("default config schema'dan gecmeli", () => {
    const config = defaultConfig();
    expect(config.schema_version).toBe(1);
    expect(config.coverage_defaults.metrics).toEqual(["LINE", "BRANCH"]);
    expect(config.budgets.max_candidate_iterations).toBe(20);
    expect(config.budgets.total_job_minutes).toBe(120);
  });

  it("yazilan config yeniden yuklenmeli", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-config-"));
    try {
      const configPath = join(dir, "config.json");
      const config = defaultConfig();
      config.storage.root = dir;
      saveConfig(config, configPath);
      const loaded = loadConfig(configPath);
      expect(loaded.storage.root).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("gecersiz config reddedilmeli", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-config-bad-"));
    try {
      const configPath = join(dir, "config.json");
      writeFileSync(configPath, JSON.stringify({ schema_version: 2, storage: { root: "x" } }));
      expect(() => loadConfig(configPath)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("storage root platforma gore cozulmeli", () => {
    const root = defaultStorageRoot();
    expect(root.length).toBeGreaterThan(0);
    expect(root).not.toContain("undefined");
  });

  it("AppConfig worker profili dogrulamali", () => {
    const parsed = AppConfigSchema.parse({
      schema_version: 1,
      storage: { root: "C:/tmp" },
      coverage_defaults: { metrics: ["LINE"] },
      budgets: { max_candidate_iterations: 5 },
      worker_profiles: [
        { profile_name: "kurum-ici-1", provider_id: "litellm", model_id: "kurum/model-1", secret_reference_names: ["KURUM_API_KEY_REF"] },
      ],
      default_worker_profile: "kurum-ici-1",
    });
    expect(parsed.worker_profiles).toHaveLength(1);
    expect(parsed.worker_profiles[0]!.secret_reference_names).toEqual(["KURUM_API_KEY_REF"]);
  });
});
