/**
 * PR07/PP40: handleTestResult report_path ve report_facts yalniz dogrulanmis
 * PUBLISHED export'un yetkili olmasina bagli kalir.
 * Stale index.html (PUBLISHED yok) veya bozuk/eksik manifest rapor yolunu
 * yetkili gostermemelidir.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createDefaultServicesForTest, handleTestStatus, type Services } from "../../src/application/services.js";
import { handleTestResult } from "../../src/application/job-tools.js";
import { ReportExporter, type ReportData } from "../../src/reporting/report-generator.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import type { JobRow } from "../../src/storage/job-repository.js";

function reportDataFor(jobId: string): ReportData {
  return {
    schema_version: 1,
    job_id: jobId,
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
    gates: [{ name: "test_only_policy", status: "PASSED", detail: "final replay dogrulandi" }],
    gaps: [],
    models: [],
    production_changed_files: 0,
    generated_at: Date.now(),
  };
}

function reportsDirFor(services: Services, jobId: string): string {
  return join(services.config.storage.root, "jobs", jobId, "reports");
}

describe("P07 report path authority (handleTestResult)", () => {
  let root: string;
  let services: Services;
  let job: JobRow;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aitest-p07-path-"));
    const artifactRoot = join(root, "artifacts");
    services = createDefaultServicesForTest(join(root, "state.db"), artifactRoot);
    services.config.storage.root = artifactRoot;
    const { location } = new ProjectRepository(services.storage!.db).ensureLocation("C:/work/demo", "demo", null);
    job = services.jobs!.createJob({ locationId: location.id, requestDigest: `digest-${randomUUID()}` });
  });

  afterEach(() => {
    try {
      services.storage?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi sonraki GC'de temizlenebilir.
    }
  });

  it("stale index.html (PUBLISHED yok) report_path ve report_facts uretemez", async () => {
    const reportsDir = reportsDirFor(services, job.id);
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(reportsDir, "index.html"), "<html>stale</html>", "utf8");
    writeFileSync(join(reportsDir, "report.json"), JSON.stringify(reportDataFor(job.id)), "utf8");

    const result = await handleTestResult({ job_id: job.id }, services);
    expect(result.report_path).toBeNull();
    expect(result.report_facts).toBeNull();
  });

  it("dogrulanmis PUBLISHED export report_path ve report_facts uretir", async () => {
    const reportsDir = reportsDirFor(services, job.id);
    new ReportExporter(reportsDir).export(reportDataFor(job.id));

    const result = await handleTestResult({ job_id: job.id }, services);
    expect(result.report_path).toBe(join(reportsDir, "index.html"));
    expect(result.report_facts).toEqual({
      tests_added: 1,
      tests_modified: 1,
      run_summary: { total: 7, passed: 5, failed: 1, skipped: 1 },
      production_changed_files: 0,
      test_only_policy: "PASSED",
    });
  });

  it("publish sonrasi bozuk manifest report_path ve report_facts'i gecersizlestirir", async () => {
    const reportsDir = reportsDirFor(services, job.id);
    const exporter = new ReportExporter(reportsDir);
    exporter.export(reportDataFor(job.id));

    // manifest.json'i artifacts listesi bos sekilde boz (corrupt/empty).
    const manifestPath = join(reportsDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { artifacts: unknown[] };
    manifest.artifacts = [];
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

    const result = await handleTestResult({ job_id: job.id }, services);
    expect(result.report_path).toBeNull();
    expect(result.report_facts).toBeNull();
  });

  it("PUBLISHED marker'i silinince stale rapor again yetkisiz olur", async () => {
    const reportsDir = reportsDirFor(services, job.id);
    new ReportExporter(reportsDir).export(reportDataFor(job.id));
    rmSync(join(reportsDir, "PUBLISHED"), { force: true });

    const result = await handleTestResult({ job_id: job.id }, services);
    expect(result.report_path).toBeNull();
    expect(result.report_facts).toBeNull();
  });

  it("handleTestStatus PUBLISHED'siz stale rapor icin report_facts null doner", async () => {
    const reportsDir = reportsDirFor(services, job.id);
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(reportsDir, "report.json"), JSON.stringify(reportDataFor(job.id)), "utf8");

    const status = await handleTestStatus({ job_id: job.id }, services);
    expect(status.report_facts).toBeNull();
  });
});
