/**
 * P07-B runtime evidence: gercek MavenRunner ciktilari collector'a baglanir.
 * Docker/customer dispatcher kosusu ayri bir capability kanitidir; bu test
 * runner dosya adlari, JaCoCo/Surefire ve redacted log export zincirini kapsar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPlan } from "../../src/orchestration/build-plan.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import { collectFinalReplayEvidence } from "../../src/reporting/evidence-collector.js";

describe("P07-B gercek Maven runtime evidence", () => {
  let root: string;
  let workspace: string;
  let evidence: ReturnType<typeof collectFinalReplayEvidence>;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "aitest-p07b-runtime-"));
    workspace = join(root, "fixture");
    cpSync(join(process.cwd(), "tests", "fixtures", "sample-maven-project"), workspace, { recursive: true });
    const plan = buildPlan(workspace, [""]);
    const run = await new MavenRunner().run({
      working_dir: workspace,
      goals: plan.maven_goals_coverage,
      timeout_ms: 600000,
      log_dir: join(workspace, "target", "aitest-final-replay-logs"),
    });
    expect(run.exit_code).toBe(0);
    expect(existsSync(run.stdout_log_path)).toBe(true);
    expect(existsSync(run.stderr_log_path)).toBe(true);
    evidence = collectFinalReplayEvidence({
      workspace,
      module_paths: [""],
      run_id: "runtime-final-001",
      job_id: "runtime-job-001",
      stdout_log_path: run.stdout_log_path,
      stderr_log_path: run.stderr_log_path,
      home_dir: process.env["USERPROFILE"] ?? process.env["HOME"],
    });
  }, 900000);

  afterAll(() => {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi sonraki GC'de temizlenebilir.
    }
  });

  it("gercek JaCoCo/Surefire ve Maven loglari eksiksiz evidence olur", () => {
    expect(evidence.missing).toEqual([]);
    expect(evidence.files.some((file) => file.kind === "jacoco_xml")).toBe(true);
    expect(evidence.files.some((file) => file.kind === "surefire_xml")).toBe(true);
    expect(evidence.files.filter((file) => file.kind === "run_log")).toHaveLength(2);
    expect(evidence.files.filter((file) => file.kind === "run_log").every((file) => file.redacted)).toBe(true);
  });
});
