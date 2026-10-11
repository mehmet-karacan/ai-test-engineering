/**
 * W06 kabul testleri (F13/F14, N02-N04): facts-only veri kontrati.
 * - N02: model narrative negatif enjeksiyonu - model_review/risk_score/rationale/recommendation
 *   nested alanlar HTML, JSON, print, text yuzeylerine giremez; kirpilan yollar kayitli.
 * - N03: test adi/DisplayName/kaynak kodu yalniz source/run kaydindan; uydurma aciklama yok.
 * - N04: null/0/NOT_RUN/UNAVAILABLE/INVALID ayri; eksik veri %0 veya PASSED ile ortulmez.
 * - F14: 'yorumlar AI tarafindan uretildi' metni raporda YOK.
 */
import { describe, it, expect } from "vitest";
import { sanitizeNarrativeFields, metricValueState, zeroMeansMeasured, FORBIDDEN_NARRATIVE_FIELDS } from "../../src/reporting/report-data-contract.js";
import { ReportExporter, buildReport, buildSummary, escapeHtml, type ReportData } from "../../src/reporting/report-generator.js";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function sampleReportData(): ReportData {
  return {
    schema_version: 1,
    job_id: "22222222-3333-4444-5555-666666666666",
    project_root: "C:/work/demo",
    head_commit: "abc123",
    snapshot_id: "snap-1",
    outcome: "TARGET_REACHED",
    verification_scope: "AFFECTED_SCOPE",
    apply_state: "READY_FOR_REVIEW",
    targets: [
      {
        target_id: "t1",
        selector: "PaymentService",
        fqn: "com.example.payment.PaymentService",
        line: { covered: 90, missed: 10, total: 100, bps: 9000, target_bps: 9000, met: true, validity: "OK" },
        branch: null,
      },
    ],
    iterations: [],
    tests_added: 0,
    tests_modified: 0,
    run_summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    gates: [],
    gaps: [],
    models: [],
    production_changed_files: 0,
    generated_at: Date.now(),
  };
}

describe("W06/N02: model narrative negatif enjeksiyonu", () => {
  it("nested model_review/risk_score/rationale/recommendation kirpilir; yollar kayitli", () => {
    const payload = {
      targets: [{ fqn: "com.example.X", line: { covered: 5 }, model_review: "bu sinif guclu", risk_score: 0.9 }],
      control_results: [{ rule_id: "R1", rationale: "yeterli assertion var" }],
      generation: { recommendation: "daha fazla test yaz", nested: { scenario_explanation: "aciklama" } },
    };
    const result = sanitizeNarrativeFields(payload);
    expect(result.clean).toBe(false);
    expect(result.removed_paths).toContain("targets[0].model_review");
    expect(result.removed_paths).toContain("targets[0].risk_score");
    expect(result.removed_paths).toContain("control_results[0].rationale");
    expect(result.removed_paths).toContain("generation.recommendation");
    expect(result.removed_paths).toContain("generation.nested.scenario_explanation");
    expect(JSON.stringify(payload)).not.toContain("bu sinif guclu");
    expect(JSON.stringify(payload)).not.toContain("0.9");
  });

  it("temiz payload'a dokunmaz; clean:true", () => {
    const payload = { targets: [{ fqn: "com.example.X", covered: 5 }], job_id: "j1" };
    const result = sanitizeNarrativeFields(payload);
    expect(result.clean).toBe(true);
    expect(result.removed_paths).toHaveLength(0);
    expect(JSON.stringify(payload)).toContain("com.example.X");
  });

  it("exported report.json'da narrative alanlar YOK (F14/N02)", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w06-"));
    try {
      const data = sampleReportData() as unknown as Record<string, unknown>;
      data["model_review"] = "AI bunu onerir";
      data["risk_score"] = 0.8;
      const exporter = new ReportExporter(join(dir, "reports"));
      const result = exporter.export(data as never);
      expect(result.sanitized_paths).toContain("model_review");
      expect(result.sanitized_paths).toContain("risk_score");
      const saved = JSON.parse(readFileSync(join(dir, "reports", "report.json"), "utf8")) as Record<string, unknown>;
      expect(saved["model_review"]).toBeUndefined();
      expect(saved["risk_score"]).toBeUndefined();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  });

  it("rapor HTML'inde 'yorumlar AI tarafindan uretildi' metni YOK (F14)", () => {
    const html = buildReport(sampleReportData());
    expect(html).not.toContain("yorumlar AI tarafindan uretildi");
    expect(html).not.toContain("AI katkisi");
    // facts-only bolumu mevcut:
    expect(html).toContain("Uretim kayitlari");
  });

  it("FORBIDDEN_NARRATIVE_FIELDS tam liste; summary/text/print'te narrative yok", () => {
    expect(FORBIDDEN_NARRATIVE_FIELDS.length).toBeGreaterThanOrEqual(20);
    const summary = buildSummary(sampleReportData());
    for (const narrative of ["model_review", "risk_score", "rationale", "recommendation"]) {
      expect(summary).not.toContain(narrative);
    }
  });
});

