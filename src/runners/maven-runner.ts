/**
 * MavenRunner: process supervisor altinda build/test/jacoco goal yurutme.
 * STDOUT log dosyasina; timeout/iptal yalniz ilgili process tree'yi durdurur.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { AppError } from "../domain/errors.js";

export interface RunResult {
  exit_code: number;
  duration_ms: number;
  stdout_log_path: string;
  stderr_log_path: string;
  command: string[];
  timed_out: boolean;
}

export interface MavenRunOptions {
  working_dir: string;
  goals: string[];
  profiles?: string[];
  properties?: Record<string, string>;
  timeout_ms: number;
  log_dir: string;
  env?: Record<string, string>;
}

export class MavenRunner {
  private running = new Map<number, ChildProcess>();

  async run(options: MavenRunOptions): Promise<RunResult> {
    const mvnwCmd = join(options.working_dir, "mvnw.cmd");
    const mvnwSh = join(options.working_dir, "mvnw");
    let command: string[];
    if (existsSync(mvnwCmd)) {
      command = ["cmd", "/c", mvnwCmd, ...options.goals];
    } else if (existsSync(mvnwSh)) {
      command = ["bash", mvnwSh, ...options.goals];
    } else {
      const mvnExecutable = resolveMavenExecutable();
      command = mvnExecutable.endsWith(".cmd")
        ? ["cmd", "/c", mvnExecutable, ...options.goals]
        : [mvnExecutable, ...options.goals];
    }

    for (const profile of options.profiles ?? []) {
      command.push(`-P${profile}`);
    }
    for (const [key, value] of Object.entries(options.properties ?? {})) {
      command.push(`-D${key}=${value}`);
    }
    command.push("-B", "-ntp");

    mkdirSync(options.log_dir, { recursive: true });
    const stdoutLog = join(options.log_dir, "maven-stdout.log");
    const stderrLog = join(options.log_dir, "maven-stderr.log");
    writeFileSync(stdoutLog, "");
    writeFileSync(stderrLog, "");

    const started = Date.now();
    const child = spawn(command[0]!, command.slice(1), {
      cwd: resolve(options.working_dir),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      env: { ...process.env, ...(options.env ?? {}) },
    });
    this.running.set(child.pid!, child);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      this.killTree(child);
    }, options.timeout_ms);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      appendFileSync(stdoutLog, chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      appendFileSync(stderrLog, chunk.toString("utf8"));
    });

    const exitCode = await new Promise<number>((resolveExit) => {
      child.on("exit", (code) => resolveExit(code ?? -1));
      child.on("error", () => resolveExit(-1));
    });

    clearTimeout(timer);
    this.running.delete(child.pid!);

    return {
      exit_code: exitCode,
      duration_ms: Date.now() - started,
      stdout_log_path: stdoutLog,
      stderr_log_path: stderrLog,
      command,
      timed_out: timedOut,
    };
  }

  killTree(child: ChildProcess): void {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false, windowsHide: true });
      } else {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
      }
    } catch {
      // process zaten sonlanmis olabilir
    }
  }

  stopAll(): void {
    for (const [, child] of this.running) {
      this.killTree(child);
    }
    this.running.clear();
  }
}

export function commandDigest(command: string[], workingDir: string): string {
  return createHash("sha256").update(JSON.stringify({ command, workingDir }), "utf8").digest("hex");
}

export function resolveMavenExecutable(): string {
  if (process.platform !== "win32") {
    return "mvn";
  }
  const pathEnv = process.env["PATH"] ?? "";
  for (const dir of pathEnv.split(";")) {
    if (dir.length === 0) {
      continue;
    }
    const candidate = join(dir, "mvn.cmd");
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new AppError("BLOCKED_ISOLATION", "Maven bulunamadi (mvn.cmd PATH'te yok); mvnw wrapper da mevcut degil");
}

export function assertRunCompleted(result: RunResult, phase: string): void {
  if (result.timed_out) {
    throw new AppError("BLOCKED_ISOLATION", `${phase} timeout: ${result.duration_ms} ms`);
  }
}
