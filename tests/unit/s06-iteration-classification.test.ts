import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CandidateLoop } from "../../src/orchestration/candidate-loop.js";
import { assertBaselineUsable, type BaselineResult } from "../../src/orchestration/build-plan.js";
import type { RunResult, MavenRunner } from "../../src/runners/maven-runner.js";
import type { CandidateChangeSet } from "../../src/workers/opencode/model-schemas.js";

const FIXTURE = join(process.cwd(), "tests", "fixtures", "ac27-project");

describe("S06 candidate Maven result classification", () => {
  it("unstable baseline cannot enter the trusted baseline path", () => {
    expect(() => assertBaselineUsable({ status: "UNSTABLE" } as BaselineResult)).toThrow("Baseline");
  });

  it("exit0 with malformed Surefire output is rejected before coverage gain adoption", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-s06-malformed-").replace(/\\/g, "/"));
    const projectRoot = join(root, "project");
    const stagingRoot = join(root, "staging");
    try {
      cpSync(FIXTURE, projectRoot, { recursive: true });
      mkdirSync(stagingRoot, { recursive: true });
      const runner = {
        run: async (options: { working_dir: string; log_dir: string }): Promise<RunResult> => {
          const surefire = join(options.working_dir, "target", "surefire-reports");
          mkdirSync(surefire, { recursive: true });
          writeFileSync(join(surefire, "TEST-Broken.xml"), "<testsuite tests=\"1\"", "utf8");
          const jacoco = join(options.working_dir, "target", "site", "jacoco");
          mkdirSync(jacoco, { recursive: true });
          const now = Date.now();
          writeFileSync(
            join(jacoco, "jacoco.xml"),
            `<report><sessioninfo id="candidate" start="${now}" dump="${now}"/><package name="com/example/calc"><class name="com/example/calc/CalcService" sourcefilename="CalcService.java"><counter type="LINE" missed="0" covered="10"/></class></package></report>`,
            "utf8",
          );
          return {
            exit_code: 0,
            duration_ms: 1,
            stdout_log_path: join(options.log_dir, "stdout.log"),
            stderr_log_path: join(options.log_dir, "stderr.log"),
            command: ["fake-maven"],
            timed_out: false,
          };
        },
      } as unknown as MavenRunner;
      const candidate: CandidateChangeSet = {
        schema_version: 1,
        changes: [{
          path: "src/test/java/com/example/calc/GeneratedTest.java",
          action: "create",
          new_content: "package com.example.calc;\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\nclass GeneratedTest { @Test void works() { assertEquals(5, new CalcService().add(2, 3)); } }",
          scenario_ids: ["malformed-report"],
        }],
      };

      const result = await new CandidateLoop(runner).iterate({
        project_root: projectRoot,
        target_fqn: "com.example.calc.CalcService",
        target_module_path: "",
        line_target_bps: 9000,
        branch_target_bps: 0,
        baseline_coverage: { line: { covered: 0, missed: 10 }, branch: undefined },
        budget: { max_candidate_iterations: 1, max_repairs_per_candidate: 0, no_progress_window: 1 },
        staging_root: stagingRoot,
        workspace_root: join(root, "workspaces"),
        generate_candidate: async () => candidate,
      });

      expect(result.iterations[0]?.decision).toBe("rejected");
      expect(result.iterations[0]?.reason).toContain("MALFORMED_TEST_REPORT");
      expect(result.outcome).toBe("TARGET_NOT_MET_PLATEAU");
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
