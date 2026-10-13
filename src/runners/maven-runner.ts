/** Native Windows Maven execution through the central command and process contracts. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "../domain/errors.js";
import { NativeToolchainResolver, buildNativeMavenArgv, verifyNativeToolchain, effectiveMavenEnvironment, type VerifiedNativeToolchainPlan } from "./native-toolchain.js";
import { WindowsProcessSupervisor, type NativeProcessLifecycle, type NativeProcessResult } from "./windows-process-supervisor.js";

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
  stdout_rendered_truncated_bytes?: number;
  stderr_rendered_truncated_bytes?: number;
  stdout_truncation_reason?: NativeProcessResult["stdoutTruncationReason"];
  stderr_truncation_reason?: NativeProcessResult["stderrTruncationReason"];
  toolchain_identity?: string;
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
  expected_toolchain_identity?: string;
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

export class MavenRunner {
  private readonly running = new Set<AbortController>();

  constructor(private readonly pinnedToolchainIdentity?: string, private readonly lifecycle?: NativeProcessLifecycle,
    private readonly executionIdentityGuard?: (plan: VerifiedNativeToolchainPlan) => void) {}

  async run(options: MavenRunOptions): Promise<RunResult> {
    const env = effectiveMavenEnvironment(process.env, options.env);
    const resolveOptions = {
      cwd: options.working_dir, env,
      ...(options.executable !== undefined ? { executable: options.executable } : {}),
      ...(options.prefer_wrapper ? { preferWrapper: true } : {}),
      ...(options.settings_path !== undefined ? { settingsPath: options.settings_path } : {}),
      ...(options.toolchains_path !== undefined ? { toolchainsPath: options.toolchains_path } : {}),
      ...(options.profiles ? { profiles: options.profiles } : {}),
    };
    const toolchain = NativeToolchainResolver.resolve(resolveOptions);
    const argv = buildNativeMavenArgv({
      goals: options.goals,
      ...(options.profiles ? { profiles: options.profiles } : {}),
      ...(options.properties ? { properties: options.properties } : {}),
      ...(options.settings_path !== undefined ? { settingsPath: options.settings_path } : {}),
      ...(options.toolchains_path !== undefined ? { toolchainsPath: options.toolchains_path } : {}),
    });
    const command = [toolchain.executable, ...argv];
    const controller = new AbortController();
    this.running.add(controller);
    let result: NativeProcessResult;
    let effectiveIdentity: string;
    try {
      const verified = await verifyNativeToolchain(toolchain, env, controller.signal, this.lifecycle);
      effectiveIdentity = verified.identity;
      if (this.pinnedToolchainIdentity !== undefined && this.pinnedToolchainIdentity !== effectiveIdentity) {
        throw new AppError("BLOCKED_ISOLATION", "Maven/Java toolchain changed since customer preflight", {
          reason_code: "TOOLCHAIN_IDENTITY_CHANGED",
        });
      }
      if (options.expected_toolchain_identity !== undefined && options.expected_toolchain_identity !== effectiveIdentity) {
        throw new AppError("BLOCKED_ISOLATION", "Maven/Java toolchain changed since the approved plan", {
          reason_code: "TOOLCHAIN_IDENTITY_CHANGED",
        });
      }
      this.executionIdentityGuard?.(verified);
      // The guard can run after the -v probe while the selected .cmd or
      // inherited .mvn/settings bytes change. Re-read every resolver input
      // at the last JS boundary before asking the native helper to launch.
      let launchPlan: ReturnType<typeof NativeToolchainResolver.resolve>;
      try { launchPlan = NativeToolchainResolver.resolve(resolveOptions); }
      catch { throw new AppError("BLOCKED_ISOLATION", "Maven launch inputs changed", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" }); }
      if (launchPlan.identity !== verified.baseIdentity || launchPlan.executable !== verified.executable ||
          launchPlan.cwd !== verified.cwd || launchPlan.source !== verified.source) {
        throw new AppError("BLOCKED_ISOLATION", "Maven launch inputs changed", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" });
      }
      mkdirSync(options.log_dir, { recursive: true });
      const goalPlan = {
        executable: toolchain.executable, cwd: toolchain.cwd, argv,
        timeoutMs: options.timeout_ms, env,
        ...(this.lifecycle ? { pinnedInputs: verified.pinnedInputs } : {}),
      };
      result = await new WindowsProcessSupervisor().run(goalPlan, controller.signal, this.lifecycle);
    } finally {
      this.running.delete(controller);
    }
    const stdoutLog = join(options.log_dir, "maven-stdout.log");
    const stderrLog = join(options.log_dir, "maven-stderr.log");
    writeFileSync(stdoutLog, result.stdout);
    writeFileSync(stderrLog, result.stderr);
    if (result.status !== "success" && result.status !== "nonzero") {
      const reasonCode = result.errorCode === "pin_unavailable" ? "NATIVE_INPUT_PIN_UNAVAILABLE"
        : result.errorCode === "pin_mismatch" ? "TOOLCHAIN_IDENTITY_CHANGED"
        : `NATIVE_MAVEN_${result.status.toUpperCase()}`;
      throw new AppError("BLOCKED_ISOLATION", `Native Maven ${result.status}`, {
        reason_code: reasonCode,
        stdout_log_path: stdoutLog,
        stderr_log_path: stderrLog,
        stdout_truncated_bytes: result.stdoutTruncatedBytes,
        stderr_truncated_bytes: result.stderrTruncatedBytes,
        stdout_rendered_truncated_bytes: result.stdoutRenderedTruncatedBytes ?? 0,
        stderr_rendered_truncated_bytes: result.stderrRenderedTruncatedBytes ?? 0,
        ...(result.stdoutTruncationReason ? { stdout_truncation_reason: result.stdoutTruncationReason } : {}),
        ...(result.stderrTruncationReason ? { stderr_truncation_reason: result.stderrTruncationReason } : {}),
        toolchain_identity: effectiveIdentity,
      });
    }
    return {
      exit_code: result.exitCode ?? -1,
      duration_ms: result.durationMs,
      stdout_log_path: stdoutLog,
      stderr_log_path: stderrLog,
      command,
      timed_out: false,
      native_status: result.status,
      stdout_truncated_bytes: result.stdoutTruncatedBytes,
      stderr_truncated_bytes: result.stderrTruncatedBytes,
      stdout_rendered_truncated_bytes: result.stdoutRenderedTruncatedBytes ?? 0,
      stderr_rendered_truncated_bytes: result.stderrRenderedTruncatedBytes ?? 0,
      ...(result.stdoutTruncationReason ? { stdout_truncation_reason: result.stdoutTruncationReason } : {}),
      ...(result.stderrTruncationReason ? { stderr_truncation_reason: result.stderrTruncationReason } : {}),
      toolchain_identity: effectiveIdentity,
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