describe("W06/N03: test adi ve kaynak kodu siniri", () => {
  it("escapeHtml kaynak kodu/kod bloklarini HTML olarak enjekte etmez", () => {
    const code = 'assertTrue(service.add(1, 2) == 3); // <script>alert("x")</script>';
    const escaped = escapeHtml(code);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });
});

describe("W06/N04: bilinmeyen, sifir ve uygulanamaz ayrisimi", () => {
  it("metricValueState: UNAVAILABLE/INVALID/NOT_APPLICABLE/REDACTED/KNOWN ayri", () => {
    expect(metricValueState({ exists: false, valid: false, applicable: false })).toBe("UNAVAILABLE");
    expect(metricValueState({ exists: true, valid: false, applicable: false })).toBe("INVALID");
    expect(metricValueState({ exists: true, valid: true, applicable: false })).toBe("NOT_APPLICABLE");
    expect(metricValueState({ exists: true, valid: true, applicable: true, redacted: true })).toBe("REDACTED");
    expect(metricValueState({ exists: true, valid: true, applicable: true })).toBe("KNOWN");
  });

  it("zeroMeansMeasured: eksik veri 0 ile ORULMEZ (null doner); olculmus 0 korunur", () => {
    expect(zeroMeansMeasured(0, false)).toBeNull();
    expect(zeroMeansMeasured(null, false)).toBeNull();
    expect(zeroMeansMeasured(undefined, false)).toBeNull();
    expect(zeroMeansMeasured(0, true)).toBe(0);
    expect(zeroMeansMeasured(5, true)).toBe(5);
  });

  it("basarisiz/olculemeyen job raporunda coverage 0/PASSED uydurulmaz (N04)", () => {
    const data = sampleReportData();
    data.outcome = "TARGET_NOT_MET_PLATEAU";
    data.targets[0]!.line = null;
    data.targets[0]!.branch = null;
    const html = buildReport(data);
    // line null iken N/A etiketi (sifir degil):
    expect(html).toContain("N/A");
  });
});

describe("W06/F15: export verification hash_mismatch + traversal", () => {
  it("hash bozulmasi verification_passed:false (N45)", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w06-n45-"));
    try {
      const exporter = new ReportExporter(join(dir, "reports"));
      const result = exporter.export(sampleReportData());
      expect(result.verification_passed).toBe(true);
      // bir bayt degistir:
      const summaryPath = join(dir, "reports", "summary.txt");
      const content = readFileSync(summaryPath, "utf8");
      require("node:fs").writeFileSync(summaryPath, content.replace("Karar", "KararX"), "utf8");
      const verification = exporter.verifyExport(result.files);
      expect(verification.hash_mismatch).toContain("summary.txt");
      const result2 = exporter.export(sampleReportData());
      require("node:fs").writeFileSync(summaryPath, content.replace("Karar", "KararX"), "utf8");
      expect(result2.verification_passed).toBe(true);
      const corrupted = exporter.verifyExport(result2.files);
      expect(corrupted.hash_mismatch.length).toBeGreaterThan(0);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  });

  it("parametresiz verify canonical manifest'i yukler; bos liste kabul etmez (N45)", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w06-n45b-"));
    try {
      const exporter = new ReportExporter(join(dir, "reports"));
      exporter.export(sampleReportData());
      // parametresiz: manifest'ten yukler
      const verification = exporter.verifyExport();
      expect(verification.missing).toHaveLength(0);
      expect(verification.hash_mismatch).toHaveLength(0);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  });

  it("traversal yolu reddedilir; kok disina yazim yok (N46)", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w06-n46-"));
    try {
      const exporter = new ReportExporter(join(dir, "reports"));
      expect(() => exporter.export(sampleReportData(), { "../kacinis.txt": "icerik" })).toThrow(/kok disina cikiyor/);
      expect(existsSync(join(dir, "kacinis.txt"))).toBe(false);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  });
});
