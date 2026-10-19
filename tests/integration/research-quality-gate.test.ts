/**
 * Arastirma 2026-10-19 F02/F03 duzeltmelerinin normal MCP aday kabul akisindaki dogrulamasi.
 * Aday kabul zinciri (candidate-loop) gercek Maven/JaCoCo fixture'i uzerinden:
 * - F02 pozitif: gecerli assertion'li aday kabul edilir (kabul zinciri degismedi).
 * - F02 negatif: yorum/string assertion, tautoloji, fluent terminal'siz assertion'li adaylar REDDEDILIR.
 * - F03 negatif: baslik yorumu sonrasi production FQN shadow'u kalite kapisi tarafindan yakalanir.
 * - Aday ret bedenleri ve repair feedback'ine girisi (kalite bulgulari) dogrulanir.
 * Ortamda Maven yoksa bu test fail-closed SKIP degil, acik atlanir ve raporlanir (N/A).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { CandidateLoop, type IterateOptions } from "../../src/orchestration/candidate-loop.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import { scanTestQuality, isSutShadowing } from "../../src/policies/quality-gate.js";
import type { CandidateChangeSet } from "../../src/workers/opencode/model-schemas.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const sha = (data: string) => createHash("sha256").update(data).digest("hex");

let mavenAvailable = false;
try {
  execSync("mvn -v", { stdio: "pipe", timeout: 60000 });
  mavenAvailable = true;
} catch {
  mavenAvailable = false;
}

// F02 probe'larinin gercek fonksiyonla ayni girdileri (birim seviyesinde ters beklenti):
describe("Arastirma F02: kalite kapisi probe'lari duzeltme sonrasi", () => {
  const cases: Array<{ id: string; content: string; expected_pass: boolean }> = [
    { id: "Q01_NO_ASSERT_CONTROL", content: "@Test\nvoid test() {\n service.run();\n}", expected_pass: false },
    { id: "Q02_MEANINGFUL_CONTROL", content: "@Test\nvoid test() {\n assertEquals(42, service.run());\n}", expected_pass: true },
    { id: "Q03_COMMENT_ONLY", content: "@Test\nvoid test() {\n service.run();\n // assertEquals(42, actual);\n}", expected_pass: false },
    { id: "Q04_STRING_ONLY", content: "@Test\nvoid test() {\n service.run();\n String help = \"assertEquals(42, actual)\";\n}", expected_pass: false },
    { id: "Q05_FALSE_TAUTOLOGY", content: "@Test\nvoid test() {\n service.run();\n assertFalse(false);\n}", expected_pass: false },
    { id: "Q06_FLUENT_WITHOUT_TERMINAL", content: "@Test\nvoid test() {\n assertThat(service.run());\n}", expected_pass: false },
    { id: "Q07_FQ_ANNOTATION", content: "@org.junit.jupiter.api.Test\nvoid test() {\n assertEquals(42, service.run());\n}", expected_pass: true },
    { id: "Q08_TRUE_TAUTOLOGY_CONTROL", content: "@Test\nvoid test() {\n service.run();\n assertTrue(true);\n}", expected_pass: false },
  ];

  for (const c of cases) {
    it(`${c.id} beklenen kapı sonucu verir (gate_pass=${c.expected_pass})`, () => {
      const result = scanTestQuality(c.content, "src/test/java/example/ServiceTest.java");
      expect(result.passed).toBe(c.expected_pass);
    });
  }

  it("fluent zinciri terminal dogrulamayla KABUL edilir (yanlis ret regressonu)", () => {
    const meaningfulFluent = "@Test\nvoid test() {\n assertThat(service.calc(2)).isEqualTo(4);\n}";
    const result = scanTestQuality(meaningfulFluent, "X.java");
    expect(result.passed).toBe(true);
  });

  it("JUnit4 expected exception ve parametrik test yanlis REDDILMEZ", () => {
    const junit4 = `public class LegacyTest {
  @Test(expected = IllegalArgumentException.class)
  public void rejectsNull() { new LegacyInventory(null); }
}`;
    expect(scanTestQuality(junit4, "LegacyTest.java").passed).toBe(true);

    const parametrized = `public class ParamTest {
  @ParameterizedTest
  @ValueSource(ints = {1, 2, 3})
  void positives(int v) { org.junit.jupiter.api.Assertions.assertTrue(v > 0); }
}`;
    expect(scanTestQuality(parametrized, "ParamTest.java").passed).toBe(true);
  });
});

// F03 probe'unun ayni girdisi (shadow tespiti):
describe("Arastirma F03: SUT shadowing probe'lari duzeltme sonrasi", () => {
  it("S01 shadow kontrol", () => {
    expect(isSutShadowing("t.java", "package example;\nclass Service {}", "example.Service")).toBe(true);
  });
  it("S02 baslik yorumu sonrasi shadow YINE yakalanir", () => {
    expect(isSutShadowing("t.java", "/* Legitimate Java header */\npackage example;\nclass Service {}", "example.Service")).toBe(true);
  });
  it("S03 non-shadow kontrol", () => {
    expect(isSutShadowing("t.java", "package other;\nclass Service {}", "example.Service")).toBe(false);
  });
});

