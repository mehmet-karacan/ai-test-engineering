/**
 * P07 Report06 rapor yuzeyleri (PP34/PP35/PP37/PP38/PP40):
 * - PP34: non-zero eklenen/degisen/run summary JSON/HTML/status'ta ayni facts.
 * - PP35: calistirilmamis/asamsiz veri sifir gibi gosterilmez; test_only_policy PASSED olamaz.
 * - PP37: baseline/progress/final + print + link/offline kontrolu gercek data ile.
 * - PP38: model narrative hicbir Report06 yuzeyine (HTML/JSON) giremez.
 * - PP40: zorunlu kanit eksigi (export failure) PUBLISHED/READY basarisi uretemez.
 * Gercek browser/print e2e kaniti ayri runtime kabuludur; burada DOM/struct/link kapilari yerel.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReport06 } from "../../src/reporting/report06-renderer.js";
import { ReportExporter, type ReportData } from "../../src/reporting/report-generator.js";
import { projectReportStatusFacts } from "../../src/reporting/report-projection.js";

function reportData(): ReportData {
  return {
    schema_version: 1,
    job_id: "job-p07-surf-001",
    project_root: "C:/work/customer",
    head_commit: "abc123",
    snapshot_id: "snapshot-001",
    outcome: "TARGET_REACHED",
    verification_scope: "AFFECTED_SCOPE",
    apply_state: "READY_FOR_REVIEW",
    targets: [],
    iterations: [],
    tests_added: 2,
    tests_modified: 3,
    run_summary: { total: 9, passed: 6, failed: 2, skipped: 1 },
    gates: [{ name: "test_only_policy", status: "PASSED", detail: "production degisikligi 0; final replay dogrulandi" }],
    gaps: [],
    models: [],
    production_changed_files: 0,
    // Keep numeric narrative probes independent of the wall-clock timestamp.
    generated_at: Date.UTC(2026, 0, 1),
    final_run_id: "run-final-001",
    checkpoint_id: "checkpoint-001",
  };
}

describe("P07/PP34: non-zero test/run facts yuzeylerde tutarli", () => {
  it("eklenen/degisen/run summary report.json, Report06 HTML ve status projection'da ayni", () => {
    const data = reportData();
    const html = buildReport06(data);
    // HTML contextline ve run cards gercek non-zero sayilari tasiyor
    expect(html).toContain("Eklenen <b>2</b>");
    expect(html).toContain("Degisen <b>3</b>");
    expect(html).toContain("<strong>9</strong>");
    expect(html).toContain("<strong>6</strong>");
    expect(html).toContain("<strong>2</strong>");
    expect(html).toContain("<strong>1</strong>");

    const root = mkdtempSync(join(tmpdir(), "aitest-p07-surf-"));
    try {
      const exporter = new ReportExporter(join(root, "reports"));
      const result = exporter.export(data);
      expect(result.verification_passed).toBe(true);
      const json = JSON.parse(readFileSync(join(root, "reports", "report.json"), "utf8")) as ReportData;
      expect(json.tests_added).toBe(2);
      expect(json.tests_modified).toBe(3);
      expect(json.run_summary).toEqual({ total: 9, passed: 6, failed: 2, skipped: 1 });
      expect(json.production_changed_files).toBe(0);
      // status yuzeyi ayni facts projection'u okur
      const facts = projectReportStatusFacts(json, json.job_id);
      expect(facts).toEqual({
        tests_added: 2,
        tests_modified: 3,
        run_summary: { total: 9, passed: 6, failed: 2, skipped: 1 },
        production_changed_files: 0,
        test_only_policy: "PASSED",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("P07/PP35: bilinmeyen veri sifir gibi gosterilmez", () => {
  it("NOT_RUN asama ve null run_summary 'Calistirilmadi'/'Veri yok' olarak render edilir", () => {
    const data = reportData();
    data.stages = [
      { name: "baseline", status: "KNOWN", run_id: "run-b", run_summary: { total: 2, passed: 2, failed: 0, skipped: 0 } },
      { name: "progress", status: "NOT_RUN", run_id: null, run_summary: null },
      { name: "final", status: "KNOWN", run_id: "run-final-001", run_summary: { total: 9, passed: 6, failed: 2, skipped: 1 } },
    ];
    data.targets = [{ target_id: "t1", selector: "CalcService", fqn: "com.example.calc.CalcService", line: null, branch: null }];
    const html = buildReport06(data);
    expect(html).toContain("Calistirilmadi");
    expect(html).toContain("Veri yok");
    // sifir-run sahtesi YOK: null run_summary "0 test / 0 gecti" olarak render edilmemeli
    expect(html).not.toContain("0 test / 0 gecti");
    // eksik coverage 0/0 (0.00%) olarak gosterilmez
    expect(html).not.toContain("0/0 (0.00%)");
  });

  it("test_only_policy NOT_RUN iken status projection PASSED donmez", () => {
    const data = reportData();
    data.gates = [{ name: "test_only_policy", status: "NOT_RUN", detail: "final replay dogrulanmadi" }];
    const facts = projectReportStatusFacts(data, data.job_id);
    expect(facts).not.toBeNull();
    expect(facts!.test_only_policy).toBe("NOT_RUN");
  });
});

describe("P07/PP37: asama, link ve offline kontrolu", () => {
  it("baseline/progress/final asama satirlari ve print-view gercek data ile uretilir", () => {
    const data = reportData();
    data.stages = [
      { name: "baseline", status: "KNOWN", run_id: "run-baseline-001", run_summary: { total: 2, passed: 2, failed: 0, skipped: 0 } },
      { name: "progress", status: "KNOWN", run_id: "run-candidate-001", run_summary: { total: 3, passed: 3, failed: 0, skipped: 0 } },
      { name: "final", status: "KNOWN", run_id: "run-final-001", run_summary: { total: 9, passed: 6, failed: 2, skipped: 1 } },
    ];
    const html = buildReport06(data);
    expect(html).toContain('data-stage="baseline"');
    expect(html).toContain('data-stage="progress"');
    expect(html).toContain('data-stage="final"');
    expect(html).toContain("run-baseline-001");
    expect(html).toContain("run-candidate-001");
    expect(html).toContain('id="print-view"');
  });

  it("evidence linkleri canonical; traversal/absolute/driver path'si neutralize edilir", () => {
    const data = reportData();
    const sha = "0".repeat(64);
    data.evidence = [
      { relative_path: "evidence/final-replay/jacoco.xml", kind: "jacoco_xml", stage: "final", run_id: "run-final-001", sha256: sha, bytes: 120, required: true },
      { relative_path: "../../etc/passwd", kind: "jacoco_xml", stage: "final", run_id: null, sha256: sha, bytes: 10, required: false },
      { relative_path: "/etc/passwd", kind: "run_log", stage: "final", run_id: null, sha256: sha, bytes: 10, required: false },
      { relative_path: "C:/Windows/system32/win.ini", kind: "run_log", stage: "final", run_id: null, sha256: sha, bytes: 10, required: false },
    ];
    const html = buildReport06(data);
    expect(html).toContain('href="./evidence/final-replay/jacoco.xml"');
    // traversal/absolute/driver kanit yollarlari guvenli anchor'a indirgenir (dosya linki yok)
    expect(html).not.toContain('href="./../../etc/passwd"');
    expect(html).not.toContain('href="./etc/passwd"');
    expect(html).not.toContain('href="./C:/Windows');
    expect(html).toContain("#evidence");
  });

  it("Report06 HTML offline: harici http(s) fetch yok; CSP connect-src none", () => {
    const html = buildReport06(reportData());
    expect(html).not.toMatch(/<script[^>]+src="http/i);
    expect(html).not.toMatch(/<img[^>]+src="http/i);
    expect(html).not.toMatch(/<a[^>]+href="http/i);
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("font-src 'none'");
  });
});

describe("P07/PP38: model narrative hicbir Report06 yuzeyine giremez", () => {
  it("nested model_review/recommendation HTML payload ve report.json'dan kirpilir", () => {
    const data = reportData() as unknown as Record<string, unknown>;
    data["model_review"] = "bu sinif cok guclu bir mimariye sahip";
    data["targets"] = [{ selector: "CalcService", fqn: "com.example.calc.CalcService", line: null, branch: null, risk_score: 0.91, recommendation: "daha fazla test yaz" }];
    const root = mkdtempSync(join(tmpdir(), "aitest-p07-narr-"));
    try {
      const exporter = new ReportExporter(join(root, "reports"));
      const result = exporter.export(data as never);
      expect(result.sanitized_paths.length).toBeGreaterThan(0);
      const html = readFileSync(join(root, "reports", "index.html"), "utf8");
      const json = readFileSync(join(root, "reports", "report.json"), "utf8");
      for (const narrative of ["bu sinif cok guclu bir mimariye sahip", "daha fazla test yaz", "0.91", "risk_score"]) {
        expect(html).not.toContain(narrative);
        expect(json).not.toContain(narrative);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("P07/PP40: export failure PUBLISHED/READY basarisi uretemez", () => {
  it("zorunlu kanit eksigi: verification_passed false VE PUBLISHED marker yazilmaz", () => {
    const data = reportData();
    data.evidence = [{ relative_path: "evidence/final-replay/jacoco.xml", kind: "jacoco_xml", stage: "final", run_id: "run-final-001", required: true }];
    const root = mkdtempSync(join(tmpdir(), "aitest-p07-fail-"));
    try {
      const reportsDir = join(root, "reports");
      const exporter = new ReportExporter(reportsDir);
      const result = exporter.export(data);
      expect(result.verification_passed).toBe(false);
      expect([...result.missing_files, ...result.hash_mismatch].join(" ")).toContain("evidence/final-replay/jacoco.xml");
      // export basarisizsa PUBLISHED/READY marker'i yok: yetkili rapor yolu uretemez
      expect(existsSync(join(reportsDir, "PUBLISHED"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("yeniden export baslamasinda eski PUBLISHED gecersizlesir (stale rapor READY kalmaz)", () => {
    const data = reportData();
    const root = mkdtempSync(join(tmpdir(), "aitest-p07-repub-"));
    try {
      const reportsDir = join(root, "reports");
      const exporter = new ReportExporter(reportsDir);
      const ok = exporter.export(data);
      expect(ok.verification_passed).toBe(true);
      expect(existsSync(join(reportsDir, "PUBLISHED"))).toBe(true);

      // ikinci export zorunlu kanit eksigi ile basarili degil; eski PUBLISHED silinip yenisi yazilmaz
      const data2 = reportData();
      data2.evidence = [{ relative_path: "evidence/final-replay/missing.xml", kind: "jacoco_xml", stage: "final", run_id: "run-final-001", required: true }];
      const result2 = exporter.export(data2);
      expect(result2.verification_passed).toBe(false);
      expect(existsSync(join(reportsDir, "PUBLISHED"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
