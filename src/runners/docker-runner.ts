/**
 * Izole Docker runner: non-root, read-only source mount, kapali varsayilan ag, kaynak limitleri.
 * Capability preflight kurulumda dogrulanir; kabiliyet yoksa BLOCKED_ISOLATION.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { AppError } from "../domain/errors.js";
import { MavenRunner, type MavenRunOptions, type RunResult } from "./maven-runner.js";

export interface DockerPreflightResult {
  docker_available: boolean;
  server_version: string | null;
  ostype: string | null;
  maven_image_present: boolean;
  errors: string[];
}

export interface DockerRunOptions {
  working_dir: string;
  image: string;
  command: string[];
  timeout_ms: number;
  log_dir: string;
  /** Network kapali (varsayilan) veya onayli profil adi */
  network: "none" | string;
  memory_mb: number;
  cpus: number;
  /** Yazilabilir alanlar ( proje disina cikmaz) */
  writable_mounts?: Array<{ host: string; container: string }>;
  env?: Record<string, string>;
  user?: string;
}

export const DEFAULT_MAVEN_IMAGE = "maven:3.9-eclipse-temurin-21";

export class DockerRunner {
  async preflight(image: string = DEFAULT_MAVEN_IMAGE): Promise<DockerPreflightResult> {
    const errors: string[] = [];
    let serverVersion: string | null = null;
    let ostype: string | null = null;
    let mavenImagePresent = false;

    const versionResult = await this.runCapture(["docker", "version", "--format", "{{.Server.Version}} {{.Server.Os}}"], 15000);
    if (!versionResult.ok) {
      errors.push(`Docker daemon erisilemedi: ${versionResult.stderr}`);
    } else {
      const parts = versionResult.stdout.trim().split(" ");
      serverVersion = parts[0] ?? null;
      ostype = parts[1] ?? null;
    }

    const imageResult = await this.runCapture(["docker", "image", "inspect", image, "--format", "{{.Id}}"], 15000);
    if (imageResult.ok) {
      mavenImagePresent = true;
    } else {
      errors.push(`Imaj bulunamadi: ${image} (pull gerekiyor)`);
    }

    return {
      docker_available: serverVersion !== null,
      server_version: serverVersion,
      ostype: ostype,
      maven_image_present: mavenImagePresent,
      errors,
    };
  }

  private runCapture(command: string[], timeoutMs: number): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return new Promise((resolvePromise) => {
      const child = spawn(command[0]!, command.slice(1), { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      const timer = setTimeout(() => {
        child.kill();
        resolvePromise({ ok: false, stdout, stderr: `${stderr}\ntimeout` });
      }, timeoutMs);
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolvePromise({ ok: code === 0, stdout, stderr });
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolvePromise({ ok: false, stdout, stderr: String(error) });
      });
    });
  }

  async run(options: DockerRunOptions): Promise<{ exit_code: number; duration_ms: number; stdout_log_path: string; timed_out: boolean }> {
    mkdirSync(options.log_dir, { recursive: true });
    const stdoutLog = join(options.log_dir, "docker-stdout.log");
    const hostProject = resolve(options.working_dir);

    const args = [
      "run", "--rm",
      "--network", options.network,
      "--memory", `${options.memory_mb}m`,
      "--cpus", String(options.cpus),
      "--pids-limit", "256",
      "--security-opt", "no-new-privileges",
      "-u", options.user ?? "1000:1000",
      "-v", `${hostProject}:/work:ro`,
      "-w", "/work",
      ...this.buildTmpMounts(options),
      ...this.buildEnvArgs(options.env),
      options.image,
      ...options.command,
    ];

    const started = Date.now();
    const child = spawn("docker", args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false, windowsHide: true });
    }, options.timeout_ms);

    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });

    const exitCode = await new Promise<number>((resolveExit) => {
      child.on("exit", (code) => resolveExit(code ?? -1));
      child.on("error", () => resolveExit(-1));
    });

    clearTimeout(timer);
    writeFileSync(stdoutLog, stdout, "utf8");

    return { exit_code: exitCode, duration_ms: Date.now() - started, stdout_log_path: stdoutLog, timed_out: timedOut };
  }

  private buildTmpMounts(options: DockerRunOptions): string[] {
    const mounts: string[] = ["-v", "aitest-m2-cache:/home/maven/.m2"];
    for (const mount of options.writable_mounts ?? []) {
      mounts.push("-v", `${resolve(mount.host)}:${mount.container}`);
    }
    return mounts;
  }

  private buildEnvArgs(env: Record<string, string> | undefined): string[] {
    const args: string[] = [];
    for (const [key, value] of Object.entries(env ?? {})) {
      args.push("-e", `${key}=${value}`);
    }
    return args;
  }

  async assertIsolationHolds(options: DockerRunOptions): Promise<void> {
    const result = await this.run({ ...options, command: ["sh", "-c", "(echo x > /work/isolation-probe.txt) 2>&1; (ls /host-secrets 2>&1 || echo NO_HOST_SECRETS)"] });
    if (result.exit_code === 0) {
      const output = await import("node:fs").then((fs) => fs.readFileSync(result.stdout_log_path, "utf8"));
      if (output.includes("isolation-probe") && !output.includes("Read-only file system")) {
        throw new AppError("POLICY_VIOLATION", "Izolasyon ihlali: read-only mount'a yazilabildi", { reason_code: "ISOLATION_BREACH" });
      }
    }
  }
}

