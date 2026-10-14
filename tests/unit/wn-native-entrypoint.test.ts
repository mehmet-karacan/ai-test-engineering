import { describe, expect, it, vi } from "vitest";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { CustomerRunnerFactory, resolveRunnerKindFromEnv } from "../../src/runners/runner-factory.js";
import { DockerRunner } from "../../src/runners/docker-runner.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import { WindowsProcessSupervisor } from "../../src/runners/windows-process-supervisor.js";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobDispatcher } from "../../src/orchestration/job-dispatcher.js";
import { defaultConfig, loadConfig } from "../../src/configuration/config-loader.js";

describe("WN14/WN24 native customer entrypoint", () => {
  it("does not silently strip a legacy runner field in saved config", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-config-"));
    try {
      const file = join(root, "config.json");
      writeFileSync(file, JSON.stringify({ ...defaultConfig(), runner_kind: "docker" }));
      expect(() => loadConfig(file)).toThrowError(/migration/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("normal customer selection is native; legacy runner requests require explicit migration", () => {
    expect(resolveRunnerKindFromEnv(undefined, true)).toBe("windows_native");
    expect(resolveRunnerKindFromEnv("windows_native", true)).toBe("windows_native");
    for (const legacy of ["docker", "host_dev_only", ""]) {
      expect(() => resolveRunnerKindFromEnv(legacy, true)).toThrowError();
    }
    expect(resolveRunnerKindFromEnv("host_dev_only", false)).toBe("host_dev_only");
  });

  it("native readiness accepts the verified helper and rejects an unavailable Maven selection", async () => {
    const docker = vi.spyOn(DockerRunner.prototype, "preflight");
    const processRun = vi.spyOn(WindowsProcessSupervisor.prototype, "run");
    const factory = new CustomerRunnerFactory();
    expect(() => factory.assertNativeCustomerReady()).not.toThrow();
    await expect(factory.prepareNativeCustomerToolchain({
      cwd: process.cwd(),
      env: { SystemRoot: process.env.SystemRoot, Path: "C:\\aitest-no-such-maven" },
    }, {
      beforeSpawn() {},
      afterSpawn() {},
      afterTerminal() {},
    })).rejects.toThrow(/mvn/i);
    expect(docker).not.toHaveBeenCalled();
    expect(processRun).not.toHaveBeenCalled();
    docker.mockRestore();
    processRun.mockRestore();
  });

  it.skipIf(process.platform !== "win32")("keeps a customer preflight closed without an owned lifecycle after a test-only readiness stub", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-preflight-"));
    try {
      const executable = join(root, "mvn.cmd");
      writeFileSync(executable, "@echo off\r\necho Apache Maven 3.9.16\r\necho Java version: 25.0.3, vendor: Fixture\r\n");
      const factory = new CustomerRunnerFactory();
      vi.spyOn(factory, "assertNativeCustomerReady").mockImplementation(() => undefined);
      await expect(factory.prepareNativeCustomerToolchain({ cwd: root, env: process.env, executable }))
        .rejects.toMatchObject({ details: { reason_code: "NATIVE_PROCESS_OWNERSHIP_UNVERIFIED" } });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("normal dispatcher blocks before Docker or Maven and records failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-entry-"));
    const docker = vi.spyOn(DockerRunner.prototype, "preflight");
    const maven = vi.spyOn(MavenRunner.prototype, "run");
    const readiness = vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady")
      .mockImplementation(() => { throw new Error("process ownership unavailable"); });
    const services = createDefaultServicesForTest(join(root, "state.db"), join(root, "artifacts"));
    try {
      const project = join(root, "project");
      mkdirSync(project);
      writeFileSync(join(project, "pom.xml"), "<project/>");
      const { location } = new ProjectRepository(services.storage!.db).ensureLocation(project, "wn-entry", null);
      const job = services.jobs!.createJob({ locationId: location.id, requestDigest: "wn-entry" });
      const dispatcher = new JobDispatcher({ services, runnerKind: "windows_native", workerEnabled: false, workspaceRoot: join(root, "workspace") });
      const contractDir = join(root, "workspace", "jobs", job.id, "contract");
      mkdirSync(contractDir, { recursive: true });
      writeFileSync(join(contractDir, "legacy"), JSON.stringify({ runner_kind: "docker" }));
      services.storage!.db.prepare(
        "INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, pin_reason, created_at) VALUES (?, ?, 'job_contract', ?, ?, ?, '1', 'internal', 'READY', 'job_contract', ?)",
      ).run(randomUUID(), job.id, `jobs/${job.id}/contract/legacy`, "a".repeat(64), 24, Date.now());
      expect(() => dispatcher.assertRecordedRunnerKind(services.storage!, job)).toThrowError(/explicit revision/i);
      const legacyGoal = { ...dispatcher.buildGoalContract(job, [], project), runner_kind: "docker" as const };
      await expect(dispatcher.dispatch(job, legacyGoal, project)).rejects.toMatchObject({
        details: { reason_code: "RUNNER_CONTRACT_CONFLICT" },
      });
      const result = await dispatcher.dispatch(job, dispatcher.buildGoalContract(job, [], project), project);
      expect(result.final_outcome).toBe("FAILED");
      expect(result.error).toMatch(/process ownership/i);
      const acceptedRuns = services.storage!.db.prepare<[string], { count: number }>(
        "SELECT COUNT(*) AS count FROM test_run_provenance WHERE job_id = ?",
      ).get(job.id)!.count;
      const acceptedCheckpoints = services.storage!.db.prepare<[string], { count: number }>(
        "SELECT COUNT(*) AS count FROM checkpoints WHERE job_id = ?",
      ).get(job.id)!.count;
      expect({ acceptedRuns, acceptedCheckpoints }).toEqual({ acceptedRuns: 0, acceptedCheckpoints: 0 });
      expect(docker).not.toHaveBeenCalled();
      expect(maven).not.toHaveBeenCalled();
    } finally {
      services.storage?.close();
      docker.mockRestore();
      maven.mockRestore();
      readiness.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("selects the owned native runner for baseline and candidate after readiness", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-routing-"));
    const services = createDefaultServicesForTest(join(root, "state.db"), join(root, "artifacts"));
    try {
      const dispatcher = new JobDispatcher({ services, runnerKind: "windows_native", workerEnabled: false, workspaceRoot: join(root, "workspace") });
      const nativeRunner = new MavenRunner();
      const selected = (dispatcher as unknown as { buildVerifiedLoopRunner: (docker: undefined, host: MavenRunner, root: string) => MavenRunner })
        .buildVerifiedLoopRunner(undefined, nativeRunner, root);
      expect(selected).toBe(nativeRunner);
    } finally { services.storage?.close(); rmSync(root, { recursive: true, force: true }); }
  });

  it.skipIf(process.platform !== "win32")("normal native baseline rejects absent Maven inputs before goal execution", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-dispatch-fixture-"));
    const services = createDefaultServicesForTest(join(root, "state.db"), join(root, "artifacts"));
    const originalPath = process.env.Path;
    const readiness = vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => undefined);
    const docker = vi.spyOn(DockerRunner.prototype, "preflight");
    try {
      const project = join(root, "project");
      mkdirSync(project);
      writeFileSync(join(project, "pom.xml"), `<?xml version="1.0"?><project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>fixture</artifactId><version>1</version><dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.10.2</version><scope>test</scope></dependency></dependencies><build><plugins><plugin><groupId>org.jacoco</groupId><artifactId>jacoco-maven-plugin</artifactId><version>0.8.12</version></plugin></plugins></build></project>`);
      writeFileSync(join(project, "mvn.cmd"), `@echo off\r\nif "%~1"=="-v" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\n"${process.execPath}" emit-report.js\r\nexit /b %errorlevel%\r\n`);
      writeFileSync(join(project, "emit-report.js"), `const fs=require('node:fs');fs.mkdirSync('target/surefire-reports',{recursive:true});fs.writeFileSync('target/surefire-reports/TEST-Fixture.xml','<testsuite name="Fixture" tests="1" failures="0" errors="0" skipped="0"><testcase name="ok" classname="Fixture"/></testsuite>');fs.mkdirSync('target/site/jacoco',{recursive:true});fs.writeFileSync('target/site/jacoco/jacoco.xml','<report name="Fixture"/>');`);
      const sourceFiles = readdirSync(project).sort();
      const digestSource = (): string => {
        const hash = createHash("sha256");
        for (const name of sourceFiles) hash.update(name).update(readFileSync(join(project, name)));
        return hash.digest("hex");
      };
      const sourceDigest = digestSource();
      process.env.Path = `${project}${delimiter}${originalPath ?? ""}`;
      const { location } = new ProjectRepository(services.storage!.db).ensureLocation(project, "native-dispatch-fixture", null);
      const job = services.jobs!.createJob({ locationId: location.id, requestDigest: "native-dispatch-fixture" });
      const dispatcher = new JobDispatcher({ services, runnerKind: "windows_native", workerEnabled: false, workspaceRoot: join(root, "workspace") });
      const result = await dispatcher.dispatch(job, dispatcher.buildGoalContract(job, [], project), project);
      const baseline = join(root, "workspace", "jobs", job.id, "baseline");
      expect(result.final_outcome).toBe("FAILED");
      expect(result.error).toMatch(/Complete installed Maven\/JDK manifest required/i);
      expect(result.phases_completed).not.toContain("baseline_ok");
      expect(existsSync(join(baseline, "target", "surefire-reports", "TEST-Fixture.xml"))).toBe(false);
      expect(existsSync(join(project, "target"))).toBe(false);
      expect(readdirSync(project).sort()).toEqual(sourceFiles);
      expect(digestSource()).toBe(sourceDigest);
      expect(docker).not.toHaveBeenCalled();
    } finally {
      if (originalPath === undefined) delete process.env.Path;
      else process.env.Path = originalPath;
      readiness.mockRestore(); docker.mockRestore();
      services.storage?.close();
      const target = resolve(root);
      const inside = relative(resolve(tmpdir()), target);
      const safe = !!inside && !inside.startsWith("..") && !isAbsolute(inside) && basename(target).startsWith("aitest-wn-dispatch-fixture-") &&
        !lstatSync(target).isSymbolicLink() && realpathSync.native(target).toLowerCase() === target.toLowerCase();
      if (safe) {
        rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } else {
        process.stderr.write("Native dispatch fixture cleanup skipped outside owned Temp root\n");
      }
    }
  }, 60000);
});
