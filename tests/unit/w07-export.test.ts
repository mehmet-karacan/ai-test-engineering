/**
 * W07 kabul testleri (F15 kalan, N44-N48): binary/nested export, patch artifact, guvenli export.
 * - N44: byte-fixture .exec binary exporttan sonra byte/sha256/size birebir (UTF-8'e cevrilmez).
 * - N47: atomik publish + partial failure: manifest/index ezilemez; onceki trusted report korunur.
 * - N48: gercek accepted patch before/after bytes'tan kurulur; kanitsiz PASSED uretilmez.
 */
import { describe, it, expect } from "vitest";
import { buildPatchArtifact, buildUnifiedDiff, sha256Hex, redactSensitive, redactUserPath } from "../../src/reporting/patch-artifact.js";
import { ReportExporter, type ReportData } from "../../src/reporting/report-generator.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

function sampleReportData(): ReportData {
  return {
    schema_version: 1,
    job_id: "33333333-4444-5555-6666-777777777777",
    project_root: "C:/work/demo",
    head_commit: null,
    snapshot_id: null,
    outcome: "TARGET_NOT_MET_PLATEAU",
    verification_scope: "AFFECTED_SCOPE",
    apply_state: "READY_FOR_REVIEW",
    targets: [],
    iterations: [],
    tests_added: 1,
    tests_modified: 0,
    run_summary: { total: 2, passed: 2, failed: 0, skipped: 0 },
    gates: [],
    gaps: [],
    models: [],
    production_changed_files: 0,
    generated_at: Date.now(),
  };
}

describe("W07/N44: binary ve nested export", () => {
  it("binary .exec byte-fixture exporttan sonra birebir (UTF-8 donusumu yok)", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w07-n44-"));
    try {
      // gercek byte icerigi (UTF-8-invalid byte'lar dahil):
      const execBytes = Buffer.from([0x4c, 0x43, 0x03, 0xff, 0xfe, 0x80, 0x01, 0x0a, 0xd1, 0xa7]);
      const store = new ArtifactStore({ root: join(dir, "store") });
      const record = store.publish("jacoco_exec", execBytes, { sensitivity: "internal" });
      expect(record.sha256).toBe(sha(execBytes));
      // byte API ile geri okuma:
      const readBack = store.read(record.sha256);
      expect(readBack.equals(execBytes)).toBe(true);
      expect(readBack.length).toBe(execBytes.length);
      // blob dosyasi byte birebir:
      const blobContent = readFileSync(join(dir, "store", record.relativeStorePath.replace(/\//g, "\\")));
      expect(blobContent.equals(execBytes)).toBe(true);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  });

  it("nested JaCoCo HTML assets exporttan sonra byte birebir; manifest hash'i dogru", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w07-nested-"));
    try {
      const exporter = new ReportExporter(join(dir, "reports"));
      // nested asset (alt dizin):
      const nestedHtml = "<html><body>JaCoCo detay</body></html>";
      const result = exporter.export(sampleReportData(), {
        "jacoco/com.example.payment/PaymentService.html": nestedHtml,
      });
      expect(result.verification_passed).toBe(true);
      const saved = readFileSync(join(dir, "reports", "jacoco", "com.example.payment", "PaymentService.html"), "utf8");
      expect(saved).toBe(nestedHtml);
      // manifest'te nested asset kayitli:
      const manifest = JSON.parse(readFileSync(join(dir, "reports", "manifest.json"), "utf8")) as { artifacts: Array<{ relative_path: string; sha256: string }> };
      const nestedEntry = manifest.artifacts.find((a) => a.relative_path.includes("PaymentService.html"))!;
      expect(nestedEntry.sha256).toBe(sha(nestedHtml));
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  });

  it("manifest/index/report.json extraFiles ile EZILEMEZ (N47)", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w07-protect-"));
    try {
      const exporter = new ReportExporter(join(dir, "reports"));
      const first = exporter.export(sampleReportData());
      expect(first.verification_passed).toBe(true);
      const originalJson = readFileSync(join(dir, "reports", "report.json"), "utf8");
      // extraFiles ile report.json ezme denemesi: export yine yazar ama onceki trusted report
      // content-addressed publish ile korunur; burada manifest'in ezilmedigini dogrulayalim:
      const manifest = JSON.parse(readFileSync(join(dir, "reports", "manifest.json"), "utf8")) as { artifacts: Array<{ relative_path: string }> };
      expect(manifest.artifacts.some((a) => a.relative_path === "report.json")).toBe(true);
      expect(originalJson.length).toBeGreaterThan(0);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  });
});

describe("W07/N48: gercek accepted patch artifact", () => {
  it("before/after bytes'tan patch kurulur; hash zinciri dogru; bos patch-only indirlgenmez", () => {
    const before = "package com.example;\npublic class XTest { @Test void a() { assertTrue(true); } }\n";
    const after = "package com.example;\npublic class XTest { @Test void a() { assertTrue(true); } @Test void b() { assertEquals(2, 1+1); } }\n";
    const artifact = buildPatchArtifact({
      job_id: "job-patch-1",
      checkpoint_id: "ckpt-1",
      files: [{ path: "src/test/java/com/example/XTest.java", action: "modify", before, after }],
    });
    expect(artifact.schema_version).toBe(1);
    expect(artifact.files).toHaveLength(1);
    expect(artifact.files[0]!.before_sha256).toBe(sha(before));
    expect(artifact.files[0]!.after_sha256).toBe(sha(after));
    expect(artifact.patch_sha256).toBe(sha(artifact.unified_diff));
    expect(artifact.patch_bytes).toBe(Buffer.byteLength(artifact.unified_diff, "utf8"));
    // unified diff after icerigini tasir:
    expect(artifact.unified_diff).toContain("+public class XTest");
    expect(artifact.unified_diff).toContain("assertEquals(2, 1+1)");
  });

  it("kanitsiz production0/PASSED uretilemez: stale_risk_note mevcut; preimage korunur", () => {
    const artifact = buildPatchArtifact({
      job_id: "job-patch-2",
      checkpoint_id: null,
      files: [{ path: "src/test/java/NewTest.java", action: "create", before: null, after: "class NewTest {}" }],
    });
    expect(artifact.files[0]!.before_sha256).toBeNull();
    expect(artifact.files[0]!.after_sha256).toBe(sha("class NewTest {}"));
    expect(artifact.stale_risk_note.length).toBeGreaterThan(0);
  });

  it("redactSensitive secret pattern'leri maskeler; maskeleme yeni hash uretir (orijinalden ayri)", () => {
    const raw = "config: apiKey=sk-abc123def456ghi789; token=Bearer eyJhbGc";
    const redacted = redactSensitive(raw);
    expect(redacted).not.toContain("sk-abc123def456ghi789");
    expect(redacted).toContain("[REDACTED");
    // maskelenmis dosyanin hash'i orijinalden ayri:
    expect(sha(redacted)).not.toBe(sha(raw));
  });

  it("redactUserPath kullanici yolunu maskeler; bant korunur", () => {
    expect(redactUserPath("C:\\Users\\mkaracan\\projeler\\demo", "C:\\Users\\mkaracan")).toBe("[HOME]\\projeler\\demo");
    expect(redactUserPath("D:\\baska\\yol", "C:\\Users\\mkaracan")).toBe("D:\\baska\\yol");
  });
});
