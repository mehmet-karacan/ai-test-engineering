import { afterEach, describe, expect, it, vi } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDefaultServicesForTest, handleTestStart } from "../../src/application/services.js";
import { JobDispatcher, type GoalContract } from "../../src/orchestration/job-dispatcher.js";
import { CandidateLoop } from "../../src/orchestration/candidate-loop.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";
import type { CandidateChangeSet } from "../../src/workers/opencode/model-schemas.js";

afterEach(() => vi.restoreAllMocks());
describe("multiple target checkpoint generations", () => {
  it("runs two real candidate loops with monotonic logical iterations and accepted pointers", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-multi-checkpoint-"));
    const project = join(root, "project");
    mkdirSync(join(project, "src/main/java/fixture"), { recursive: true });
    mkdirSync(join(project, "src/test/java/fixture"), { recursive: true });
    copyFileSync(join(process.cwd(), "tests/fixtures/sample-maven-project/pom.xml"), join(project, "pom.xml"));
    for (const name of ["CalcA", "CalcB"]) writeFileSync(join(project, `src/main/java/fixture/${name}.java`),
      `package fixture;\npublic class ${name} {\n  public int value() { return 1; }\n}\n`);
    writeFileSync(join(project, "src/test/java/fixture/ExistingTest.java"),
      "package fixture;\nimport org.junit.jupiter.api.Test;\nclass ExistingTest {\n@Test void existing() {}\n}\n");
    const services = createDefaultServicesForTest(join(root, "state.db"), join(root, "runtime"));
    services.config.storage.root = join(root, "runtime");
    services.config.budgets.max_candidate_iterations = 4;
    let goal: GoalContract | undefined;
    const launch = vi.spyOn(JobDispatcher.prototype, "dispatch").mockImplementation(async (job, value) => {
      goal = value; return { job_id: job.id, phases_completed: [], final_outcome: "BOUNDARY", best_coverage: null, error: null };
    });
    try {
      const started = await handleTestStart({ project_root: project,
        targets: [{ selector: "fixture.CalcA", kind: "class" }, { selector: "fixture.CalcB", kind: "class" }],
        coverage: { percent: 80, metrics: ["LINE"] } }, services);
      launch.mockRestore();
      vi.spyOn(CustomerRunnerFactory.prototype, "assertHostDevOnlyAllowed").mockImplementation(() => undefined);
      // No JVM or model starts. Fake only the execution/provider boundaries;
      // snapshot, quality gates, actual CandidateLoop and checkpoint DB run.
      vi.spyOn(MavenRunner.prototype, "run").mockImplementation(async options => {
        const workspace = options.working_dir;
        const covered = (name: string) => existsSync(join(workspace, `src/test/java/fixture/${name}GeneratedTest.java`));
        const classes = ["CalcA", "CalcB"].map(name => `<class name="fixture/${name}" sourcefilename="${name}.java"><counter type="LINE" covered="${covered(name) ? 1 : 0}" missed="${covered(name) ? 0 : 1}"/></class><sourcefile name="${name}.java"><counter type="LINE" covered="${covered(name) ? 1 : 0}" missed="${covered(name) ? 0 : 1}"/></sourcefile>`).join("");
        const report = join(workspace, "target/site/jacoco"); mkdirSync(report, { recursive: true });
        writeFileSync(join(report, "jacoco.xml"), `<?xml version="1.0"?><report name="fixture"><sessioninfo id="fixture" start="${Date.now()}" dump="${Date.now()}"/><package name="fixture">${classes}</package></report>`);
        const tests = ["ExistingTest", ...["CalcA", "CalcB"].filter(covered).map(name => `${name}GeneratedTest`)];
        const reports = join(workspace, "target/surefire-reports"); mkdirSync(reports, { recursive: true });
        for (const name of tests) writeFileSync(join(reports, `TEST-fixture.${name}.xml`),
          `<testsuite name="fixture.${name}" tests="1" failures="0" errors="0" skipped="0"><testcase classname="fixture.${name}" name="existing"/></testsuite>`);
        mkdirSync(options.log_dir, { recursive: true });
        const stdout = join(options.log_dir, "stdout.log"), stderr = join(options.log_dir, "stderr.log");
        writeFileSync(stdout, "synthetic execution boundary"); writeFileSync(stderr, "");
        return { exit_code: 0, duration_ms: 1, stdout_log_path: stdout, stderr_log_path: stderr, command: ["fixture"], timed_out: false };
      });
      vi.spyOn(JobDispatcher.prototype as unknown as { generateCandidateFromWorker(root: string, fqn: string): Promise<CandidateChangeSet> },
        "generateCandidateFromWorker").mockImplementation(async (_root, fqn) => {
        const name = fqn.split(".").at(-1)!;
        return { schema_version: 1, changes: [{ path: `src/test/java/fixture/${name}GeneratedTest.java`, action: "create",
          new_content: `package fixture;\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\npublic class ${name}GeneratedTest {\n @Test\n public void existing() { assertEquals(1, new ${name}().value()); }\n}\n` }] };
      });
      const iterate = vi.spyOn(CandidateLoop.prototype, "iterate");
      const dispatcher = new JobDispatcher({ services, runnerKind: "host_dev_only", workerEnabled: true, workspaceRoot: services.config.storage.root });
      const result = await dispatcher.dispatch(services.jobs!.getJob(started.job_id), { ...goal!, runner_kind: "host_dev_only" }, project);
      expect(result.phases_completed).toContain("loop_fixture.CalcA_TARGET_REACHED");
      expect(result.phases_completed).toContain("loop_fixture.CalcB_TARGET_REACHED");
      expect(iterate.mock.calls.map(call => call[1])).toEqual([1, 2]);
      expect(services.storage!.db.prepare("SELECT generation FROM checkpoints WHERE job_id=? ORDER BY generation").all(started.job_id))
        .toEqual([{ generation: 1 }, { generation: 2 }]);
      expect(services.storage!.db.prepare("SELECT attempt_ordinal,iteration_ordinal,decision FROM candidate_iterations WHERE job_id=? ORDER BY attempt_ordinal").all(started.job_id))
        .toEqual([{ attempt_ordinal: 1, iteration_ordinal: 1, decision: "adopted" }, { attempt_ordinal: 2, iteration_ordinal: 2, decision: "adopted" }]);
    } finally { services.storage!.close(); rmSync(root, { recursive: true, force: true }); }
  });
});
