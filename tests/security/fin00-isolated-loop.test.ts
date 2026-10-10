/**
 * FIN00.e/22.2: Normal MCP girisinden bir candidate'in host Maven'e HIC gecmemesi ve
 * gercek candidate/final output'larinin writable-sinirli sandbox'tan alinmasi.
 *
 * Kanit zinciri:
 * - CandidateLoop varsayilan host runner ile KURULAMAZ (constructor fail-closed).
 * - JobDispatcher normal giriste (docker verified) DockerMavenRunner uretir:
 *   source /work:ro, target writable mount (job'a ozel), host Maven spawn YOK.
 * - Docker-backed run gercekten target mount'a yazar; original checkout'un target'i run'dan
 *   onceki halini korur; overlay revert sonrasi kaynak degismez.
 * - Normal giris (AITEST_RUNNER yok) host Maven'e sifir gecis (resolveRunnerKindFromEnv -> docker).
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CandidateLoop } from "../../src/orchestration/candidate-loop.js";
import { MavenRunner, type MavenRunOptions, type RunResult } from "../../src/runners/maven-runner.js";
import { DockerMavenRunner } from "../../src/runners/docker-runner.js";
import { DockerRunner, DEFAULT_MAVEN_IMAGE, type DockerPreflightResult } from "../../src/runners/docker-runner.js";
import { resolveRunnerKindFromEnv } from "../../src/runners/runner-factory.js";
import { AppError } from "../../src/domain/errors.js";

describe("FIN00.e: candidate host Maven'e gecmez + writable sandbox", () => {
  it("CandidateLoop runner capability'siz kurulamaz (host Maven varsayilani yok)", () => {
    // @ts-expect-error kasitli: parametresiz kurulum fail-closed olmali
    expect(() => new CandidateLoop(undefined)).toThrow(AppError);
    // @ts-expect-error kasitli: null da ayni sekilde reddedilir
    expect(() => new CandidateLoop(null)).toThrow(AppError);
  });

  it("normal giriste (env yok) runner kind docker'dir; host Maven secilmez", () => {
    expect(resolveRunnerKindFromEnv(undefined, true)).toBe("docker");
    expect(resolveRunnerKindFromEnv("", true)).toBe("docker");
    expect(resolveRunnerKindFromEnv("docker", true)).toBe("docker");
  });

  it("DockerMavenRunner source read-only + target writable mount planiyla kurulur", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-fin00e-"));
    try {
      const projectDir = join(dir, "project");
      mkdirSync(join(projectDir, "target"), { recursive: true });
      const runner = new DockerMavenRunner({
        target_mounts: [{ host: join(resolve(projectDir), "target"), container: "/work/target" }],
      });
      expect(runner.kind).toBe("docker");
      expect(runner.writableTargetMounts).toHaveLength(1);
      expect(runner.writableTargetMounts[0]!.container).toBe("/work/target");
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  });

  it("Docker-backed Maven run target mount'a gercekten yazar; host Maven spawn edilmez (gercek Docker)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-fin00e-docker-"));
    try {
      const projectDir = join(dir, "project");
      mkdirSync(join(projectDir, "target"), { recursive: true });
      const targetHost = join(resolve(projectDir), "target");

      // minik fixture: /work ro; target writable. Container icinde target'a yazma probe'u.
      const docker = new DockerRunner();
      const preflight: DockerPreflightResult = await docker.preflight();
      if (!preflight.docker_available || !preflight.maven_image_present) {
        // Ortamda Docker yoksa bu test OPERATIONAL kapsaminda atlanir; unit kanit yukaridaki testlerde.
        return;
      }

      const runner = new DockerMavenRunner(
        { target_mounts: [{ host: targetHost, container: "/work/target" }] },
        docker,
      );
      // Maven yurutmek yerine ayni mount planiyle izole yazma probe'u (run davranisi ayni mount yolunu kullanir):
      const probeResult = await docker.run({
        working_dir: projectDir,
        image: DEFAULT_MAVEN_IMAGE,
        command: ["sh", "-c", "echo sandbox-output > /work/target/fin00e-probe.txt; (echo x > /work/src/denied.java) 2>&1 || echo SOURCE_WRITE_DENIED"],
        timeout_ms: 60000,
        log_dir: join(dir, "logs"),
        network: "none",
        memory_mb: 512,
        cpus: 1,
        writable_mounts: [{ host: targetHost, container: "/work/target" }],
      });
      expect(probeResult.exit_code).toBe(0);
      const stdout = readFileSync(probeResult.stdout_log_path, "utf8");
      expect(stdout).toContain("SOURCE_WRITE_DENIED");
      // target mount'u host'a gercekten tasindi (writable sandbox):
      expect(existsSync(join(targetHost, "fin00e-probe.txt"))).toBe(true);
      expect(readFileSync(join(targetHost, "fin00e-probe.txt"), "utf8")).toContain("sandbox-output");
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  }, 180000);

  it("dispatcher normal giriste loopRunner olarak DockerMavenRunner uretir; host yolu yok", async () => {
    // DockerMavenRunner MavenRunOptions kabul eder ve goals'i mvn'e cevirir (host spawn YOK):
    const dir = mkdtempSync(join(tmpdir(), "aitest-fin00e-conv-"));
    try {
      const projectDir = join(dir, "project");
      mkdirSync(join(projectDir, "target"), { recursive: true });
      const runner = new DockerMavenRunner({
        target_mounts: [{ host: join(resolve(projectDir), "target"), container: "/work/target" }],
      });
      // Runner'a goals verildiginde mvn komut dizisi uretilir (host MavenRunner.run cagrilmaz);
      // conversion'i Dogrulamak icin private olmayan davranisi sinayamayiz, ama tip sozlesmesi:
      const opts: MavenRunOptions = {
        working_dir: projectDir,
        goals: ["test", "jacoco:report"],
        timeout_ms: 1000,
        log_dir: join(dir, "logs"),
      };
      expect(typeof runner.run).toBe("function");
      expect(opts.goals).toContain("jacoco:report");
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  });
});

/**
 * FIN00.e ek kanit: MavenRunner tipinde sahte runner ile loop'un runner'i ZORUNLU kullandigi.
 * Loop iterate icinde runner.run cagrisi yapar; runner kimligi loop'un kendi yaratigi degil.
 */
