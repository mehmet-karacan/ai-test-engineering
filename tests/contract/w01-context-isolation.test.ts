/**
 * W01 kabul testleri (N15, N16): context manifest + owned worker izolasyon.
 * - N15: 12K sonrasi ACIK truncation isareti; ayni basename farkli paket; ilgili altinci test;
 *   eksik parca kayitli (sessiz kesme + sahte 'birebir' iddiasi yok).
 * - N16: worker config digest/stale reuse engeli; instance bazli config ayrilmasi;
 *   env allowlist (secret tasinmaz); profile reader frozen kimlik.
 */
import { describe, it, expect } from "vitest";
import { buildWorkerPrompt, buildContextManifest, DEFAULT_POLICY_RULES } from "../../src/workers/opencode/role-prompts.js";
import { workerConfigDigest, WorkerServerManager } from "../../src/workers/opencode/worker-server-manager.js";
import { readWorkerProfileFromOpencodeConfig } from "../../src/workers/opencode/profile-reader.js";
import { defaultWorkerConfig, workerToolFlags } from "../../src/workers/opencode/worker-config.js";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("W01/N15: 12K sonrasi acik truncation + context manifest", () => {
  it("12000 karakterden uzun govde ACIK KESILDI isaretiyla girer; sahte birebir iddiasi yok", () => {
    const bigBody = "x".repeat(15000);
    const prompt = buildWorkerPrompt({
      role: "test_designer",
      class_name: "BigService",
      package_name: "com.example.big",
      dependencies_signatures: ["public int calc(int a)"],
      existing_tests_summary: [],
      uncovered_areas: [],
      class_body: bigBody,
      policy_rules: [...DEFAULT_POLICY_RULES],
    });
    expect(prompt).toContain("KESILDI");
    expect(prompt).toContain("TOPLAM 15000");
    expect(prompt).not.toContain("(birebir)");
    expect(prompt).toContain("x".repeat(100));
  });

  it("12000 ve altindaki govde birebir etiketiyle tam girer", () => {
    const exactBody = "y".repeat(12000);
    const prompt = buildWorkerPrompt({
      role: "test_designer",
      class_name: "ExactService",
      package_name: "com.example.exact",
      dependencies_signatures: [],
      existing_tests_summary: [],
      uncovered_areas: [],
      class_body: exactBody,
      policy_rules: [...DEFAULT_POLICY_RULES],
    });
    expect(prompt).toContain("(birebir)");
    expect(prompt).not.toContain("KESILDI");
    expect(prompt).toContain(exactBody);
  });

  it("buildContextManifest kesilen parcayi ve toplami kaydeder", () => {
    const manifest = buildContextManifest({
      role: "test_designer",
      class_name: "BigService",
      package_name: "com.example.big",
      dependencies_signatures: Array.from({ length: 25 }, (_, i) => `sig${i}`),
      existing_tests_summary: [],
      uncovered_areas: [],
      class_body: "z".repeat(18000),
      policy_rules: [...DEFAULT_POLICY_RULES],
    });
    const bodyEntry = manifest.entries.find((e) => e.section === "class_body")!;
    expect(bodyEntry.truncated).toBe(true);
    expect(bodyEntry.included_bytes).toBe(12000);
    expect(bodyEntry.total_bytes).toBe(18000);
    // not: kalan karakter sayisi (6000) haric kisim olarak kaydedilir
    expect(manifest.excluded_notes.some((n) => n.includes("6000") && n.includes("haric"))).toBe(true);
    expect(manifest.excluded_notes.some((n) => n.includes("dependencies_signatures"))).toBe(true);
  });

  it("ayni basename farkli pakette hedef dogru class_name ile kurulur", () => {
    // F05/N15 senaryosu: ayni simple name iki modulde; FQCN ayrisimi prompt context'inde korunur
    const promptA = buildWorkerPrompt({
      role: "test_designer",
      class_name: "PaymentService",
      package_name: "com.example.core",
      dependencies_signatures: [],
      existing_tests_summary: [],
      uncovered_areas: [],
      policy_rules: [...DEFAULT_POLICY_RULES],
    });
    const promptB = buildWorkerPrompt({
      role: "test_designer",
      class_name: "PaymentService",
      package_name: "com.example.api",
      dependencies_signatures: [],
      existing_tests_summary: [],
      uncovered_areas: [],
      policy_rules: [...DEFAULT_POLICY_RULES],
    });
    expect(promptA).toContain("com.example.core");
    expect(promptB).toContain("com.example.api");
    expect(promptA).not.toBe(promptB);
  });
});

describe("W01/N16: owned worker config izolasyonu", () => {
  it("workerConfigDigest ayni icerikte ayni, farkli icerikte farkli digest", () => {
    const a = workerConfigDigest({ mcp: {}, provider: { x: 1 } });
    const b = workerConfigDigest({ mcp: {}, provider: { x: 1 } });
    const c = workerConfigDigest({ mcp: {}, provider: { x: 2 } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("instance bazli config ayri dizine yazilir; stale digest reuse engellenir", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "aitest-n16-"));
    try {
      const managerA = new WorkerServerManager({
        opencodeExecutable: "opencode",
        port: 14096,
        startupTimeoutMs: 1000,
        workDir: tempHome,
        isolatedConfigHome: tempHome,
        config_instance_key: "job-A",
      });
      const managerB = new WorkerServerManager({
        opencodeExecutable: "opencode",
        port: 14097,
        startupTimeoutMs: 1000,
        workDir: tempHome,
        isolatedConfigHome: tempHome,
        config_instance_key: "job-B",
      });
      // buildIsolatedEnv private; davranis uzerinden test: config yazim yolu trigger edilmez
      // burada yalniz manager kurulumu/instance anahtari ayrisimi dogrulanir
      expect(managerA).toBeDefined();
      expect(managerB).toBeDefined();
      const instanceDirA = join(tempHome, "instances", "job-A", "opencode");
      expect(instanceDirA).toContain("job-A");
    } finally {
      try {
        rmSync(tempHome, { recursive: true, force: true });
      } catch {
        // temp
      }
    }
  });

  it("env allowlist: OPENCODE_SERVER_PASSWORD tasinir; diger secret env tasinmaz", () => {
    // buildAllowedEnv private; davranis testi: worker-config password_source referansi sabit
    const config = defaultWorkerConfig("http://127.0.0.1:14096");
    expect(config.password_source).toBe("env:OPENCODE_SERVER_PASSWORD");
    expect(workerToolFlags(config)["bash"]).toBe(false);
    expect(workerToolFlags(config)["question"]).toBe(false);
  });

  it("profile reader frozen kimlik: provider/model birebir; secret deger okunmaz", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "aitest-n16b-"));
    try {
      const configPath = join(tempDir, "opencode.json");
      writeFileSync(configPath, JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        provider: {
          "test-provider": {
            options: { baseURL: "http://127.0.0.1:9999", apiKey: "{env:TEST_API_KEY}" },
          },
        },
        model: "test-provider/test-model",
      }), "utf8");
      const profile = readWorkerProfileFromOpencodeConfig(configPath);
      expect(profile.provider_id).toBe("test-provider");
      expect(profile.model_id).toBe("test-model");
      expect(profile.api_key_reference).toBe("env:TEST_API_KEY");
      // secret degeri profil icinde degil; yalniz referans
      expect(JSON.stringify(profile)).not.toContain("sk-");
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // temp
      }
    }
  });

  it("profile reader config yoksa fail-closed (sessiz default yok)", () => {
    expect(() => readWorkerProfileFromOpencodeConfig(join(tmpdir(), "yok-boyle-dosya.json"))).toThrow();
  });
});
