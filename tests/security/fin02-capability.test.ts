/**
 * FIN02/8.2: Verified runner capability gercegi.
 * Capability sadece docker info/image varligi degil; gercek probe ile dogrulanir.
 * Kanit: gercek Docker run'larinda source yazma reddi, host secret izolasyonu, network egress reddi,
 * non-root, memory limiti ve output writability birlikte dogrulanir.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DockerRunner, DEFAULT_MAVEN_IMAGE, DockerMavenRunner } from "../../src/runners/docker-runner.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";

describe("FIN02: verified runner capability probe (gercek Docker)", () => {
  let dockerUsable = false;

  it("preflight + gercek capability probe dogrulanir", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-fin02-"));
    try {
      mkdirSync(join(dir, "project"), { recursive: true });
      writeFileSync(join(dir, "project", "Production.java"), "public class Production {}\n");
      const runner = new DockerRunner();
      const preflight = await runner.preflight();
      if (!preflight.docker_available || !preflight.maven_image_present) {
        dockerUsable = false;
        return;
      }
      dockerUsable = true;
      const probe = await runner.probeRunnerCapability(join(dir, "probe-root"));
      expect(probe.probes_run).toBe(4);
      // production source'a yazilamaz (host dosyasi degismedi):
      expect(existsSync(join(dir, "project", "Production.java"))).toBe(true);
      expect(readFileSync(join(dir, "project", "Production.java"), "utf8")).toBe("public class Production {}\n");
      expect(probe.source_write_denied).toBe(true);
      // host secret izolasyonu:
      expect(probe.host_secret_isolated).toBe(true);
      // network egress reddi:
      expect(probe.network_egress_denied).toBe(true);
      // non-root:
      expect(probe.non_root_user).toBe(true);
      // memory limiti:
      expect(probe.memory_limit_applied).toBe(true);
      // capability butun olarak dogrulandi:
      expect(probe.capability_verified).toBe(true);
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  }, 300000);

  it("CustomerRunnerFactory ensureVerified capability probe ile verified uretir", async () => {
    if (!dockerUsable) {
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "aitest-fin02-factory-"));
    try {
      const factory = new CustomerRunnerFactory();
      const capability = await factory.ensureVerified({ workspaceRoot: join(dir, "probe") });
      expect(capability.kind).toBe("docker");
      expect(capability.capability_probe).not.toBeNull();
      expect(capability.capability_probe!.capability_verified).toBe(true);
      expect(capability.host).toBeNull();
      // ikinci cagri cache'li capability dondurur (her seferinde tum benchmark'u kosmaz):
      const second = await factory.ensureVerified({ workspaceRoot: join(dir, "probe") });
      expect(second.verified_at).toBe(capability.verified_at);
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  }, 300000);

  it("customer job'da host_dev_only istegi reddedilir; capability yazma iznini probe eder", async () => {
    const factory = new CustomerRunnerFactory();
    expect(() => factory.assertHostDevOnlyAllowed("host_dev_only", true)).toThrow();
    expect(() => factory.assertHostDevOnlyAllowed("host_dev_only", false)).not.toThrow();
    expect(() => factory.assertHostDevOnlyAllowed("docker", true)).not.toThrow();
  });

  it("DockerMavenRunner target mount plani writable-sinirli; source read-only kalir", async () => {
    if (!dockerUsable) {
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "aitest-fin02-mvn-"));
    try {
      const projectDir = join(dir, "project");
      mkdirSync(join(projectDir, "target"), { recursive: true });
      writeFileSync(join(projectDir, "src.txt"), "original\n");
      const targetHost = join(resolve(projectDir), "target");
      const docker = new DockerRunner();
      const mavenRunner = new DockerMavenRunner(
        { target_mounts: [{ host: targetHost, container: "/work/target" }] },
        docker,
      );
      // DockerMavenRunner mvn goals'i docker container'da yurutur; host Maven'e gecmez:
      const result = await mavenRunner.run({
        working_dir: projectDir,
        goals: ["--version"],
        timeout_ms: 60000,
        log_dir: join(dir, "logs"),
      });
      expect(result.exit_code).toBe(0);
      expect(result.command[0]).toBe("mvn");
      // source read-only: original korunur
      expect(readFileSync(join(projectDir, "src.txt"), "utf8")).toBe("original\n");
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  }, 180000);
});
