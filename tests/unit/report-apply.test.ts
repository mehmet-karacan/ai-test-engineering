import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { escapeHtml, stripAnsi, ReportExporter, buildReport, buildSummary, assertReportConsistent, type ReportData } from "../../src/reporting/report-generator.js";
import { TestApplyService, defaultApplyConfig, type ApplyRequest } from "../../src/reporting/test-apply.js";

const sha = (data: string) => createHash("sha256").update(data).digest("hex");

function sampleReportData(): ReportData {
  return {
    schema_version: 1,
    job_id: "11111111-2222-3333-4444-555555555555",
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
        branch: { covered: 5, missed: 5, total: 10, bps: 5000, target_bps: 9000, met: false, validity: "OK" },
      },
    ],
    iterations: [{ ordinal: 1, strategy: "new_scenario_inputs", decision: "adopted", reason: "kazanc", coverage_before_bps: 7000, coverage_after_bps: 9000 }],
    tests_added: 2,
    tests_modified: 1,
    run_summary: { total: 8, passed: 8, failed: 0, skipped: 0 },
    gates: [{ name: "test_only_policy", status: "PASSED", detail: "production degisikligi 0" }],
    gaps: [],
    models: [{ role: "test_designer", provider: "litellm", model: "kurum/model-1" }],
    production_changed_files: 0,
    generated_at: Date.now(),
  };
}

describe("HTML guvenligi (AC41/AC43 hazirligi)", () => {
  it("escapeHtml XSS payload'i etkisiz hale getirmeli", () => {
    const escaped = escapeHtml('<script>alert("x")</script>');
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("stripAnsi terminal escape karakterlerini temizlemeli", () => {
    const cleaned = stripAnsi("\x1b[31mKirmizi\x1b[0m normal \x1b]0;title\x07");
    expect(cleaned).not.toContain("\x1b");
    expect(cleaned).toContain("Kirmizi");
  });

  it("rapor HTML'inde model metni ham gecmemeli", () => {
    const data = sampleReportData();
    data.gaps.push({ gap_key: '<img src=x onerror=alert(1)>', blocker: "UNKNOWN", attempted: [] });
    const html = buildReport(data);
    expect(html).not.toContain("<img src=x onerror");
    expect(html).toContain("&lt;img src=x onerror");
  });

  it("harici font/script/CDN referansi olmamali (AC62)", () => {
    const html = buildReport(sampleReportData());
    expect(html).not.toMatch(/https?:\/\/cdn|fonts\.googleapis|<script src="http/);
    expect(html).not.toContain("<script src=");
  });
});

describe("ReportExporter (AC61/AC63)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-export-"));
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("report.json/index.html/summary.txt/manifest.json uretmeli", () => {
    const exporter = new ReportExporter(join(dir, "reports"));
    const result = exporter.export(sampleReportData());
    expect(result.verification_passed).toBe(true);
    expect(existsSync(join(dir, "reports", "report.json"))).toBe(true);
    expect(existsSync(join(dir, "reports", "index.html"))).toBe(true);
    expect(existsSync(join(dir, "reports", "summary.txt"))).toBe(true);
    expect(existsSync(join(dir, "reports", "manifest.json"))).toBe(true);
  });

  it("basarisiz/blocked job'da da rapor uretilmeli; coverage uydurulmaz (AC63)", () => {
    const data = sampleReportData();
    data.outcome = "TARGET_NOT_MET_PLATEAU";
    data.targets[0]!.line = null;
    data.targets[0]!.branch = null;
    const exporter = new ReportExporter(join(dir, "reports-failed"));
    const result = exporter.export(data);
    expect(result.verification_passed).toBe(true);
    const report = JSON.parse(readFileSync(join(dir, "reports-failed", "report.json"), "utf8")) as ReportData;
    expect(report.outcome).toBe("TARGET_NOT_MET_PLATEAU");
    expect(report.targets[0]!.line).toBeNull();
  });

  it("manifest.json'daki hash'ler dosyalarla uyumlu olmali", () => {
    const exporter = new ReportExporter(join(dir, "reports-manifest"));
    exporter.export(sampleReportData());
    const manifest = JSON.parse(readFileSync(join(dir, "reports-manifest", "manifest.json"), "utf8")) as { artifacts: Array<{ relative_path: string; sha256: string }> };
    for (const artifact of manifest.artifacts) {
      const content = readFileSync(join(dir, "reports-manifest", artifact.relative_path));
      expect(sha(content.toString("utf8"))).toBe(artifact.sha256);
    }
  });

  it("dosya silinmis export verification yakalamali", () => {
    const exporter = new ReportExporter(join(dir, "reports-verify"));
    const result = exporter.export(sampleReportData());
    rmSync(join(dir, "reports-verify", "summary.txt"), { force: true });
    const verification = exporter.verifyExport(result.files);
    expect(verification.missing).toContain("summary.txt");
  });

  it("assertReportConsistent DB ile ayni bilgiyi dogrulamali (AC61)", () => {
    const exporter = new ReportExporter(join(dir, "reports-consistent"));
    const data = sampleReportData();
    exporter.export(data);
    expect(() => assertReportConsistent(data, join(dir, "reports-consistent"))).not.toThrow();
  });
});

