import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PatchApplier } from "../../src/application/patch-applier.js";
import { scanTestQuality, assertQualityGate, detectProductionPathWrite } from "../../src/policies/quality-gate.js";
import { PlateauAnalyzer, GAP_STRATEGIES } from "../../src/orchestration/plateau-analyzer.js";
import { basisPointsFrom } from "../../src/orchestration/candidate-loop.js";
import type { CandidateChangeSet } from "../../src/workers/opencode/model-schemas.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

describe("PatchApplier", () => {
  let projectDir: string;
  let stagingDir: string;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-applier-"));
    projectDir = join(dir, "project");
    stagingDir = join(dir, "staging");
    cpSync(join(FIXTURES, "sample-maven-project"), projectDir, { recursive: true });
    mkdirSync(stagingDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  const roots = [{ module_relative_path: "", test_root: "src/test/java" }];

  it("test koku icinde create uygulamali", () => {
    const applier = new PatchApplier(projectDir, roots, stagingDir);
    const changeset: CandidateChangeSet = {
      schema_version: 1,
      changes: [{ path: "src/test/java/com/example/payment/NewTest.java", action: "create", new_content: "public class NewTest {}", scenario_ids: ["s1"] }],
    };
    const result = applier.apply(changeset);
    expect(result.failed).toHaveLength(0);
    expect(result.applied).toHaveLength(1);
    expect(existsSync(join(stagingDir, "src", "test", "java", "com", "example", "payment", "NewTest.java"))).toBe(true);
  });

  it("production path yazan patch reddedilmeli (AC31)", () => {
    const applier = new PatchApplier(projectDir, roots, stagingDir);
    const changeset: CandidateChangeSet = {
      schema_version: 1,
      changes: [{ path: "src/main/java/com/example/payment/PaymentService.java", action: "modify", new_content: "hacked", scenario_ids: [] }],
    };
    const result = applier.apply(changeset);
    expect(result.applied).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.reason_code).toBe("PRODUCTION_SOURCE");
  });

  it("POM yazan patch reddedilmeli (AC31)", () => {
    const applier = new PatchApplier(projectDir, roots, stagingDir);
    const changeset: CandidateChangeSet = {
      schema_version: 1,
      changes: [{ path: "pom.xml", action: "modify", new_content: "<hacked/>", scenario_ids: [] }],
    };
    const result = applier.apply(changeset);
    expect(result.applied).toHaveLength(0);
    expect(result.failed[0]!.reason_code).toBe("POM");
  });

  it("path escape reddedilmeli (AC38 hazirligi)", () => {
    const applier = new PatchApplier(projectDir, roots, stagingDir);
    const changeset: CandidateChangeSet = {
      schema_version: 1,
      changes: [{ path: "../disari/X.java", action: "create", new_content: "x", scenario_ids: [] }],
    };
    const result = applier.apply(changeset);
    expect(result.applied).toHaveLength(0);
    expect(result.failed[0]!.reason_code).toBe("PATH_ESCAPE");
  });

  it("after_hash uyusmazligi reddedilmeli", () => {
    const applier = new PatchApplier(projectDir, roots, stagingDir);
    const changeset: CandidateChangeSet = {
      schema_version: 1,
      changes: [{ path: "src/test/java/XTest.java", action: "create", new_content: "icerik", after_hash: "0".repeat(64), scenario_ids: [] }],
    };
    const result = applier.apply(changeset);
    expect(result.applied).toHaveLength(0);
    expect(result.failed[0]!.reason_code).toBe("HASH_MISMATCH");
  });

  it("reset staging'i temizlemeli; orijinal projeye dokunmaz", () => {
    const applier = new PatchApplier(projectDir, roots, stagingDir);
    const originalContent = readFileSync(join(projectDir, "src", "main", "java", "com", "example", "payment", "PaymentService.java"), "utf8");
    applier.apply({
      schema_version: 1,
      changes: [{ path: "src/test/java/A.java", action: "create", new_content: "a", scenario_ids: [] }],
    });
    applier.reset();
    expect(existsSync(join(stagingDir, "src", "test", "java", "A.java"))).toBe(false);
    expect(readFileSync(join(projectDir, "src", "main", "java", "com", "example", "payment", "PaymentService.java"), "utf8")).toBe(originalContent);
  });
});

