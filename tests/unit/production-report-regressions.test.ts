import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PolicyGuard } from "../../src/policies/policy-guard.js";
import { projectAcceptedChanges } from "../../src/reporting/report-projection.js";
import { projectReport07Facts } from "../../src/reporting/report07-facts.js";
import { collectReport07BaselineEvidence } from "../../src/reporting/report07-evidence.js";
import { collectFinalReplayEvidence } from "../../src/reporting/evidence-collector.js";
import { report07Data, report07Evidence } from "../fixtures/report07-data.js";

describe("production report regressions", () => {
  const roots: string[] = [];
  const temporaryRoot = () => { const root = mkdtempSync(join(tmpdir(), "aitest-prod-report-")); roots.push(root); return root; };
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

  it("uses the policy's custom module test root for added, changed and production file counts", () => {
    const root = temporaryRoot();
    const testRoots = [{ module_relative_path: "custom", test_root: "custom/checks/unit" }];
    const changes = [
      { path: "custom/checks/unit/demo/CalculatorSpec.java", action: "create" },
      { path: "custom/checks/unit/demo/ExistingSpec.java", action: "modify" },
      { path: "custom/checks/unit/../production/DecoyTest.java", action: "create" },
      { path: "custom/src/main/java/ProductionTest.java", action: "modify" },
    ];
    expect(new PolicyGuard(root, testRoots).checkPath(changes[0]!.path).allowed).toBe(true);
    expect(projectAcceptedChanges(root, changes.slice(0, 2), testRoots)).toEqual({ tests_added: 1, tests_modified: 1, production_changed_files: 0 });
    expect(projectAcceptedChanges(root, changes.slice(2), testRoots)).toEqual({ tests_added: 0, tests_modified: 0, production_changed_files: 2 });
  });

  it("reconciles Report07 patch counts using the same recorded custom test roots", () => {
    const data = report07Data();
    data.test_roots = [{ module_relative_path: "custom", test_root: "custom/checks/unit" }];
    const path = "evidence/accepted/patch-metadata.json";
    const patch = JSON.stringify({ job_id: data.job_id, checkpoint_id: null, files: [{ path: "custom/checks/unit/demo/CalculatorSpec.java", action: "create" }] });
    data.evidence = [{ relative_path: path, kind: "patch", sha256: createHash("sha256").update(patch).digest("hex"), bytes: Buffer.byteLength(patch) }];
    expect(projectReport07Facts(data, { [path]: patch }).changes).toEqual({ status: "KNOWN", added: 1, modified: 0 });
  });

  it("does not traverse unrelated assets when collecting baseline XML only", () => {
    const root = temporaryRoot(), outside = temporaryRoot();
    const path = join(root, "target/site/jacoco/jacoco.xml");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "<report/>");
    // Final replay must reject a linked asset tree, but baseline only consumes
    // the hash-pinned XML and must not touch this unrelated tree at all.
    symlinkSync(outside, join(root, "target/site/jacoco/unrelated-assets"), process.platform === "win32" ? "junction" : "dir");
    const input = { workspace: root, module_paths: [""], run_id: "baseline", job_id: "job",
      stdout_log_path: join(root, "unused-out.log"), stderr_log_path: join(root, "unused-err.log"),
      expected_reports: [{ path, sha256: createHash("sha256").update("<report/>").digest("hex") }] };
    const evidence = collectReport07BaselineEvidence(input);
    expect(evidence.files).toHaveLength(1);
    expect(evidence.files[0]!.content.toString()).toBe("<report/>");
    expect(evidence.missing).toEqual([]);
    expect(() => collectFinalReplayEvidence(input)).toThrow(/symlink/i);
  });

  it("shows an omitted JaCoCo method BRANCH counter as not applicable while retaining LINE", () => {
    const data = report07Data(), files = report07Evidence(data), path = "evidence/final/jacoco.xml";
    files[path] = files[path]!.replace('<counter type="BRANCH" missed="0" covered="0"/>', "");
    // A branching class can contain a constructor/helper with no branches.
    files[path] = files[path]!.replace('<counter type="BRANCH" missed="0" covered="0"/>', '<counter type="BRANCH" missed="1" covered="1"/>');
    data.targets[0]!.branch = { covered: 1, missed: 1, total: 2, bps: 5000, target_bps: 8000, met: false, validity: "OK" };
    const entry = data.evidence!.find(e => e.relative_path === path)!;
    entry.sha256 = createHash("sha256").update(files[path]!).digest("hex"); entry.bytes = Buffer.byteLength(files[path]!);
    const facts = projectReport07Facts(data, files);
    expect(facts.methods).toHaveLength(1);
    expect(facts.methods[0]!.branch).toMatchObject({ status: "NOT_APPLICABLE", covered: 0, missed: 0, total: 0, bps: null });
    expect(facts.methods[0]!.line).toMatchObject({ status: "KNOWN", covered: 9, total: 10 });
  });

  it.each(["mismatch", "duplicate", "corrupt"])("keeps %s JaCoCo class evidence invalid instead of promoting omitted branches", variant => {
    const data = report07Data(), files = report07Evidence(data), path = "evidence/final/jacoco.xml";
    if (variant === "mismatch") files[path] = files[path]!.replaceAll('missed="1" covered="9"', 'missed="2" covered="8"');
    if (variant === "duplicate") files[path] = files[path]!.replace('</class>', '<counter type="BRANCH" missed="0" covered="0"/></class>');
    if (variant === "corrupt") files[path] = "<report>";
    const entry = data.evidence!.find(e => e.relative_path === path)!;
    entry.sha256 = createHash("sha256").update(files[path]!).digest("hex"); entry.bytes = Buffer.byteLength(files[path]!);
    const facts = projectReport07Facts(data, files);
    expect(facts.methods).toEqual([]);
    expect(facts.diagnostics).toContain("INVALID_JACOCO_DETAILS:" + path);
  });
});
