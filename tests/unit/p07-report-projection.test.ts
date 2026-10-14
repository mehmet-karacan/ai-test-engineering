import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReportExporter, type ReportData } from "../../src/reporting/report-generator.js";
import { projectAcceptedChanges, projectReportStatusFacts, projectRunSummary } from "../../src/reporting/report-projection.js";

function reportData(): ReportData {
  return {
    schema_version: 1,
    job_id: "11111111-2222-3333-4444-555555555555",
    project_root: "C:/work/demo",
    head_commit: "abc123",
    snapshot_id: "snapshot-1",
    outcome: "TARGET_REACHED",
    verification_scope: "AFFECTED_SCOPE",
    apply_state: "READY_FOR_REVIEW",
    targets: [],
    iterations: [],
    tests_added: 1,
    tests_modified: 1,
    run_summary: { total: 7, passed: 5, failed: 1, skipped: 1 },
    gates: [{ name: "test_only_policy", status: "PASSED", detail: "production degisikligi 0; final replay dogrulandi" }],
    gaps: [],
    models: [{ role: "test_designer", provider: "litellm", model: "model-a" }],
    production_changed_files: 0,
    generated_at: Date.now(),
  };
}

describe("P07 facts projection", () => {
  it("accepted degisikliklerden eklenen/degisen test ve production sayisini turetir", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-p07-projection-"));
    try {
      mkdirSync(join(root, "src", "test", "java"), { recursive: true });
      writeFileSync(join(root, "src", "test", "java", "ExistingTest.java"), "class ExistingTest {}", "utf8");
      const result = projectAcceptedChanges(root, [
        { path: "src/test/java/ExistingTest.java", action: "create" },
        { path: "src/test/java/NewTest.java", action: "create" },
        { path: "src/main/java/Production.java", action: "create" },
        { path: "src/test/java/RemovedTest.java", action: "delete" },
      ]);
      expect(result).toEqual({ tests_added: 1, tests_modified: 2, production_changed_files: 1 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("final replay sayaclarini passed/failed/skipped olarak projekte eder", () => {
    expect(projectRunSummary({ total_tests: 7, failures: 1, errors: 1, skipped: 1 })).toEqual({
      total: 7,
      passed: 4,
      failed: 2,
      skipped: 1,
    });
  });

  it("status projection job kimligi ve sayaclar uyusmazsa unknown doner", () => {
    const data = reportData();
    expect(projectReportStatusFacts(data, data.job_id)).toEqual({
      tests_added: 1,
      tests_modified: 1,
      run_summary: data.run_summary,
      production_changed_files: 0,
      test_only_policy: "PASSED",
    });
    expect(projectReportStatusFacts(data, "99999999-2222-3333-4444-555555555555")).toBeNull();
    expect(projectReportStatusFacts({ ...data, run_summary: { total: 7, passed: 7, failed: 0, skipped: 0 } }, data.job_id)).not.toBeNull();
  });
});

describe("P07 export fail-closed", () => {
  it("summary.txt JSON/HTML facts parity icin test eklenen ve degisen sayaclarini tasir", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-p07-summary-parity-"));
    try {
      const reportsDir = join(root, "reports");
      const exporter = new ReportExporter(reportsDir);
      const result = exporter.export(reportData());
      expect(result.verification_passed).toBe(true);

      const summary = readFileSync(join(reportsDir, "summary.txt"), "utf8");
      expect(summary).toContain("Test eklenen: 1");
      expect(summary).toContain("Test degisen: 1");
      expect(summary).toContain("Run: 7 test, 5 gecti, 1 basarisiz, 1 atlandi");
      expect(summary).toContain("Production degisikligi: 0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("binary extra artifacti byte-birebir korur ve manifest bytes/hash kontrol eder", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-p07-export-"));
    try {
      const exporter = new ReportExporter(join(root, "reports"));
      const binary = Buffer.from([0, 1, 2, 127, 128, 255]);
      const result = exporter.export(reportData(), { "evidence/output.bin": binary });
      expect(result.verification_passed).toBe(true);
      expect(readFileSync(join(root, "reports", "evidence", "output.bin"))).toEqual(binary);

      const manifestPath = join(root, "reports", "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { artifacts: Array<Record<string, unknown>> };
      manifest.artifacts.find((entry) => entry.relative_path === "summary.txt")!["bytes"] = 1;
      writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
      expect(exporter.verifyExport().hash_mismatch).toContain("summary.txt");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["empty", (manifest: { artifacts: Array<Record<string, unknown>> }) => { manifest.artifacts = []; }],
    ["duplicate", (manifest: { artifacts: Array<Record<string, unknown>> }) => { manifest.artifacts.push({ ...manifest.artifacts[0] }); }],
    ["reserved", (manifest: { artifacts: Array<Record<string, unknown>> }) => { manifest.artifacts.push({ ...manifest.artifacts[0], relative_path: "manifest.json" }); }],
    ["blank", (manifest: { artifacts: Array<Record<string, unknown>> }) => { manifest.artifacts.push({ ...manifest.artifacts[0], relative_path: "" }); }],
    ["required-missing", (manifest: { artifacts: Array<Record<string, unknown>> }) => { manifest.artifacts = manifest.artifacts.filter((entry) => entry.relative_path !== "index.html"); }],
  ])("%s manifest entry fail-closed reddedilir", (_name, mutate) => {
    const root = mkdtempSync(join(tmpdir(), "aitest-p07-manifest-"));
    try {
      const exporter = new ReportExporter(join(root, "reports"));
      exporter.export(reportData());
      const manifestPath = join(root, "reports", "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { artifacts: Array<Record<string, unknown>> };
      mutate(manifest);
      writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
      const verification = exporter.verifyExport();
      expect([...verification.missing, ...verification.hash_mismatch].length).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