// Normal MCP aday kabul akisinda (CandidateLoop.iterate) pozitif/negatif dogrulama:
describe("Arastirma F02/F03: normal MCP aday kabul akisinda kalite kapisi", () => {
  let dir: string;
  let projectDir: string;
  let stagingDir: string;

  beforeAll(() => {
    if (!mavenAvailable) {
      return;
    }
    dir = mkdtempSync(join(tmpdir(), "aitest-rgate-"));
    projectDir = join(dir, "fixture");
    stagingDir = join(dir, "staging");
    cpSync(join(FIXTURES, "ac27-project"), projectDir, { recursive: true });
    execSync("mvn -B -ntp test", { cwd: projectDir, stdio: "pipe", timeout: 600000 });
  }, 900000);

  afterAll(() => {
    if (!dir) {
      return;
    }
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("gecerli aday kabul edilir; kalite bulgusu uretilmez (F02 pozitif)", async () => {
    if (!mavenAvailable) {
      return;
    }
    const validTest = `package com.example.calc;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class CalcServiceGeneratedTest {

  private final CalcService service = new CalcService();

  @Test
  public void add_positive() {
    assertEquals(8, service.add(3, 5));
  }

  @Test
  public void add_zero() {
    assertEquals(5, service.add(5, 0));
  }

  @Test
  public void add_negative() {
    assertEquals(-2, service.add(-5, 3));
  }

  @Test
  public void multiply_basic() {
    assertEquals(15, service.multiply(3, 5));
  }
}
`;
    let called = 0;
    const options: IterateOptions = {
      project_root: projectDir,
      target_fqn: "com.example.calc.CalcService",
      target_module_path: "",
      line_target_bps: 6000,
      branch_target_bps: 6000,
      budget: { max_candidate_iterations: 2, max_repairs_per_candidate: 1, no_progress_window: 2 },
      staging_root: stagingDir,
      timeout_ms_per_run: 600000,
      workspace_root: join(dir!, "workspaces"),
      generate_candidate: async () => {
        called++;
        return {
          schema_version: 1,
          changes: [
            {
              path: "src/test/java/com/example/calc/CalcServiceGeneratedTest.java",
              action: "create",
              new_content: validTest,
              after_hash: sha(validTest),
              scenario_ids: [`valid-${called}`],
            },
          ],
        } as CandidateChangeSet;
      },
    };
    const loop = new CandidateLoop(new MavenRunner());
    const result = await loop.iterate(options);
    expect(called).toBeGreaterThanOrEqual(1);
    const adopted = result.iterations.find((it) => it.decision === "adopted");
    expect(adopted).toBeDefined();
    if (adopted) {
      expect(adopted.quality_findings).toHaveLength(0);
    }
  }, 900000);

  it("yorum/string assertion'li aday REDDEDILIR ve bulgular repair feedback'e girer (F02 negatif)", async () => {
    if (!mavenAvailable) {
      return;
    }
    const commentOnly = `package com.example.calc;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class CalcServiceGeneratedTest {

  private final CalcService service = new CalcService();

  @Test
  public void add_positive() {
    service.add(3, 5);
    // assertEquals(8, result);
  }
}
`;
    let called = 0;
    const options: IterateOptions = {
      project_root: projectDir!,
      target_fqn: "com.example.calc.CalcService",
      target_module_path: "",
      line_target_bps: 9000,
      branch_target_bps: 9000,
      budget: { max_candidate_iterations: 3, max_repairs_per_candidate: 1, no_progress_window: 3 },
      staging_root: stagingDir!,
      timeout_ms_per_run: 600000,
      workspace_root: join(dir!, "workspaces"),
      generate_candidate: async () => {
        called++;
        return {
          schema_version: 1,
          changes: [
            {
              path: "src/test/java/com/example/calc/CalcServiceGeneratedTest.java",
              action: "create",
              new_content: commentOnly,
              after_hash: sha(commentOnly),
              scenario_ids: [`comment-${called}`],
            },
          ],
        } as CandidateChangeSet;
      },
    };
    const loop = new CandidateLoop(new MavenRunner());
    const result = await loop.iterate(options);
    // Aday hicbir iterasyonda kabul edilmemeli:
    expect(result.iterations.some((it) => it.decision === "adopted")).toBe(false);
    // Ret gerekcesi kalite kapisi olmali ve NO_ASSERTION bulgusu tasinmali:
    const rejected = result.iterations.find((it) => it.decision === "rejected");
    expect(rejected).toBeDefined();
    expect(rejected!.reason).toContain("Kalite");
    expect(rejected!.quality_findings.length).toBeGreaterThan(0);
    expect(rejected!.quality_findings.some((f) => f.rule_id === "NO_ASSERTION")).toBe(true);
  }, 900000);

  it("baslik yorumu sonrasi shadow adayi REDDEDILIR (F03 negatif)", async () => {
    if (!mavenAvailable) {
      return;
    }
    const shadowTest = `/* Legitimate Java header */
package com.example.calc;

public class CalcService {
  // Bu sinif production sinifini ayni FQCN ile golgeler.
}
`;
    let called = 0;
    const options: IterateOptions = {
      project_root: projectDir!,
      target_fqn: "com.example.calc.CalcService",
      target_module_path: "",
      line_target_bps: 9000,
      branch_target_bps: 9000,
      budget: { max_candidate_iterations: 2, max_repairs_per_candidate: 1, no_progress_window: 2 },
      staging_root: stagingDir!,
      timeout_ms_per_run: 600000,
      workspace_root: join(dir!, "workspaces"),
      generate_candidate: async () => {
        called++;
        return {
          schema_version: 1,
          changes: [
            {
              path: "src/test/java/com/example/calc/CalcService.java",
              action: "create",
              new_content: shadowTest,
              after_hash: sha(shadowTest),
              scenario_ids: [`shadow-${called}`],
            },
          ],
        } as CandidateChangeSet;
      },
    };
    const loop = new CandidateLoop(new MavenRunner());
    const result = await loop.iterate(options);
    expect(result.iterations.some((it) => it.decision === "adopted")).toBe(false);
    const rejected = result.iterations.find((it) => it.decision === "rejected");
    expect(rejected).toBeDefined();
    expect(rejected!.quality_findings.some((f) => f.rule_id === "SUT_SHADOWING")).toBe(true);
  }, 900000);
});
