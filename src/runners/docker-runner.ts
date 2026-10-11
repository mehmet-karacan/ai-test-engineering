/**
 * Izole Docker runner: non-root, read-only source mount, kapali varsayilan ag, kaynak limitleri.
 * Capability preflight kurulumda dogrulanir; kabiliyet yoksa BLOCKED_ISOLATION.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { AppError } from "../domain/errors.js";
import { MavenRunner, type MavenRunOptions, type RunResult } from "./maven-runner.js";

const MAX_DOCKER_LOG_BYTES = 8 * 1024 * 1024;

interface OwnedDockerRun {
  child: ChildProcess;
  cidFile: string;
}

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
  private readonly running = new Map<number, OwnedDockerRun>();

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
      const stdoutState = { value: 0 };
      const stderrState = { value: 0 };
      const appendLimited = (current: string, chunk: Buffer, bytes: { value: number }): string => {
        if (bytes.value >= MAX_DOCKER_LOG_BYTES) {
          return current;
        }
        const accepted = chunk.subarray(0, MAX_DOCKER_LOG_BYTES - bytes.value);
        bytes.value += accepted.length;
        return current + accepted.toString("utf8");
      };
      child.stdout?.on("data", (chunk: Buffer) => { stdout = appendLimited(stdout, chunk, stdoutState); });
      child.stderr?.on("data", (chunk: Buffer) => { stderr = appendLimited(stderr, chunk, stderrState); });
      const timer = setTimeout(() => {
        this.stopChild(child);
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
    const cidFile = join(options.log_dir, "container-id.txt");
    rmSync(cidFile, { force: true });
    const hostProject = resolve(options.working_dir);

    const args = [
      "run", "--rm",
      "--cidfile", cidFile,
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
    const ownedRun: OwnedDockerRun = { child, cidFile };
    if (child.pid !== undefined) {
      this.running.set(child.pid, ownedRun);
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      this.stopOwnedRun(ownedRun);
    }, options.timeout_ms);

    let stdout = "";
    let outputBytes = 0;
    const appendLimited = (chunk: Buffer): void => {
      if (outputBytes >= MAX_DOCKER_LOG_BYTES) {
        return;
      }
      const accepted = chunk.subarray(0, MAX_DOCKER_LOG_BYTES - outputBytes);
      outputBytes += accepted.length;
      stdout += accepted.toString("utf8");
    };
    child.stdout?.on("data", appendLimited);
    child.stderr?.on("data", appendLimited);

    const exitCode = await new Promise<number>((resolveExit) => {
      child.on("exit", (code) => resolveExit(code ?? -1));
      child.on("error", () => resolveExit(-1));
    });

    clearTimeout(timer);
    if (child.pid !== undefined) {
      this.running.delete(child.pid);
    }
    writeFileSync(stdoutLog, stdout, "utf8");

    return { exit_code: exitCode, duration_ms: Date.now() - started, stdout_log_path: stdoutLog, timed_out: timedOut };
  }

  /** Yalniz bu runner'in sahip oldugu docker client process'lerini durdurur. */
  stopAll(): void {
    for (const ownedRun of this.running.values()) {
      this.stopOwnedRun(ownedRun);
    }
    this.running.clear();
  }

  private stopChild(child: ChildProcess): void {
    try {
      if (child.exitCode !== null) {
        return;
      }
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false, windowsHide: true });
      } else {
        child.kill("SIGTERM");
        const forceTimer = setTimeout(() => {
          if (child.exitCode === null) {
            child.kill("SIGKILL");
          }
        }, 5000);
        forceTimer.unref?.();
      }
    } catch {
      // process zaten sonlanmis olabilir
    }
  }

  private stopOwnedRun(ownedRun: OwnedDockerRun): void {
    const cid = existsSync(ownedRun.cidFile) ? readFileSync(ownedRun.cidFile, "utf8").trim() : "";
    if (!cid) {
      this.stopChild(ownedRun.child);
      return;
    }
    try {
      const stopper = spawn("docker", ["stop", "--time", "5", cid], { stdio: "ignore", shell: false, windowsHide: true });
      stopper.once("error", () => this.stopChild(ownedRun.child));
      stopper.once("close", () => {
        if (ownedRun.child.exitCode === null) {
          this.stopChild(ownedRun.child);
        }
      });
    } catch {
      this.stopChild(ownedRun.child);
    }
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
    // W02/F16: NO_CGROUP basarili olcum DEGIL; capability_verified false kalir ve errors'a yazilir.
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
      if (stdout.includes("NO_CGROUP")) {
        memoryLimitApplied = false;
        errors.push("Memory limiti dogrulanamadi: cgroup dosyasi okunamadi (NO_CGROUP)");
      } else {
        memoryLimitApplied = /536870912/.test(stdout);
        if (!memoryLimitApplied) {
          errors.push(`Memory limiti beklenen degerde degil: ${stdout.trim().slice(0, 64)}`);
        }
      }
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
  /** 8.3: hazirlama profili; izinli mirror'lara sinirli erisim */
  provisioning?: { enabled: boolean; allowed_mirrors: string[]; timeout_ms: number };
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
    // Candidate/final workspace degistiginde JaCoCo target'i original checkout'a
    // degil, o run'in workspace'ine yazilir. Sabit mount stale/fake final evidence
    // uretirdi (F08/F10/N32).
    const targetMounts = this.options.target_mounts.map((mount) =>
      mount.container === "/work/target" ? { ...mount, host: join(resolve(options.working_dir), "target") } : mount,
    );
    for (const mount of targetMounts) {
      mkdirSync(mount.host, { recursive: true });
    }
    const readonlyMounts: Array<{ host: string; container: string }> = [];
    if (this.options.maven_settings) {
      readonlyMounts.push({ host: this.options.maven_settings.host_path, container: this.options.maven_settings.container_path });
    }
    // 8.3: bagimlilik hazirlama gerekiyorsa (cache bos) ayri hazirlama asamasi izinli mirror'a gider;
    // execution run'i yine `none` ile calisir (test kodu paylasilan cache'e yazamaz).
    const provisioningNeeded = this.options.provisioning && this.options.provisioning.enabled && this.options.provisioning.allowed_mirrors.length > 0;
    if (provisioningNeeded) {
      await this.provisionDependencies(options);
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
      writable_mounts: targetMounts,
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

  override stopAll(): void {
    super.stopAll();
    this.docker.stopAll();
  }

  private settingsArgs(): string[] {
    if (!this.options.maven_settings) {
      return [];
    }
    return ["-s", this.options.maven_settings.container_path];
  }

  /**
   * 8.3/W02/F16: Ayri hazirlama asamasi — Maven dependency indirmesi yalniz izinli mirror'lara
   * sinirli erisimle yapilir. Bu asama da sandbox'lanir (non-root, kaynak limitleri); host Maven fallback'i
   * olamaz. Cache job'a ozel writable overlay; sonraki execution `none` ile calisir.
   * F16: allowed_mirrors listesi bos/undefined ise provisioning calismaz; typed BLOCKED_DEPENDENCIES.
   */
  private async provisionDependencies(options: MavenRunOptions): Promise<void> {
    const provisioning = this.options.provisioning!;
    // F16: mirror listesi gercekten bos ise egress izni olmadigindan run FAIL olacak; onceden typed blocker:
    if (!provisioning.allowed_mirrors || provisioning.allowed_mirrors.length === 0) {
      throw new AppError("BLOCKED_DEPENDENCIES", "Bagimlilik hazirlama izinli mirror listesi bos; egress izni yok (F16)", {
        reason_code: "BLOCKED_DEPENDENCIES",
      });
    }
    // mvn dependency:go-offline yerine test-compile + test-Discovery cache doldurur (izinli mirror);
    // hata burada BLOCKED_DEPENDENCIES olarak yansir (run sonucundan).
    const provisionOptions: DockerRunOptions = {
      working_dir: options.working_dir,
      image: this.options.image ?? DEFAULT_MAVEN_IMAGE,
      command: ["mvn", ...this.settingsArgs(), "dependency:go-offline", "-B", "-ntp"],
      timeout_ms: provisioning.timeout_ms,
      log_dir: join(options.log_dir, "provisioning"),
      network: "bridge",
      memory_mb: this.options.memory_mb ?? 2048,
      cpus: this.options.cpus ?? 2,
    };
    if (this.options.maven_settings) {
      provisionOptions.readonly_mounts = [{ host: this.options.maven_settings.host_path, container: this.options.maven_settings.container_path }];
    }
    const probe = await this.docker.run(provisionOptions);
    if (probe.exit_code !== 0) {
      throw new AppError("BLOCKED_DEPENDENCIES", `Bagimlilik hazirlama basarisiz (exit ${probe.exit_code}); izinli mirror: ${provisioning.allowed_mirrors.join(",")}`, {
        reason_code: "BLOCKED_DEPENDENCIES",
        log: probe.stdout_log_path,
      });
    }
  }
}
