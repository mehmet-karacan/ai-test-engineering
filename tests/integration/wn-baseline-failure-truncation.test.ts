import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createDefaultServicesForTest, type Services } from "../../src/application/services.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobDispatcher } from "../../src/orchestration/job-dispatcher.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";

afterEach(() => vi.restoreAllMocks());

describe.skipIf(process.platform !== "win32")("WN21 failed baseline truncation", () => {
  it("persists bounded log loss before BASELINE_FAILED returns", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn21-failed-baseline-"));
    let services: Services | undefined;
    try {
      const project = join(root, "project");
      const tool = join(root, "fixture-mvn.cmd");
      const producer = join(root, "producer.js");
      mkdirSync(project);
      writeFileSync(join(project, "pom.xml"), `<?xml version="1.0"?><project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>fixture</groupId><artifactId>failed-baseline</artifactId><version>1</version><dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.11.0</version></dependency></dependencies><build><plugins><plugin><groupId>org.jacoco</groupId><artifactId>jacoco-maven-plugin</artifactId><version>0.8.12</version></plugin></plugins></build></project>`);
      writeFileSync(producer, `process.stdout.write(Buffer.alloc(9*1024*1024,65));`);
      writeFileSync(tool, `@echo off\r\nif "%~1"=="-v" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\n"${process.execPath}" "${producer}"\r\nexit /b 7\r\n`);
      services = createDefaultServicesForTest(join(root, "state.db"), join(root, "artifacts"));
      vi.spyOn(CustomerRunnerFactory.prototype, "assertHostDevOnlyAllowed").mockImplementation(() => undefined);
      const originalRun = MavenRunner.prototype.run;
      vi.spyOn(MavenRunner.prototype, "run").mockImplementation(function (this: MavenRunner, options) {
        return originalRun.call(this, { ...options, executable: tool });
      });
      const { location } = new ProjectRepository(services.storage!.db).ensureLocation(project, "wn21-failed-baseline", null);
      const job = services.jobs!.createJob({ locationId: location.id, requestDigest: "wn21-failed-baseline" });
      const dispatcher = new JobDispatcher({ services, runnerKind: "host_dev_only", workerEnabled: false, workspaceRoot: join(root, "workspace") });
      const result = await dispatcher.dispatch(job, dispatcher.buildGoalContract(job, [], project), project);
      expect(result.final_outcome).toBe("BASELINE_FAILED");
      expect(services.storage!.db.prepare<[string], { count: number }>(
        "SELECT COUNT(*) AS count FROM checkpoints WHERE job_id = ?",
      ).get(job.id)!.count).toBe(0);
      const run = services.storage!.db.prepare<[string], { id: string; stdout_log_path: string; exit_code: number }>(
        "SELECT id, stdout_log_path, exit_code FROM test_run_provenance WHERE job_id = ? AND stage = 'baseline'",
      ).get(job.id)!;
      expect(run.exit_code).toBe(7);
      expect(readFileSync(run.stdout_log_path).length).toBe(8 * 1024 * 1024);
      const artifact = services.storage!.db.prepare<[string, string], { relative_store_path: string; status: string }>(
        "SELECT relative_store_path, status FROM artifacts WHERE job_id = ? AND pin_reason = ?",
      ).get(job.id, `run_output_truncation:${run.id}`)!;
      expect(artifact.status).toBe("READY");
      expect(JSON.parse(readFileSync(join(services.artifacts!.rootPath, artifact.relative_store_path), "utf8"))).toMatchObject({
        run_id: run.id, stdout_raw_dropped_bytes: 1024 * 1024, stdout_reason: "BYTE_BUDGET_EXCEEDED",
      });
    } finally {
      services?.storage?.close();
      const target = resolve(root);
      if (target.startsWith(`${resolve(tmpdir())}${sep}`) && target.split(sep).at(-1)?.startsWith("aitest-wn21-failed-baseline-")) {
        rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } else {
        process.stderr.write("Skipping unsafe WN21 fixture cleanup path\n");
      }
    }
  }, 45000);

  it("persists timeout log loss through an artifact-linked job event", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn21-timeout-baseline-"));
    let services: Services | undefined;
    try {
      const project = join(root, "project");
      const tool = join(root, "fixture-mvn.cmd");
      const producer = join(root, "producer.js");
      mkdirSync(project);
      writeFileSync(join(project, "pom.xml"), `<?xml version="1.0"?><project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>fixture</groupId><artifactId>timeout-baseline</artifactId><version>1</version><dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.11.0</version></dependency></dependencies><build><plugins><plugin><groupId>org.jacoco</groupId><artifactId>jacoco-maven-plugin</artifactId><version>0.8.12</version></plugin></plugins></build></project>`);
      writeFileSync(producer, "process.stdout.write(Buffer.alloc(9*1024*1024,65)); setInterval(() => {}, 1000);");
      writeFileSync(tool, `@echo off\r\nif "%~1"=="-v" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\n"${process.execPath}" "${producer}"\r\n`);
      services = createDefaultServicesForTest(join(root, "state.db"), join(root, "artifacts"));
      vi.spyOn(CustomerRunnerFactory.prototype, "assertHostDevOnlyAllowed").mockImplementation(() => undefined);
      const originalRun = MavenRunner.prototype.run;
      vi.spyOn(MavenRunner.prototype, "run").mockImplementation(function (this: MavenRunner, options) {
        return originalRun.call(this, { ...options, executable: tool, timeout_ms: 2500 });
      });
      const { location } = new ProjectRepository(services.storage!.db).ensureLocation(project, "wn21-timeout-baseline", null);
      const job = services.jobs!.createJob({ locationId: location.id, requestDigest: "wn21-timeout-baseline" });
      const dispatcher = new JobDispatcher({ services, runnerKind: "host_dev_only", workerEnabled: false, workspaceRoot: join(root, "workspace") });
      const result = await dispatcher.dispatch(job, dispatcher.buildGoalContract(job, [], project), project);
      expect(result.final_outcome).toBe("FAILED");
      expect(services.storage!.db.prepare<[string], { count: number }>(
        "SELECT COUNT(*) AS count FROM test_run_provenance WHERE job_id = ?",
      ).get(job.id)!.count).toBe(0);
      expect(services.storage!.db.prepare<[string], { count: number }>(
        "SELECT COUNT(*) AS count FROM checkpoints WHERE job_id = ?",
      ).get(job.id)!.count).toBe(0);
      const row = services.storage!.db.prepare<[string], { relative_store_path: string; status: string }>(
        "SELECT a.relative_store_path, a.status FROM job_events e JOIN artifacts a ON a.id = e.payload_artifact_id WHERE e.job_id = ? AND e.event_type = 'run_output_truncated_terminal'",
      ).get(job.id)!;
      expect(row.status).toBe("READY");
      expect(JSON.parse(readFileSync(join(services.artifacts!.rootPath, row.relative_store_path), "utf8"))).toMatchObject({
        job_id: job.id, reason_code: "NATIVE_MAVEN_TIMEOUT", stdout_raw_dropped_bytes: 1024 * 1024,
        stdout_reason: "BYTE_BUDGET_EXCEEDED",
      });
    } finally {
      services?.storage?.close();
      const target = resolve(root);
      if (target.startsWith(`${resolve(tmpdir())}${sep}`) && target.split(sep).at(-1)?.startsWith("aitest-wn21-timeout-baseline-")) {
        rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } else {
        process.stderr.write("Skipping unsafe WN21 timeout fixture cleanup path\n");
      }
    }
  }, 45000);
});