describe("TestApplyService (AC57-AC60)", () => {
  let dir: string;
  let workspace: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-apply-"));
    workspace = join(dir, "workspace");
    cpFixture(workspace);
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  function cpFixture(target: string): void {
    const fixture = join(process.cwd(), "tests", "fixtures", "sample-maven-project");
    mkdirSync(target, { recursive: true });
    for (const rel of ["pom.xml", "src/main/java/com/example/payment/PaymentService.java", "src/test/java/com/example/payment/PaymentServiceTest.java"]) {
      const source = join(fixture, rel.replace(/\//g, "\\"));
      const dest = join(target, rel.replace(/\//g, "\\"));
      mkdirSync(join(dest, ".."), { recursive: true });
      writeFileSync(dest, readFileSync(source));
    }
  }

  function applyRequest(): ApplyRequest {
    const content = "package com.example.payment;\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertTrue;\npublic class NewTest { @Test\n public void works() { assertTrue(1 + 1 == 2); } }\n";
    return {
      job_id: "job-1",
      checkpoint_id: "ckpt-1",
      patch_digest: sha(content),
      target_workspace: workspace,
      approval_reference: "onay-ref-12345",
      changes: [{ path: "src/test/java/com/example/payment/NewTest.java", action: "create", new_content: content, patch_digest: sha(content), expected_before_hash: null }],
    };
  }

  const roots = [{ module_relative_path: "", test_root: "src/test/java" }];

  it("apply kapali iken reddetmeli (AC57)", () => {
    const service = new TestApplyService(workspace, roots, defaultApplyConfig());
    expect(() => service.apply(applyRequest())).toThrow();
    try {
      service.apply(applyRequest());
    } catch (error) {
      expect((error as { details?: { reason_code?: string } }).details?.reason_code).toBe("APPLY_DISABLED");
    }
    expect(existsSync(join(workspace, "src", "test", "java", "com", "example", "payment", "NewTest.java"))).toBe(false);
  });

  it("onay ile APPLIED olmali ve dosya yazilmali", () => {
    const service = new TestApplyService(workspace, roots, { allow_workspace_apply: true, trusted_approval_adapters: ["test"] });
    const result = service.apply(applyRequest());
    expect(result.state).toBe("APPLIED");
    expect(existsSync(join(workspace, "src", "test", "java", "com", "example", "payment", "NewTest.java"))).toBe(true);
    expect(result.journal_path).toContain("journal");
  });

  it("production path degisikligi REJECTED olmali (AC31/AC57)", () => {
    const service = new TestApplyService(workspace, roots, { allow_workspace_apply: true, trusted_approval_adapters: ["test"] });
    const request = applyRequest();
    request.changes = [{ path: "src/main/java/com/example/payment/PaymentService.java", action: "modify", new_content: "hacked", patch_digest: sha("hacked") }];
    const result = service.apply(request);
    expect(result.state).toBe("REJECTED");
  });

  it("patch digest uyusmazligi CONFLICT donmeli (AC58 hazirligi)", () => {
    const service = new TestApplyService(workspace, roots, { allow_workspace_apply: true, trusted_approval_adapters: ["test"] });
    const request = applyRequest();
    request.changes[0]!.patch_digest = sha("baska-icerik");
    const result = service.apply(request);
    expect(result.state).toBe("CONFLICT");
  });

  it("tekrar apply idempotent; sonuc ayni dosyaya yazilir (AC60)", () => {
    const service = new TestApplyService(workspace, roots, { allow_workspace_apply: true, trusted_approval_adapters: ["test"] });
    const request = applyRequest();
    const first = service.apply(request);
    expect(first.state).toBe("APPLIED");
    const second = service.apply(request);
    expect(second.state).toBe("APPLIED");
    expect(service.verifyApplied(request)).toBe(true);
    const journal = readFileSync(second.journal_path, "utf8");
    expect(journal).toContain("applied");
  });

  it("sonradan degisen dosya preimage backup'a alinir; overwrite raporlanir (AC58)", () => {
    const service = new TestApplyService(workspace, roots, { allow_workspace_apply: true, trusted_approval_adapters: ["test"] });
    const request = applyRequest();
    const existingPath = join(workspace, "src", "test", "java", "com", "example", "payment", "PaymentServiceTest.java");
    const original = readFileSync(existingPath, "utf8");
    const modified = original + "\n// kullanici degisikligi\n";
    writeFileSync(existingPath, modified, "utf8");

    // expected-before GUNCEL (modified) hash; boylece preimage backup + APPLIED (RG46 CONFLICT yolunda ayri test):
    request.changes = [{ path: "src/test/java/com/example/payment/PaymentServiceTest.java", action: "modify", new_content: "yeni icerik", patch_digest: sha("yeni icerik"), expected_before_hash: sha(modified) }];
    const result = service.apply(request);
    expect(result.state).toBe("APPLIED");
    const backupFiles = readdirSync(service.applyBackupDir()) as string[];
    expect(backupFiles.length).toBeGreaterThan(0);
    const journal = readFileSync(result.journal_path, "utf8");
    expect(journal).toContain("backup");
    expect(journal).toContain("preimage_sha");
  });

  it("expected-before uyusmazligi (kullanici arada degistirdi) CONFLICT donmeli (RG46)", () => {
    const service = new TestApplyService(workspace, roots, { allow_workspace_apply: true, trusted_approval_adapters: ["test"] });
    const request = applyRequest();
    const existingPath = join(workspace, "src", "test", "java", "com", "example", "payment", "PaymentServiceTest.java");
    const original = readFileSync(existingPath, "utf8");
    // beklenen hash eski; kullanici sonra degistiriyor:
    writeFileSync(existingPath, original + "\n// kullanici degisikligi\n", "utf8");

    request.changes = [{ path: "src/test/java/com/example/payment/PaymentServiceTest.java", action: "modify", new_content: "yeni icerik", patch_digest: sha("yeni icerik"), expected_before_hash: sha(original) }];
    const result = service.apply(request);
    expect(result.state).toBe("CONFLICT");
    // kullanici degisikligi korunur (ezilmez):
    expect(readFileSync(existingPath, "utf8")).toContain("kullanici degisikligi");
  });
});
