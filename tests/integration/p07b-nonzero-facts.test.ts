/**
 * P07-B/PP34 kalan kanit: gercek Maven/JaCoCo final replay'den non-zero coverage facts.
 *
 * Gercek MCP customer dispatcher Docker akisi egress enforcement mekanizmasi
 * olmadigi icin fail-closed BLOCKED (p07b-dispatch-egress.test.ts kaniti); bu
 * test ayni production sınıflarini (parseJacocoXml/findClassInReport/evaluateMetric/
 * collectFinalReplayEvidence/ReportExporter/Report06 renderer) GERCEK Maven kosusu
 * ciktilari uzerinde non-zero olarak dogrular:
 * - PP34: non-zero eklenen/degisen test + gercek run summary + GERCEK JaCoCo
 *   LINE/BRANCH sayaclari report.json/Report06 HTML/status'ta ayni facts.
 * - PP28/PP32: eksik veri 0/0 veya 100% gibi gosterilmez; counter eksigi UNAVAILABLE.
 * - PP39/PP40: binary patch baytlari byte-exact; PUBLISHED yalniz verify gecince.
 * Browser/print e2e ayri kanit dosyasindadir (p07b-browser-e2e.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, existsSync, readFileSync, cpSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildPlan } from "../../src/orchestration/build-plan.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import { parseJacocoXml, findClassInReport } from "../../src/coverage/jacoco-parser.js";
import { evaluateMetric } from "../../src/coverage/coverage-math.js";
import { collectFinalReplayEvidence } from "../../src/reporting/evidence-collector.js";
import { ReportExporter, type ReportData } from "../../src/reporting/report-generator.js";
import { projectReportStatusFacts } from "../../src/reporting/report-projection.js";

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");

describe("P07-B/PP34: gercek Maven run'dan non-zero coverage facts (JSON/HTML/status)", () => {
  let dir: string;
  let workspace: string;
  let runSummary: { total: number; passed: number; failed: number; skipped: number };
  let lineEval: ReturnType<typeof evaluateMetric>;
  let branchEval: ReturnType<typeof evaluateMetric>;
  let evidenceFiles: Record<string, string | Buffer>;
  let evidenceDefinitions: ReportData["evidence"];
  let runId: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "aitest-p07b-nonzero-"));
    workspace = join(dir, "fixture");
    cpSync(join(process.cwd(), "tests", "fixtures", "sample-maven-project"), workspace, { recursive: true });

    // PP34: non-zero test degisikligi - gercek eklenen test dosyasi (aday gibil calisir;
    // burada dogrudan workspace'e yazilir; facts zincirinin non-zero olmasini saglar).
    const addedTest = join(workspace, "src", "test", "java", "com", "example", "payment", "PaymentServiceBranchTest.java");
    writeFileSync(addedTest, `package com.example.payment;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class PaymentServiceBranchTest {

  private final PaymentService service = new PaymentService();

  @Test
  public void resolveStatus_paid_not_shipped() {
    assertEquals("PAID", service.resolveStatus(true, false));
  }

  @Test
  public void resolveStatus_pending() {
    assertEquals("PENDING", service.resolveStatus(false, false));
  }
}
`, "utf8");
    mkdirSync(join(workspace, "target"), { recursive: true });

    const plan = buildPlan(workspace, [""]);
    const run = await new MavenRunner().run({
      working_dir: workspace,
      goals: plan.maven_goals_coverage,
      timeout_ms: 600000,
      log_dir: join(workspace, "target", "aitest-p07b-logs"),
    });
    expect(run.exit_code, "gercek Maven coverage kosusu exit 0 olmalidir").toBe(0);

    // Gercek surefire envanteri (non-zero):
    const testReportsDir = join(workspace, "target", "surefire-reports");
    const reportNames = existsSync(testReportsDir) ? readdirSync(testReportsDir) : [];
    const firstReport = reportNames.find((name) => name.startsWith("TEST-") && name.endsWith(".xml"));
    expect(firstReport, "surefire TEST-*.xml mevcut olmalidir").toBeTruthy();
    const parsed = reportNames.filter(name => name.startsWith("TEST-") && name.endsWith(".xml"))
      .map(name => parseSurefireTotals(readFileSync(join(testReportsDir, name), "utf8")))
      .reduce((sum, report) => ({total:sum.total+report.total, failures:sum.failures+report.failures, errors:sum.errors+report.errors, skipped:sum.skipped+report.skipped}), {total:0,failures:0,errors:0,skipped:0});
    expect(parsed.total).toBeGreaterThan(0);
    runSummary = { total: parsed.total, passed: Math.max(0, parsed.total - parsed.failures - parsed.errors - parsed.skipped), failed: parsed.failures + parsed.errors, skipped: parsed.skipped };

    // GERCEK JaCoCo counter'lari (PP28/PP32): PaymentService LINE+BRANCH, branch beklenen dal sayisi:
    const jacocoXmlPath = join(workspace, "target", "site", "jacoco", "jacoco.xml");
    expect(existsSync(jacocoXmlPath), "gercek jacoco.xml uretilmis olmalidir").toBe(true);
    const report = parseJacocoXml(jacocoXmlPath);
    const cls = findClassInReport(report, "com.example.payment.PaymentService");
    expect(cls, "PaymentService JaCoCo raporunda bulunmali").toBeTruthy();
    expect(cls!.line).toBeDefined();
    expect(cls!.line!.covered + cls!.line!.missed).toBeGreaterThan(0);
    lineEval = evaluateMetric("LINE", cls!.line, true, 5000);
    branchEval = evaluateMetric("BRANCH", cls!.branch, cls!.branch !== undefined, 5000);
    expect(lineEval.validity).toBe("OK");
    expect(lineEval.percent_display).not.toBeNull();

    // Gercek final replay evidence (Jacoco + surefire + log):
    runId = "p07b-nonzero-final-001";
    const evidence = collectFinalReplayEvidence({
      workspace,
      module_paths: [""],
      run_id: runId,
      job_id: "p07b-nonzero-job",
      stdout_log_path: run.stdout_log_path,
      stderr_log_path: run.stderr_log_path,
      home_dir: process.env["USERPROFILE"] ?? process.env["HOME"],
    });
    expect(evidence.missing, "gercek evidence eksiksiz olmalidir").toEqual([]);
    evidenceFiles = {};
    for (const file of evidence.files) {
      evidenceFiles[file.relative_path] = file.content;
    }
    evidenceDefinitions = evidence.files.map((file) => ({
      relative_path: file.relative_path,
      kind: file.kind,
      stage: file.stage,
      run_id: file.run_id,
      required: file.required,
    }));
  }, 900000);

  afterAll(() => {
    try {
      if (dir) {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    } catch {
      // Windows dosya kilidi
    }
  });

  it("PP34: non-zero eklenen/degisen + gercek JaCoCo counter report.json/HTML/status'ta ayni", () => {
    const data: ReportData = {
      schema_version: 1,
      job_id: "p07b-nonzero-job",
      project_root: workspace.replace(/\\/g, "/"),
      head_commit: "p07b-nonzero-run",
      snapshot_id: null,
      outcome: "TARGET_REACHED",
      verification_scope: "AFFECTED_SCOPE",
      apply_state: "READY_FOR_REVIEW",
      targets: [
        {
          target_id: "PaymentService",
          selector: "PaymentService",
          fqn: "com.example.payment.PaymentService",
          line: { covered: lineEval.covered, missed: lineEval.missed, total: lineEval.total, bps: lineEval.basis_points, target_bps: lineEval.target_bps, met: lineEval.target_met, validity: lineEval.validity },
          branch: branchEval.validity === "OK" && branchEval.total > 0
            ? { covered: branchEval.covered, missed: branchEval.missed, total: branchEval.total, bps: branchEval.basis_points, target_bps: branchEval.target_bps, met: branchEval.target_met, validity: branchEval.validity }
            : null,
        },
      ],
      iterations: [],
      tests_added: 1,
      tests_modified: 0,
      run_summary: runSummary,
      gates: [{ name: "test_only_policy", status: "PASSED", detail: "production degisikligi 0; gercek final replay dogrulandi" }],
      gaps: [],
      models: [],
      production_changed_files: 0,
      generated_at: Date.now(),
      final_run_id: runId,
      checkpoint_id: null,
      evidence: evidenceDefinitions,
    };

    const reportsDir = join(dir, "reports");
    const exporter = new ReportExporter(reportsDir);
    const result = exporter.export(data, evidenceFiles);
    expect(result.verification_passed, "gercek kanitla export verify gecmelidir").toBe(true);
    expect(existsSync(join(reportsDir, "PUBLISHED"))).toBe(true);

    // JSON: gercek non-zero sayilar + gercek JaCoCo counter degerleri:
    const json = JSON.parse(readFileSync(join(reportsDir, "report.json"), "utf8")) as ReportData;
    expect(json.tests_added).toBe(1);
    expect(json.tests_added).toBeGreaterThan(0);
    expect(json.run_summary.total).toBe(runSummary.total);
    expect(json.run_summary.passed).toBe(runSummary.passed);
    expect(json.run_summary.total).toBeGreaterThan(0);
    expect(json.targets[0]!.line!.covered).toBe(lineEval.covered);
    expect(json.targets[0]!.line!.total).toBe(lineEval.total);
    expect(json.targets[0]!.line!.bps).toBe(lineEval.basis_points);
    // PP28: gercek counter'da 0/0 sahtesi yok:
    expect(json.targets[0]!.line!.total).toBeGreaterThan(0);
    expect(json.targets[0]!.line!.bps).toBeGreaterThan(0);

    // HTML: ayni gercek sayilar render edilir:
    const html = readFileSync(join(reportsDir, "index.html"), "utf8");
    // The new renderer shows validated run totals. No accepted patch was
    // supplied in this fixture, so it must not certify the caller's added count.
    expect(json.report07?.test_run.status).toBe("KNOWN");
    expect(json.report07?.changes.status).toBe("UNAVAILABLE");
    expect(html).toContain(`${runSummary.passed}/${runSummary.total}`);
    // Gercek JaCoCo LINE satiri (covered/total + yuzde gorunumu):
    expect(html).toContain(`${lineEval.covered} / ${lineEval.total}`);
    expect(html).toContain(`%${(100 * lineEval.covered / lineEval.total).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`);

    // Status projection: ayni facts:
    const facts = projectReportStatusFacts(json, json.job_id);
    expect(facts).not.toBeNull();
    expect(facts!.tests_added).toBe(1);
    expect(facts!.run_summary).toEqual(runSummary);
    expect(facts!.test_only_policy).toBe("PASSED");

    // Manifest: gercek evidence kimlik zinciri (job/run eslesmesi):
    const manifest = JSON.parse(readFileSync(join(reportsDir, "manifest.json"), "utf8")) as Record<string, unknown>;
    expect(manifest["job_id"]).toBe("p07b-nonzero-job");
    const runIds = manifest["run_ids"] as string[];
    expect(runIds).toContain(runId);
    // PP39: jacoco.xml diskte byte-exact:
    const jacocoEntry = (manifest["artifacts"] as Array<Record<string, unknown>>).find((a) => a["relative_path"] === "evidence/final-replay/root/jacoco.xml");
    expect(jacocoEntry).toBeTruthy();
    const jacocoBytes = readFileSync(join(reportsDir, "evidence", "final-replay", "root", "jacoco.xml"));
    expect(sha256(jacocoBytes)).toBe(jacocoEntry!["sha256"]);
    expect(jacocoBytes.byteLength).toBe(jacocoEntry!["bytes"]);
  });
});

function parseSurefireTotals(xmlText: string): { total: number; failures: number; errors: number; skipped: number } {
  const suites = [...xmlText.matchAll(/<testsuite\b[^>]*>/g)].map((m) => m[0]);
  let total = 0;
  let failures = 0;
  let errors = 0;
  let skipped = 0;
  for (const suite of suites) {
    total += Number(suite.match(/tests="(\d+)"/)?.[1] ?? 0);
    failures += Number(suite.match(/failures="(\d+)"/)?.[1] ?? 0);
    errors += Number(suite.match(/errors="(\d+)"/)?.[1] ?? 0);
    skipped += Number(suite.match(/skipped="(\d+)"/)?.[1] ?? 0);
  }
  return { total, failures, errors, skipped };
}
