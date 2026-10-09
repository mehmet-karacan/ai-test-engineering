/**
 * AC67: Gercek yetkili OpenCode+LiteLLM pilotu - modelin gercek ciktisi urun akisindan dogrulanir.
 * Model ciktisi -> parseModelOutput -> PolicyGuard -> PatchApplier -> gercek Maven/JaCoCo -> coverage hedefi.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, cpSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readWorkerProfileFromOpencodeConfig, assertNoSecretValue } from "../../src/workers/opencode/profile-reader.js";
import { parseJacocoXml, findClassInReport } from "../../src/coverage/jacoco-parser.js";
import { basisPointsFrom } from "../../src/orchestration/candidate-loop.js";
import { PatchApplier } from "../../src/application/patch-applier.js";
import { parseSurefireReports } from "../../src/orchestration/build-plan.js";
import { scanTestQuality } from "../../src/policies/quality-gate.js";

const sha = (data: string) => createHash("sha256").update(data).digest("hex");

describe("AC67: gercek model profili + pilot akisi", () => {
  it("opencode.json'dan yetkili profil okunmali; secret degeri okunmamali", () => {
    const profile = readWorkerProfileFromOpencodeConfig();
    expect(profile.provider_id).toBe("litellm");
    expect(profile.model_id.length).toBeGreaterThan(0);
    expect(profile.base_url).toContain("https://");
    expect(profile.api_key_reference).toMatch(/^env:[A-Za-z0-9_]+$/);
    assertNoSecretValue(profile);
  });

  it("model'in gercek ciktisi urun akisindan dogrulanmali (parse -> policy -> kalite)", () => {
    const modelOutput = readFileSync(join(process.cwd(), "tmp", "pilot-stdout.txt"), "utf8");
    const jsonMatch = /```json\s*\n([\s\S]*?)\n```/.exec(modelOutput);
    expect(jsonMatch).toBeTruthy();
    const parsed = JSON.parse(jsonMatch![1]!) as { changes: Array<{ path: string; action: string; new_content: string }> };
    expect(parsed.changes).toHaveLength(1);
    const change = parsed.changes[0]!;
    expect(change.path).toBe("src/test/java/com/example/calc/CalcServiceTest.java");
    expect(change.action).toBe("modify");
    expect(change.new_content).toContain("class CalcServiceTest");

    const quality = scanTestQuality(change.new_content, change.path);
    expect(quality.passed).toBe(true);
    expect(quality.findings).toHaveLength(0);
  });

  it("model'in urettigi testlerle gercek Maven/JaCoCo run hedefi saglamali", () => {
    const modelOutput = readFileSync(join(process.cwd(), "tmp", "pilot-stdout.txt"), "utf8");
    const jsonMatch = /```json\s*\n([\s\S]*?)\n```/.exec(modelOutput)!;
    const parsed = JSON.parse(jsonMatch[1]!) as { changes: Array<{ path: string; action: string; new_content: string }> };
    const change = parsed.changes[0]!;

    const dir = mkdtempSync(join(tmpdir(), "aitest-pilot-"));
    try {
      const projectDir = join(dir, "fixture");
      cpSync(join(process.cwd(), "tests", "fixtures", "ac27-project"), projectDir, { recursive: true });
      const applier = new PatchApplier(projectDir, [{ module_relative_path: "", test_root: "src/test/java" }], join(dir, "staging"));
      const applyResult = applier.apply({
        schema_version: 1,
        changes: [{ path: change.path, action: "modify", new_content: change.new_content, after_hash: sha(change.new_content), scenario_ids: ["pilot"] }],
      });
      expect(applyResult.failed).toHaveLength(0);

      const overlayTarget = join(projectDir, change.path.replace(/\//g, "\\"));
      mkdirSync(join(overlayTarget, ".."), { recursive: true });
      writeFileSync(overlayTarget, change.new_content, "utf8");

      execSync("mvn -B -ntp test", { cwd: projectDir, stdio: "pipe", timeout: 600000 });

      const suites = parseSurefireReports(projectDir, "");
      const total = suites.reduce((acc, s) => acc + s.tests, 0);
      const failures = suites.reduce((acc, s) => acc + s.failures + s.errors, 0);
      expect(total).toBeGreaterThanOrEqual(6);
      expect(failures).toBe(0);

      const report = parseJacocoXml(join(projectDir, "target", "site", "jacoco", "jacoco.xml"));
      const cls = findClassInReport(report, "com.example.calc.CalcService");
      expect(cls).toBeDefined();
      const bps = basisPointsFrom(cls!.line);
      expect(bps).not.toBeNull();
      expect(bps!).toBeGreaterThanOrEqual(5000);

      // production dokunulmadi:
      const prodContent = readFileSync(join(projectDir, "src", "main", "java", "com", "example", "calc", "CalcService.java"), "utf8");
      expect(prodContent).toContain("public class CalcService");
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // Windows dosya kilidi
      }
    }
  }, 900000);
});