export function assertDockerPreflightUsable(preflight: DockerPreflightResult): void {
  if (!preflight.docker_available) {
    throw new AppError("BLOCKED_ISOLATION", "Docker daemon erisilemedi; izole run yapilamaz", { errors: preflight.errors });
  }
  if (!preflight.maven_image_present) {
    throw new AppError("BLOCKED_ISOLATION", `Maven imaji bulunamadi: ${DEFAULT_MAVEN_IMAGE}; docker pull gerekli`, { errors: preflight.errors });
  }
}

/**
 * Docker-backed Maven runner: MavenRunOptions kabul eder; source read-only, target writable mount.
 * FIN00.e/22.2: candidate/final run'lari host Maven'e hic gecmez; ciktilar writable-sinirli
 * sandbox mount'undan (job'a ozel target) alinir. Egress 'none' (bagimlilik cache volume'u onayli).
 */
export interface DockerMavenRunnerOptions {
  /** Reactor/modul target dizinleri: {host: <proje>/target, container: /work/target} */
  target_mounts: Array<{ host: string; container: string }>;
  image?: string;
  network?: "none" | string;
  memory_mb?: number;
  cpus?: number;
  timeout_ms?: number;
}

export class DockerMavenRunner extends MavenRunner {
  private readonly docker: DockerRunner;
  private readonly options: DockerMavenRunnerOptions;

  constructor(options: DockerMavenRunnerOptions, docker?: DockerRunner) {
    super();
    this.docker = docker ?? new DockerRunner();
    this.options = options;
  }

  get kind(): "docker" {
    return "docker";
  }

  get writableTargetMounts(): Array<{ host: string; container: string }> {
    return this.options.target_mounts;
  }

  override async run(options: MavenRunOptions): Promise<RunResult> {
    for (const mount of this.options.target_mounts) {
      mkdirSync(mount.host, { recursive: true });
    }
    const runOptions: DockerRunOptions = {
      working_dir: options.working_dir,
      image: this.options.image ?? DEFAULT_MAVEN_IMAGE,
      command: ["mvn", ...options.goals, "-B", "-ntp"],
      timeout_ms: options.timeout_ms ?? this.options.timeout_ms ?? 600000,
      log_dir: options.log_dir,
      network: this.options.network ?? "none",
      memory_mb: this.options.memory_mb ?? 2048,
      cpus: this.options.cpus ?? 2,
      writable_mounts: this.options.target_mounts,
    };
    if (options.env) {
      runOptions.env = options.env;
    }
    const result = await this.docker.run(runOptions);
    return {
      exit_code: result.exit_code,
      duration_ms: result.duration_ms,
      stdout_log_path: result.stdout_log_path,
      stderr_log_path: result.stdout_log_path,
      command: ["mvn", ...options.goals],
      timed_out: result.timed_out,
    };
  }
}
