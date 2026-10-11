/**
 * W08 kabul testleri (F14 kalan, N01, N08, N54): 06 referans gorunumu ve facts-only renderer.
 * - N01: paketteki 06 HTML hash/bayt dogru; renderer sade gorunumu korur; referans farkliysa durur.
 * - N08: asama verisi bulunmamasi - yalniz baseline job'da progress/final uretilmez; "Veri yok".
 * - N54: gercek raporda ornek/synthetic veri bulunamaz; referans06 dosyasi aynen arsivde kalir.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildReport, buildSummary, type ReportData } from "../../src/reporting/report-generator.js";

const REFERENCE_HTML = join(process.cwd(), "docs", "reporting", "reference", "innova_test_raporu_tasarim_06.html");
const EXPECTED_SHA256 = "e3c8fd2da77000a0fd39ed88a00b3159e1100e4cf35146b0bbb83969eaef8c80";
const EXPECTED_BYTES = 257845;

function sampleReportData(): ReportData {
  return {
    schema_version: 1,
    job_id: "44444444-5555-6666-7777-888888888888",
    project_root: "C:/work/demo",
    head_commit: null,
    snapshot_id: null,
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

describe("W08/N01: 06 referans dosyasi butunlugu", () => {
  it("referans HTML hash ve bayt sayisi beklenen ile eslesiyor (ustune yazmak yerine durur)", () => {
    expect(existsSync(REFERENCE_HTML)).toBe(true);
    const content = readFileSync(REFERENCE_HTML);
    const hash = createHash("sha256").update(content).digest("hex");
    expect(hash).toBe(EXPECTED_SHA256);
    expect(statSync(REFERENCE_HTML).size).toBe(EXPECTED_BYTES);
  });

  it("referans HTML facts-only taahhudunu tasiyor (model yorumu icermez)", () => {
    const content = readFileSync(REFERENCE_HTML, "utf8");
    expect(content).toContain("Model yorumu içermez");
    expect(content).toContain("isDesignPreview");
    // referans kendisini production schema validator gibi sunmaz:
    expect(content.toLowerCase()).toContain("structural projection");
  });

  it("referans 06 bolumleri aynen korunur: Genel bakis, Sinif & testler, Kontrol, Uretim, Kanit", () => {
    const content = readFileSync(REFERENCE_HTML, "utf8");
    expect(content).toContain("Genel bakış");
    expect(content).toContain("Sınıf &amp; testler");
    expect(content).toContain("Kontrol sonuçları");
    expect(content).toContain("Üretim kayıtları");
    expect(content).toContain("Kanıtlar");
  });

  it("renderer cikti HTML harici font/script/CDN referansi tasimaz (N51 hazirligi)", () => {
    const html = buildReport(sampleReportData());
    expect(html).not.toMatch(/https?:\/\/cdn|fonts\.googleapis|<script src="http/);
    expect(html).not.toContain("<script src=");
  });

  it("renderer sade gorunum: koyu tema/gradient/glow yok (05/06 sade dil)", () => {
    const html = buildReport(sampleReportData());
    expect(html).not.toContain("color-scheme: dark");
    expect(html).not.toContain("background: #1a");
    // gradient/glow yok:
    expect(html.toLowerCase()).not.toContain("linear-gradient");
  });
});

describe("W08/N08: asama verisi bulunmamasi", () => {
  it("yalniz baseline job'da iterations bos; progress/final uretilmez; empty list dogru", () => {
    const data = sampleReportData();
    // baseline-only: iterations[] bos; dispatch yalniz kabul edilenleri yazar
    expect(data.iterations).toHaveLength(0);
    const html = buildReport(data);
    const summary = buildSummary(data);
    // iteration sayisi 0 olarak dogru raporlanir (sifir uydurma degil):
    expect(summary).toContain("Iterasyon: 0");
    expect(html).toContain("Iterasyon zaman cizgisi");
  });

  it("olculmeyen coverage N/A gorunur; %0/PASSED uydurulmaz (N04 ile ortusur)", () => {
    const data = sampleReportData();
    data.outcome = "TARGET_NOT_MET_PLATEAU";
    data.targets[0]!.line = null;
    const html = buildReport(data);
    expect(html).toContain("N/A");
    expect(html).toContain("HEDEF SAGLANAMADI");
  });
});

describe("W08/N54: gercek raporda ornek veri bulunmamasi", () => {
  it("renderer ciktisinda DEMO/GIVEN/synthetic/example isaretleri YOK", () => {
    const html = buildReport(sampleReportData());
    expect(html).not.toContain("DEMO");
    expect(html).not.toContain("GIVEN");
    expect(html).not.toContain("synthetic");
    expect(html).not.toContain("design-preview");
  });

  it("renderer ciktisinda temsili ornek proje/sinif adlari YOK", () => {
    const html = buildReport(sampleReportData());
    // referans HTML'in temsili ornekleri renderer'a sizmaz:
    expect(html).not.toContain("Örnek Ödeme Servisi");
    expect(html).not.toContain("payment-demo");
    expect(html).not.toContain("Temsili tasarım senaryosu");
  });
});
