import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReport06 } from "../../src/reporting/report06-renderer.js";
import { ReportExporter, type ReportData } from "../../src/reporting/report-generator.js";
import { collectAcceptedChangeEvidence, collectFinalReplayEvidence } from "../../src/reporting/evidence-collector.js";

const sha = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");

function reportData(): ReportData {
  return {
    schema_version: 1,
    job_id: "job-p07b-001",
    project_root: "C:/work/customer",
    head_commit: "abc123",
    snapshot_id: "snapshot-001",
    outcome: "TARGET_REACHED",
    verification_scope: "AFFECTED_SCOPE",
    apply_state: "READY_FOR_REVIEW",
    targets: [],
    iterations: [],
    tests_added: 2,
    tests_modified: 1,
    run_summary: { total: 4, passed: 4, failed: 0, skipped: 0 },
    gates: [{ name: "final_replay", status: "PASSED", detail: "final replay dogrulandi" }],
    gaps: [],
    models: [],
    production_changed_files: 0,
    generated_at: Date.now(),
    final_run_id: "run-final-001",
    checkpoint_id: "checkpoint-001",
    stages: [
      { name: "baseline", status: "KNOWN", run_id: "run-baseline-001", run_summary: { total: 2, passed: 2, failed: 0, skipped: 0 } },
      { name: "progress", status: "KNOWN", run_id: "run-candidate-001", run_summary: { total: 3, passed: 3, failed: 0, skipped: 0 } },
      { name: "final", status: "KNOWN", run_id: "run-final-001", run_summary: { total: 4, passed: 4, failed: 0, skipped: 0 } },
    ],
    evidence: [
      {
        relative_path: "evidence/final-replay/jacoco.xml",
        kind: "jacoco_xml",
        stage: "final_replay",
        run_id: "run-final-001",
        required: true,
      },
    ],
  };
}

describe("P07-B Report06 renderer", () => {
  it("gercek facts ile Report06 bolumlerini ve uc asamayi uretir", () => {
    const html = buildReport06(reportData());
    expect(html).toContain('data-report-revision="06"');
    expect(html).toContain('id="overview"');
    expect(html).toContain('id="classes"');
    expect(html).toContain('id="quality"');
    expect(html).toContain('id="ai"');
    expect(html).toContain('id="evidence"');
    expect(html).toContain('id="print-view"');
    expect(html).toContain("job-p07b-001");
    expect(html).toContain("baseline");
    expect(html).toContain("progress");
    expect(html).toContain("final");
    expect(html).not.toContain("payment-demo");
    expect(html).not.toContain("Temsili");
    expect(html).not.toContain("Örnek Ödeme");
    expect(html).not.toContain("design-preview");
  });
});

