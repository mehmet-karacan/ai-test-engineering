import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
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

  it("native readiness never probes Docker or starts Maven while process ownership is unverified", async () => {
    const docker = vi.spyOn(DockerRunner.prototype, "preflight");
    const processRun = vi.spyOn(WindowsProcessSupervisor.prototype, "run");
    const factory = new CustomerRunnerFactory();
    expect(() => factory.assertNativeCustomerReady()).toThrowError(/process/i);
    await expect(factory.prepareNativeCustomerToolchain({ cwd: process.cwd(), env: process.env }))
      .rejects.toMatchObject({ details: { reason_code: "NATIVE_PROCESS_OWNERSHIP_UNVERIFIED" } });
    expect(docker).not.toHaveBeenCalled();
    expect(processRun).not.toHaveBeenCalled();
    docker.mockRestore();
    processRun.mockRestore();
  });

  it.skipIf(process.platform !== "win32")("prepares a typed version identity using only a synthetic fixture after a test-only readiness stub", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-preflight-"));
    try {
      const executable = join(root, "mvn.cmd");
      writeFileSync(executable, "@echo off\r\necho Apache Maven 3.9.16\r\necho Java version: 25.0.3, vendor: Fixture\r\n");
      const factory = new CustomerRunnerFactory();
      vi.spyOn(factory, "assertNativeCustomerReady").mockImplementation(() => undefined);
      const plan = await factory.prepareNativeCustomerToolchain({ cwd: root, env: process.env, executable });
      expect(plan.mavenVersion).toBe("3.9.16");
      expect(plan.javaVersion).toBe("25.0.3");
      expect(plan.identity).not.toBe(plan.baseIdentity);
      expect(plan.identity).toMatch(/^[a-f0-9]{64}$/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("normal dispatcher blocks before Docker or Maven and records failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-entry-"));
    const docker = vi.spyOn(DockerRunner.prototype, "preflight");
    const maven = vi.spyOn(MavenRunner.prototype, "run");
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
      expect(docker).not.toHaveBeenCalled();
      expect(maven).not.toHaveBeenCalled();
    } finally {
      services.storage?.close();
      docker.mockRestore();
      maven.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
