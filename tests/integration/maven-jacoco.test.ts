/**
 * Gercek Maven/JaCoCo entegrasyon testi: fixture projede mvn test calisir,
 * uretilen gercek jacoco.xml parse edilir ve hesap dogrulanir.
 * Bu test XML fixture parse'ini gercek instrumentation ile kanitlar.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parseJacocoXml, findClassInReport } from "../../src/coverage/jacoco-parser.js";
import { evaluateMetric, evaluateTarget } from "../../src/coverage/coverage-math.js";
import { buildPlan, runBaseline, parseSurefireReports } from "../../src/orchestration/build-plan.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

describe("gercek Maven + JaCoCo entegrasyonu", () => {
  let projectDir: string;
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-maven-e2e-"));
    projectDir = join(dir, "fixture-project");
    cpSync(join(FIXTURES, "sample-maven-project"), projectDir, { recursive: true });
    execSync("mvn -B -ntp test", { cwd: projectDir, stdio: "pipe", timeout: 600000 });
  }, 900000);

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("gercek jacoco.xml uretilmis olmali ve parse edilmeli", () => {
    const xmlPath = join(projectDir, "target", "site", "jacoco", "jacoco.xml");
    expect(existsSync(xmlPath)).toBe(true);
    const report = parseJacocoXml(xmlPath);
    expect(report.packages.length).toBeGreaterThan(0);
  });

  it("PaymentService sayaclari gercek run'dan gelmeli (AC13/AC14 hazirligi)", () => {
    const xmlPath = join(projectDir, "target", "site", "jacoco", "jacoco.xml");
    const report = parseJacocoXml(xmlPath);
    const cls = findClassInReport(report, "com.example.payment.PaymentService");
    expect(cls).toBeDefined();
    expect(cls!.line).toBeDefined();
    expect(cls!.line!.covered + cls!.line!.missed).toBeGreaterThan(0);
    expect(cls!.methods.length).toBeGreaterThanOrEqual(3);
    const calculateTotal = cls!.methods.find((m) => m.name === "calculateTotal");
    expect(calculateTotal).toBeDefined();
    expect(calculateTotal!.line).toBeGreaterThan(0);
  });

  it("uretilen sayaclarla hedef degerlendirme calismali", () => {
    const xmlPath = join(projectDir, "target", "site", "jacoco", "jacoco.xml");
    const report = parseJacocoXml(xmlPath);
    const cls = findClassInReport(report, "com.example.payment.PaymentService")!;
    const lineEval = evaluateMetric("LINE", cls.line, true, 5000);
    expect(lineEval.validity).toBe("OK");
    expect(lineEval.percent_display).not.toBeNull();
    const targetEval = evaluateTarget("t1", "com.example.payment.PaymentService", [lineEval], ["LINE"]);
    expect(targetEval.all_required_met).toBe(lineEval.target_met);
  });

  it("buildPlan fixture'ta dogru framework tespit etmeli", () => {
    const plan = buildPlan(projectDir, [""]);
    expect(plan.reactor_root.replace(/\\/g, "/")).toBe(projectDir.replace(/\\/g, "/"));
    expect(plan.test_framework).toBe("junit5");
    expect(plan.jacoco_present).toBe(true);
    expect(plan.mockito_present).toBe(false);
  });

  it("parseSurefireReports gercek test sonucunu okumali", () => {
    const suites = parseSurefireReports(projectDir, "");
    expect(suites.length).toBeGreaterThan(0);
    const total = suites.reduce((acc, s) => acc + s.tests, 0);
    expect(total).toBe(3);
  });
});

describe("MavenRunner baseline akisi (gercek run)", () => {
  let projectDir: string;
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-baseline-e2e-"));
    projectDir = join(dir, "fixture-project");
    cpSync(join(FIXTURES, "sample-maven-project"), projectDir, { recursive: true });
  }, 300000);

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("runBaseline gercek mvn test ile PASSED donmeli", async () => {
    const runner = new MavenRunner();
    const baseline = await runBaseline(projectDir, runner, 600000);
    expect(baseline.status).toBe("PASSED");
    expect(baseline.total_tests).toBe(3);
    expect(baseline.failures).toBe(0);
    expect(baseline.run.exit_code).toBe(0);
    expect(existsSync(baseline.run.stdout_log_path)).toBe(true);
  }, 700000);
});
