/** Native Windows Maven execution through the central command and process contracts. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "../domain/errors.js";
import { NativeToolchainResolver, buildNativeMavenArgv } from "./native-toolchain.js";
import { WindowsProcessSupervisor, type NativeProcessResult } from "./windows-process-supervisor.js";

export interface RunResult {
  exit_code: number;
  duration_ms: number;
  stdout_log_path: string;
  stderr_log_path: string;
  command: string[];
  timed_out: boolean;
  native_status?: NativeProcessResult["status"];
  stdout_truncated_bytes?: number;
  stderr_truncated_bytes?: number;
}

export interface MavenRunOptions {
  working_dir: string;
  goals: string[];
  profiles?: string[];
  properties?: Record<string, string>;
  timeout_ms: number;
  log_dir: string;
  env?: Record<string, string>;
  executable?: string;
  prefer_wrapper?: boolean;
  settings_path?: string;
  toolchains_path?: string;
}

/** Runtime test/coverage flags override skip and failure-ignore settings from a POM. */
export function strictTestExecutionProperties(): Record<string, string> {
  return {
    skipTests: "false",
    "maven.test.skip": "false",
    skipITs: "false",
    testFailureIgnore: "false",
    "maven.test.failure.ignore": "false",
    "jacoco.skip": "false",
    failIfNoTests: "true",
  };
}

function effectiveEnvironment(overrides: Record<string, string> | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    for (const existing of Object.keys(env)) {
      if (existing.toLowerCase() === key.toLowerCase()) delete env[existing];
    }
    env[key] = value;
  }
  return env;
}

export class MavenRunner {
  private readonly running = new Set<AbortController>();

  async run(options: MavenRunOptions): Promise<RunResult> {
    const env = effectiveEnvironment(options.env);
    const toolchain = NativeToolchainResolver.resolve({
      cwd: options.working_dir, env,
      ...(options.executable ? { executable: options.executable } : {}),
      ...(options.prefer_wrapper ? { preferWrapper: true } : {}),
      ...(options.settings_path ? { settingsPath: options.settings_path } : {}),
      ...(options.toolchains_path ? { toolchainsPath: options.toolchains_path } : {}),
      ...(options.profiles ? { profiles: options.profiles } : {}),
    });
    const argv = buildNativeMavenArgv({
      goals: options.goals,
      ...(options.profiles ? { profiles: options.profiles } : {}),
      ...(options.properties ? { properties: options.properties } : {}),
      ...(options.settings_path ? { settingsPath: options.settings_path } : {}),
      ...(options.toolchains_path ? { toolchainsPath: options.toolchains_path } : {}),
    });
    const command = [toolchain.executable, ...argv];
    mkdirSync(options.log_dir, { recursive: true });
    const stdoutLog = join(options.log_dir, "maven-stdout.log");
    const stderrLog = join(options.log_dir, "maven-stderr.log");
    const controller = new AbortController();
    this.running.add(controller);
    let result: NativeProcessResult;
    try {
      result = await new WindowsProcessSupervisor().run({
        executable: toolchain.executable, cwd: toolchain.cwd, argv,
        timeoutMs: options.timeout_ms, env,
      }, controller.signal);
    } finally {
      this.running.delete(controller);
    }
    writeFileSync(stdoutLog, result.stdout);
    writeFileSync(stderrLog, result.stderr);
    return {
      exit_code: result.exitCode ?? -1,
      duration_ms: result.durationMs,
      stdout_log_path: stdoutLog,
      stderr_log_path: stderrLog,
      command,
      timed_out: result.status === "timeout",
      native_status: result.status,
      stdout_truncated_bytes: result.stdoutTruncatedBytes,
      stderr_truncated_bytes: result.stderrTruncatedBytes,
    };
  }

  stopAll(): void {
    for (const controller of this.running) controller.abort();
  }
}

export function commandDigest(command: string[], workingDir: string): string {
  return createHash("sha256").update(JSON.stringify({ command, workingDir }), "utf8").digest("hex");
}

export function resolveMavenExecutable(): string {
  return NativeToolchainResolver.resolve({ cwd: process.cwd(), env: process.env }).executable;
}

export function assertRunCompleted(result: RunResult, phase: string): void {
  if (result.timed_out) {
    throw new AppError("BLOCKED_ISOLATION", `${phase} timeout: ${result.duration_ms} ms`);
  }
  if (result.native_status === "spawn_error" || result.native_status === "cancelled") {
    throw new AppError("BLOCKED_ISOLATION", `${phase} native run ${result.native_status}`);
  }
}