describe("P07-B evidence export", () => {
  it("evidence metadata, identity, binary bytes ve PUBLISHED marker'i korur", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-p07b-export-"));
    try {
      const exporter = new ReportExporter(join(root, "reports"));
      const binary = Buffer.from([0, 1, 127, 128, 255]);
      const result = exporter.export(reportData(), { "evidence/final-replay/jacoco.xml": binary });
      expect(result.verification_passed).toBe(true);
      expect(readFileSync(join(root, "reports", "index.html"), "utf8")).toContain('data-report-template="report07"');
      expect(readFileSync(join(root, "reports", "evidence", "final-replay", "jacoco.xml"))).toEqual(binary);
      expect(readFileSync(join(root, "reports", "PUBLISHED"), "utf8")).toContain("job-p07b-001");

      const manifest = JSON.parse(readFileSync(join(root, "reports", "manifest.json"), "utf8")) as {
        job_id: string;
        run_ids: string[];
        checkpoint_id: string;
        artifacts: Array<{ relative_path: string; kind: string; run_id?: string | null; bytes: number; sha256: string }>;
      };
      expect(manifest.job_id).toBe("job-p07b-001");
      expect(manifest.run_ids).toContain("run-final-001");
      expect(manifest.checkpoint_id).toBe("checkpoint-001");
      expect(manifest.artifacts).toContainEqual(expect.objectContaining({
        relative_path: "evidence/final-replay/jacoco.xml",
        kind: "jacoco_xml",
        run_id: "run-final-001",
        bytes: binary.length,
        sha256: sha(binary),
      }));

      const json = JSON.parse(readFileSync(join(root, "reports", "report.json"), "utf8")) as ReportData;
      expect(json.evidence?.[0]).toMatchObject({ relative_path: "evidence/final-replay/jacoco.xml", bytes: binary.length, sha256: sha(binary) });

      manifest.job_id = "another-job";
      writeFileSync(join(root, "reports", "manifest.json"), JSON.stringify(manifest), "utf8");
      expect(exporter.verifyExport().missing.join(" ")).toContain("job_id");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("zorunlu kanit eksiginde export basarili sayilmaz", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-p07b-missing-"));
    try {
      const exporter = new ReportExporter(join(root, "reports"));
      const result = exporter.export(reportData());
      expect(result.verification_passed).toBe(false);
      expect([...result.missing_files, ...result.hash_mismatch].join(" ")).toContain("evidence/final-replay/jacoco.xml");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("tampanilmis manifest PUBLISHED marker'i artifact olarak tasidiginda fail-closed kalir", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-p07b-reserved-"));
    try {
      const reportsDir = join(root, "reports");
      const exporter = new ReportExporter(reportsDir);
      const binary = Buffer.from([0, 1, 127, 128, 255]);
      const result = exporter.export(reportData(), { "evidence/final-replay/jacoco.xml": binary });
      expect(result.verification_passed).toBe(true);

      const manifest = JSON.parse(readFileSync(join(reportsDir, "manifest.json"), "utf8")) as {
        artifacts: Array<{ relative_path: string; sha256: string; bytes: number; kind: string }>;
      };
      // Temiz export PUBLISHED'i normal artifact olarak listelemez.
      expect(manifest.artifacts.filter((artifact) => artifact.relative_path === "PUBLISHED")).toHaveLength(0);
      const published = readFileSync(join(reportsDir, "PUBLISHED"), "utf8");
      manifest.artifacts.push({
        relative_path: "PUBLISHED",
        sha256: sha(published),
        bytes: published.byteLength,
        kind: "extra",
      });
      writeFileSync(join(reportsDir, "manifest.json"), JSON.stringify(manifest), "utf8");

      // PUBLISHED atomik yayin marker'idir; dosya var ve hash/bytes eslesse bile
      // normal artifact listesinde gorunemez (PP40 reserved path).
      const verification = exporter.verifyExport();
      expect(verification.missing.some((entry) => entry.includes("reserved path: PUBLISHED"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("P07-B final replay collector", () => {
  it("JaCoCo, Surefire, log ve binary asset'i gerçek workspace'ten toplar", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-p07b-collector-"));
    try {
      const workspace = join(root, "workspace");
      const jacoco = join(workspace, "module-a", "target", "site", "jacoco");
      const surefire = join(workspace, "module-a", "target", "surefire-reports");
      const logs = join(workspace, "target", "aitest-final-replay-logs");
      const binary = Buffer.from([0, 127, 128, 255]);
      mkdirSync(jacoco, { recursive: true });
      mkdirSync(surefire, { recursive: true });
      mkdirSync(logs, { recursive: true });
      writeFileSync(join(jacoco, "jacoco.xml"), "<report sessioninfo='ok'/>", { encoding: "utf8" });
      writeFileSync(join(jacoco, "jacoco.exec"), binary);
      writeFileSync(join(surefire, "TEST-A.xml"), "<testsuite tests='1' failures='0' errors='0' skipped='0'/>", { encoding: "utf8" });
      writeFileSync(join(logs, "maven-stdout.log"), "C:\\Users\\secret\\project sk-secretvalue123\n", { encoding: "utf8" });
      writeFileSync(join(logs, "maven-stderr.log"), "", { encoding: "utf8" });
      const collected = collectFinalReplayEvidence({
        workspace,
        module_paths: ["module-a"],
        run_id: "run-final-001",
        job_id: "job-p07b-001",
        stdout_log_path: join(logs, "maven-stdout.log"),
        stderr_log_path: join(logs, "maven-stderr.log"),
        home_dir: "C:\\Users\\secret",
      });
      const jacocoEntry = collected.files.find((file) => file.relative_path.endsWith("jacoco.xml"));
      const execEntry = collected.files.find((file) => file.relative_path.endsWith("jacoco.exec"));
      const logEntry = collected.files.find((file) => file.relative_path.endsWith("stdout.log"));
      expect(jacocoEntry?.content).toEqual(Buffer.from("<report sessioninfo='ok'/>", "utf8"));
      expect(execEntry?.content).toEqual(binary);
      expect(String(logEntry?.content)).not.toContain("sk-secretvalue123");
      expect(collected.missing).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepted test kaynagi ve patch metadata'sini redacted olarak uretir", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-p07b-accepted-"));
    try {
      const project = join(root, "project");
      const accepted = join(root, "accepted");
      mkdirSync(join(project, "src", "test", "java"), { recursive: true });
      mkdirSync(join(accepted, "src", "test", "java"), { recursive: true });
      writeFileSync(join(project, "src", "test", "java", "XTest.java"), "class XTest { }\n", "utf8");
      writeFileSync(join(accepted, "src", "test", "java", "XTest.java"), "class XTest { String token=sk-secretvalue123; }\n", "utf8");
      const collected = collectAcceptedChangeEvidence({
        project_root: project,
        accepted_dir: accepted,
        job_id: "job-p07b-001",
        checkpoint_id: "checkpoint-001",
        changes: [{ path: "src/test/java/XTest.java", sha256: sha("class XTest { String token=sk-secretvalue123; }\n"), action: "modify" }],
        before_sha256_by_path: new Map([["src/test/java/XTest.java", sha("class XTest { }\n")]]),
        home_dir: "C:\\Users\\secret",
      });
      expect(collected.missing).toEqual([]);
      expect(collected.files.map((file) => file.relative_path)).toEqual([
        "evidence/accepted/changes.patch",
        "evidence/accepted/patch-metadata.json",
        "evidence/accepted/src/test/java/XTest.java",
      ]);
      expect(String(collected.files.find((file) => file.relative_path.endsWith("XTest.java"))?.content)).not.toContain("sk-secretvalue123");
      expect(String(collected.files.find((file) => file.relative_path.endsWith("changes.patch"))?.content)).toContain("XTest");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("NUL icermeyen binary accepted kaniti byte-exact korur", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-p07b-accepted-binary-"));
    try {
      const project = join(root, "project");
      const accepted = join(root, "accepted");
      mkdirSync(project, { recursive: true });
      mkdirSync(accepted, { recursive: true });
      const binary = Buffer.from([1, 2, 3, 127, 128, 255]);
      writeFileSync(join(accepted, "coverage.bin"), binary);
      const collected = collectAcceptedChangeEvidence({
        project_root: project,
        accepted_dir: accepted,
        job_id: "job-p07b-001",
        checkpoint_id: "checkpoint-001",
        changes: [{ path: "coverage.bin", sha256: sha(binary), action: "create" }],
      });
      const entry = collected.files.find((file) => file.relative_path === "evidence/accepted/coverage.bin");
      expect(collected.missing).toEqual([]);
      expect(entry?.content).toEqual(binary);
      expect(entry?.redacted).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