describe("Kalite kapilari (AC33/AC34/AC32)", () => {
  it("bos test sinifi tespit edilmeli", () => {
    const result = scanTestQuality("public class BogusTest {\n}", "X.java");
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.rule_id === "EMPTY_TEST_CLASS")).toBe(true);
  });

  it("assert(true) tautolojisi tespit edilmeli", () => {
    const result = scanTestQuality("class T { @Test\n void a() { org.junit.jupiter.api.Assertions.assertTrue(true); } }", "X.java");
    expect(result.findings.some((f) => f.rule_id === "SKIP_ANNOTATION")).toBe(false);
  });

  it("assertion'siz test tespit edilmeli", () => {
    const result = scanTestQuality("class T { @Test\n void a() { int x = 1; } }", "X.java");
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.rule_id === "NO_ASSERTION")).toBe(true);
  });

  it("anlamli assertion'lu test gecmeli", () => {
    const result = scanTestQuality(
      "class T { @Test\n void a() { org.junit.jupiter.api.Assertions.assertEquals(2, 1 + 1); } }",
      "X.java",
    );
    expect(result.passed).toBe(true);
  });

  it("Mockito verify assertion sayilmali (AC34)", () => {
    const result = scanTestQuality(
      "class T { @Test\n void a() { verify(mock).method(); } }",
      "X.java",
    );
    expect(result.findings.every((f) => f.rule_id !== "NO_ASSERTION")).toBe(true);
  });

  it("@Disabled icerigi reddedilmeli (AC32)", () => {
    expect(() => assertQualityGate("class T { @Disabled\n @Test\n void a() {} }", "X.java")).toThrow();
  });

  it("yalniz assertNotNull zayif siniflanmali (AC34)", () => {
    const result = scanTestQuality(
      "class T { @Test\n void a() { org.junit.jupiter.api.Assertions.assertNotNull(obj); } }",
      "X.java",
    );
    expect(result.findings.some((f) => f.rule_id === "WEAK_ONLY_NOTNULL" || f.rule_id === "NO_ASSERTION")).toBe(true);
  });

  it("detectProductionPathWrite src/main ve pom'u tespit etmeli", () => {
    expect(detectProductionPathWrite("src/main/java/X.java")).toBe(true);
    expect(detectProductionPathWrite("pom.xml")).toBe(true);
    expect(detectProductionPathWrite("src/test/java/XTest.java")).toBe(false);
  });
});

describe("PlateauAnalyzer (AC56)", () => {
  it("ilerleme varken plateau dememeli", () => {
    const analyzer = new PlateauAnalyzer();
    analyzer.recordAttempt("gap1", "new_scenario_inputs", true);
    const decision = analyzer.analyzePlateau(3);
    expect(decision.is_plateau).toBe(false);
  });

  it("tek stratejiyle plateau kararinda continue etmemeli", () => {
    const analyzer = new PlateauAnalyzer();
    for (let i = 0; i < 3; i++) {
      analyzer.recordAttempt("gap1", "new_scenario_inputs", false);
    }
    const decision = analyzer.analyzePlateau(3);
    expect(decision.is_plateau).toBe(true);
    expect(decision.can_continue).toBe(false);
    expect(decision.reason).toContain("tek strateji");
  });

  it("iki strateji denendiyse continue edilebilir (baska yol acik)", () => {
    const analyzer = new PlateauAnalyzer();
    for (let i = 0; i < 3; i++) {
      analyzer.recordAttempt("gap1", "new_scenario_inputs", false);
    }
    for (let i = 0; i < 3; i++) {
      analyzer.recordAttempt("gap1", "different_mocking", false);
    }
    const decision = analyzer.analyzePlateau(3);
    expect(decision.is_plateau).toBe(true);
    expect(decision.can_continue).toBe(true);
  });

  it("bes strateji tanimli olmali", () => {
    expect(GAP_STRATEGIES).toHaveLength(5);
  });
});

describe("basisPointsFrom", () => {
  it("undefined icin null donmeli", () => {
    expect(basisPointsFrom(undefined)).toBeNull();
  });
  it("0 toplam icin null donmeli", () => {
    expect(basisPointsFrom({ covered: 0, missed: 0 })).toBeNull();
  });
  it("bps hesabi dogru olmali", () => {
    expect(basisPointsFrom({ covered: 90, missed: 10 })).toBe(9000);
    expect(basisPointsFrom({ covered: 8996, missed: 1004 })).toBe(8996);
  });
});
