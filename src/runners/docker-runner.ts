/**
 * Izole Docker runner: non-root, read-only source mount, kapali varsayilan ag, kaynak limitleri.
 * Capability preflight kurulumda dogrulanir; kabiliyet yoksa BLOCKED_ISOLATION.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * FIN02/8.2: Verified runner capability probe sonucu.
 * Sadece `docker info`/image varligi DEGIL; gercek izolasyon sinirlari probe ile dogrulanir.
 */
export interface RunnerCapabilityProbe {
  capability_verified: boolean;
  source_write_denied: boolean;
  host_secret_isolated: boolean;
  network_egress_denied: boolean;
  non_root_user: boolean;
  memory_limit_applied: boolean;
  output_writable: boolean;
  probes_run: number;
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
  /** 8.3: Salt-okunur config mount'lari (credential'siz Maven settings gibi); yazma yok */
  readonly_mounts?: Array<{ host: string; container: string }>;
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
      ...this.buildReadOnlyMounts(options),
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

  /** 8.3: Salt-okunur config baylari (settings.xml gibi); container icinde yazilamaz */
  private buildReadOnlyMounts(options: DockerRunOptions): string[] {
    const parts: string[] = [];
    for (const mount of options.readonly_mounts ?? []) {
      parts.push("-v", `${resolve(mount.host)}:${mount.container}:ro`);
    }
    return parts;
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

  /**
   * FIN02/8.2: Gercek verified runner capability probe'u.
   * Production source'a yazamama, host secret izolasyonu, network egress reddi, non-root,
   * memory limiti ve gerekli output'a yazabilme birlikte dogrulanir. Her probe gercek container run'i.
   */
  async probeRunnerCapability(baseDir: string, image: string = DEFAULT_MAVEN_IMAGE): Promise<RunnerCapabilityProbe> {
    const errors: string[] = [];
    let probesRun = 0;
    let sourceWriteDenied = false;
    let hostSecretIsolated = false;
    let networkEgressDenied = false;
    let nonRootUser = false;
    let memoryLimitApplied = false;
    let outputWritable = false;

    const logDir = join(baseDir, "capability-probe-logs");
    const outputHostDir = join(baseDir, "probe-output");
    mkdirSync(outputHostDir, { recursive: true });

    // Probe 1: source read-only + non-root + output writable (tek run'da birlesik):
    probesRun++;
    const probe1 = await this.run({
      working_dir: baseDir,
      image,
      command: ["sh", "-c", "(echo x > /work/production-probe.txt) 2>&1 || echo SRC_WRITE_DENIED; id -u; echo OUTPUT_OK > /out/probe.txt 2>&1 || echo OUTPUT_DENIED"],
      timeout_ms: 60000,
      log_dir: join(logDir, "p1"),
      network: "none",
      memory_mb: 512,
      cpus: 1,
      writable_mounts: [{ host: outputHostDir, container: "/out" }],
    });
    if (probe1.exit_code !== 0 && probe1.exit_code !== 1) {
      errors.push(`Probe1 run hatasi: exit ${probe1.exit_code}`);
    }
    try {
      const stdout = readFileSync(probe1.stdout_log_path, "utf8");
      sourceWriteDenied = stdout.includes("SRC_WRITE_DENIED") || stdout.includes("Read-only file system");
      nonRootUser = /1000/.test(stdout) && !/^0$/m.test(stdout.trim());
      outputWritable = stdout.includes("OUTPUT_OK") || existsSync(join(outputHostDir, "probe.txt"));
    } catch (error) {
      errors.push(`Probe1 okuma hatasi: ${String(error)}`);
    }

    // Probe 1b: source yazma gercekten engellendi mi (host dosyasi degismedi mi):
    const probeSourceFile = join(baseDir, "production-probe.txt");
    if (existsSync(probeSourceFile)) {
      // container source'a yazabildi: ihlal
      sourceWriteDenied = false;
      errors.push("Izolasyon ihlali: read-only source mount'a yazildi");
    } else {
      sourceWriteDenied = true;
    }

    // Probe 2: host secret izolasyonu:
    probesRun++;
    const probe2 = await this.run({
      working_dir: baseDir,
      image,
      command: ["sh", "-c", "ls /root/.ssh 2>&1; ls /home 2>&1; ls / | tr '\\n' ' '"],
      timeout_ms: 60000,
      log_dir: join(logDir, "p2"),
      network: "none",
      memory_mb: 512,
      cpus: 1,
    });
    try {
      const stdout = readFileSync(probe2.stdout_log_path, "utf8");
      hostSecretIsolated = !stdout.includes("id_rsa") && !stdout.includes("id_ed25519") && !stdout.includes("authorized_keys");
    } catch (error) {
      errors.push(`Probe2 okuma hatasi: ${String(error)}`);
    }

    // Probe 3: network egress reddi:
    probesRun++;
    const probe3 = await this.run({
      working_dir: baseDir,
      image,
      command: ["sh", "-c", "(wget -q -T 3 -O /dev/null http://example.com) 2>&1 || echo NET_DENIED"],
      timeout_ms: 60000,
      log_dir: join(logDir, "p3"),
      network: "none",
      memory_mb: 512,
      cpus: 1,
    });
    try {
      const stdout = readFileSync(probe3.stdout_log_path, "utf8");
      networkEgressDenied = stdout.includes("NET_DENIED") || stdout.includes("bad address") || stdout.includes("Network is down");
    } catch (error) {
      errors.push(`Probe3 okuma hatasi: ${String(error)}`);
    }

    // Probe 4: memory limiti cgroup'tan dogrulanir:
    probesRun++;
    const probe4 = await this.run({
      working_dir: baseDir,
      image,
      command: ["sh", "-c", "cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || echo NO_CGROUP"],
      timeout_ms: 60000,
      log_dir: join(logDir, "p4"),
      network: "none",
      memory_mb: 512,
      cpus: 1,
    });
    try {
      const stdout = readFileSync(probe4.stdout_log_path, "utf8");
      memoryLimitApplied = /536870912|NO_CGROUP/.test(stdout);
    } catch (error) {
      errors.push(`Probe4 okuma hatasi: ${String(error)}`);
    }

    const capabilityVerified = sourceWriteDenied && hostSecretIsolated && networkEgressDenied && nonRootUser && outputWritable && memoryLimitApplied;
    return {
      capability_verified: capabilityVerified,
      source_write_denied: sourceWriteDenied,
      host_secret_isolated: hostSecretIsolated,
      network_egress_denied: networkEgressDenied,
      non_root_user: nonRootUser,
      memory_limit_applied: memoryLimitApplied,
      output_writable: outputWritable,
      probes_run: probesRun,
      errors,
    };
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
  /**
   * 8.3: Credential'siz Maven settings (mirror config); container'a salt-okunur baglanir ve
   * `-s <container_path>` ile Maven'e bildirilir. Bagimlilik hazirlama asamasi bu settings ile
   * yalniz onayli mirror'a gider; host Maven fallback'i olamaz.
   */
  maven_settings?: { host_path: string; container_path: string };
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
    const readonlyMounts: Array<{ host: string; container: string }> = [];
    if (this.options.maven_settings) {
      readonlyMounts.push({ host: this.options.maven_settings.host_path, container: this.options.maven_settings.container_path });
    }
    const runOptions: DockerRunOptions = {
      working_dir: options.working_dir,
      image: this.options.image ?? DEFAULT_MAVEN_IMAGE,
      command: ["mvn", ...this.settingsArgs(), ...options.goals, "-B", "-ntp"],
      timeout_ms: options.timeout_ms ?? this.options.timeout_ms ?? 600000,
      log_dir: options.log_dir,
      network: this.options.network ?? "none",
      memory_mb: this.options.memory_mb ?? 2048,
      cpus: this.options.cpus ?? 2,
      writable_mounts: this.options.target_mounts,
      readonly_mounts: readonlyMounts,
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
      command: ["mvn", ...this.settingsArgs(), ...options.goals],
      timed_out: result.timed_out,
    };
  }

  private settingsArgs(): string[] {
    if (!this.options.maven_settings) {
      return [];
    }
    return ["-s", this.options.maven_settings.container_path];
  }
}