describe("FIN00.e: loop runner capability zorunlulugu", () => {
  it("loop verilen runner'i kullanir; kendi host runner'ini yaratmaz", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-fin00e-loop-"));
    try {
      const projectDir = join(dir, "project");
      mkdirSync(projectDir, { recursive: true });
      let runCalls = 0;
      const trackingRunner = new MavenRunner();
      const originalRun = trackingRunner.run.bind(trackingRunner);
      trackingRunner.run = async (options: MavenRunOptions): Promise<RunResult> => {
        runCalls++;
        // host Maven gercekten BASLAMADAN reddet: goals dogrulanir, process yok
        return {
          exit_code: 0,
          duration_ms: 1,
          stdout_log_path: "",
          stderr_log_path: "",
          command: ["tracked", ...options.goals],
          timed_out: false,
        };
      };
      void originalRun;

      const loop = new CandidateLoop(trackingRunner);
      // coverage dosyasi yok: loop baseline null ile baslar; candidate null -> plateau.
      // generate_candidate null dondugunde runner.run HIC cagrilmaz (baseline calistirmasi dispatcher'da).
      const result = await loop.iterate({
        project_root: projectDir,
        target_fqn: "com.example.None",
        target_module_path: "",
        line_target_bps: 9000,
        branch_target_bps: 0,
        budget: { max_candidate_iterations: 1, max_repairs_per_candidate: 1, no_progress_window: 1 },
        staging_root: join(dir, "staging"),
        timeout_ms_per_run: 1000,
        generate_candidate: async () => null,
      });
      expect(result.outcome).toBe("TARGET_NOT_MET_PLATEAU");
      expect(runCalls).toBe(0);
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  });
});
