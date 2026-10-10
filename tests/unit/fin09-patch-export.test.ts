/**
 * FIN09: Report projection, binary-safe export, patch artifact ve redaction testleri.
 * - PATCH_ONLY sonucunda gercek uygulanabilir patch + hash'li dosyalar + stale risk notu (B11/16.1).
 * - Redacted destek paketi: source bodies/auth/endpoint/tam user path tasmaz (15.4).
 * - Binary-safe: bayt-hash birebir (RT24).
 */
import { describe, it, expect } from "vitest";
import { buildUnifiedDiff, buildPatchArtifact, redactSensitive, redactUserPath, sha256Hex } from "../../src/reporting/patch-artifact.js";
import { escapeHtml, buildReport, type ReportData } from "../../src/reporting/report-generator.js";

describe("FIN09: patch artifact (B11/16.1)", () => {
  it("unified diff a/b prefix ve satir sayisi ile uretilir", () => {
    const diff = buildUnifiedDiff([{ path: "src/test/java/X.java", before: null, after: "package p;\npublic class X {}\n" }]);
    expect(diff).toContain("--- a/src/test/java/X.java");
    expect(diff).toContain("+++ b/src/test/java/X.java");
    expect(diff).toContain("+package p;");
  });

  it("patch artifact hash'li test dosyalari ve stale risk notu tasir", () => {
    const content = "package p;\npublic class NewTest {}\n";
    const artifact = buildPatchArtifact({
      job_id: "job-1",
      checkpoint_id: "ckpt-1",
      files: [{ path: "src/test/java/NewTest.java", action: "create", before: null, after: content }],
    });
    expect(artifact.patch_sha256).toHaveLength(64);
    expect(artifact.patch_sha256).toBe(sha256Hex(artifact.unified_diff));
    expect(artifact.files).toHaveLength(1);
    expect(artifact.files[0]!.after_sha256).toBe(sha256Hex(content));
    expect(artifact.stale_risk_note).toContain("CONFLICT");
  });

  it("modify icin expected-before hash saklanir (16.3)", () => {
    const before = "eski icerik\n";
    const after = "yeni icerik\n";
    const artifact = buildPatchArtifact({
      job_id: "job-1",
      checkpoint_id: null,
      files: [{ path: "src/test/java/X.java", action: "modify", before, after }],
    });
    expect(artifact.files[0]!.before_sha256).toBe(sha256Hex(before));
    expect(artifact.files[0]!.after_sha256).toBe(sha256Hex(after));
  });
});

describe("FIN09: export gizlilik/redaction (15.4)", () => {
  it("API key sk- prefix redacted edilir; gizli deger hicbir koysda kalmaz", () => {
    const redacted = redactSensitive("apiKey=sk-abcdef1234567890abcdef ve Bearer eyJhbGciOiJIUz");
    expect(redacted).not.toContain("sk-abcdef");
    expect(redacted).not.toContain("eyJhbGciOiJIUz");
    expect(redacted).toContain("[REDACTED]");
  });

  it("password/secret/token atamalari redacted edilir", () => {
    const redacted = redactSensitive("password=hunter2; secret=abc123");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("abc123");
  });

  it("tam user path [HOME] ile redacted edilir", () => {
    const redacted = redactUserPath("C:\\Users\\mkaracan\\.config\\opencode\\opencode.json", "C:\\Users\\mkaracan");
    expect(redacted).not.toContain("mkaracan");
    expect(redacted).toContain("[HOME]");
  });

  it("dizin disi yol aynen kalir", () => {
    expect(redactUserPath("C:/prj/fixture/src/X.java", "C:\\Users\\mkaracan")).toBe("C:/prj/fixture/src/X.java");
  });
});

describe("FIN09: HTML guvenligi korunur (RT24/PRO19)", () => {
  it("tum untrusted icerik escape edilir; nested payload calismaz", () => {
    const data = {
      schema_version: 1,
      job_id: "job-1",
      project_root: "C:/work",
      head_commit: null,
      snapshot_id: null,
      outcome: "TARGET_REACHED",
      verification_scope: "AFFECTED_SCOPE",
      apply_state: "READY_FOR_REVIEW",
      targets: [{
        target_id: "t1",
        selector: '<script>alert(1)</script>',
        fqn: "<img src=x onerror=alert(1)>",
        line: null,
        branch: null,
      }],
      iterations: [],
      tests_added: 0,
      tests_modified: 0,
      run_summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      gates: [],
      gaps: [],
      models: [],
      production_changed_files: 0,
      generated_at: Date.now(),
    } satisfies ReportData;
    const html = buildReport(data);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x onerror");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapeHtml quote'lar da kapsar", () => {
    expect(escapeHtml('"quoted" \'single\'')).toContain("&quot;");
    expect(escapeHtml("'")).toContain("&#39;");
  });
});
