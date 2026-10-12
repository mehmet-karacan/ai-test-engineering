/** One Windows .cmd invocation. The launcher owns only the child it starts. */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { AppError } from "../domain/errors.js";

const UNSUPPORTED = /[%!^|<>"\r\n\0]/u;
const DEFAULT_LOG_BUDGET = 8 * 1024 * 1024;

export interface NativeProcessPlan {
  executable: string;
  cwd: string;
  argv: string[];
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  maxLogBytes?: number;
}

export interface NativeProcessResult {
  status: "success" | "nonzero" | "spawn_error" | "timeout" | "cancelled";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stdoutTruncatedBytes: number;
  stderrTruncatedBytes: number;
  durationMs: number;
  errorCode?: string;
}

function quote(value: string): string {
  if (UNSUPPORTED.test(value)) {
    throw new AppError("INVALID_PARAMETERS", "Unsupported Windows command character");
  }
  return `"${value}"`;
}

function cmdExecutable(env: NodeJS.ProcessEnv): string {
  const root = env.SystemRoot ?? env.SYSTEMROOT ?? process.env.SystemRoot;
  if (!root) {
    throw new AppError("BLOCKED_ISOLATION", "Windows SystemRoot unavailable");
  }
  const file = join(root, "System32", "cmd.exe");
  if (!isAbsolute(file) || !existsSync(file)) {
    throw new AppError("BLOCKED_ISOLATION", "Verified cmd.exe unavailable");
  }
  return file;
}

class BoundedOutput {
  private chunks: Buffer[] = [];
  private accepted = 0;
  dropped = 0;
  constructor(private readonly limit: number) {}
  append(chunk: Buffer): void {
    const available = Math.max(0, this.limit - this.accepted);
    const size = Math.min(available, chunk.length);
    if (size) this.chunks.push(chunk.subarray(0, size));
    this.accepted += size;
    this.dropped += chunk.length - size;
  }
  text(): string {
    const decoder = new StringDecoder("utf8");
    const decoded = decoder.write(Buffer.concat(this.chunks));
    // A byte budget can end in the middle of a code point. An incomplete
    // suffix is omitted rather than introducing a replacement character.
    return this.dropped > 0 ? decoded : decoded + decoder.end();
  }
}

export class WindowsProcessSupervisor {
  async run(plan: NativeProcessPlan, signal?: AbortSignal): Promise<NativeProcessResult> {
    if (process.platform !== "win32") {
      throw new AppError("BLOCKED_ISOLATION", "UNSUPPORTED_PLATFORM");
    }
    if (!isAbsolute(plan.executable) || !plan.executable.toLowerCase().endsWith(".cmd") || !existsSync(plan.executable)) {
      throw new AppError("INVALID_PARAMETERS", "Expected existing absolute .cmd executable");
    }
    if (!isAbsolute(plan.cwd) || plan.timeoutMs <= 0 || !Number.isFinite(plan.timeoutMs)) {
      throw new AppError("INVALID_PARAMETERS", "Invalid native process cwd or timeout");
    }
    const budget = plan.maxLogBytes ?? DEFAULT_LOG_BUDGET;
    if (!Number.isSafeInteger(budget) || budget < 0 || budget > DEFAULT_LOG_BUDGET) {
      throw new AppError("INVALID_PARAMETERS", "Invalid log budget");
    }
    const cmd = cmdExecutable(plan.env);
    // /s removes only the outer pair. Every executable/argument remains quoted.
    const commandLine = `"${[plan.executable, ...plan.argv].map(quote).join(" ")}"`;
    const stdout = new BoundedOutput(budget);
    const stderr = new BoundedOutput(budget);
    const started = Date.now();
    if (signal?.aborted) {
      return { status: "cancelled", exitCode: null, stdout: "", stderr: "", stdoutTruncatedBytes: 0, stderrTruncatedBytes: 0, durationMs: 0 };
    }
    let child: ChildProcess;
    try {
      child = spawn(cmd, ["/d", "/s", "/v:off", "/c", commandLine], {
        cwd: plan.cwd, env: plan.env, shell: false, windowsVerbatimArguments: true,
        windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      return { status: "spawn_error", exitCode: null, stdout: "", stderr: "", stdoutTruncatedBytes: 0, stderrTruncatedBytes: 0, durationMs: Date.now() - started, errorCode: (error as NodeJS.ErrnoException).code ?? "UNKNOWN" };
    }
    child.stdout?.on("data", (data: Buffer) => stdout.append(data));
    child.stderr?.on("data", (data: Buffer) => stderr.append(data));
    let reason: "timeout" | "cancelled" | undefined;
    const stop = (why: "timeout" | "cancelled"): void => {
      if (reason || child.exitCode !== null || !child.pid) return;
      reason = why;
      const killer = spawn(join(plan.env.SystemRoot ?? process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
        ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", shell: false });
      killer.on("error", () => { child.kill(); });
    };
    const timer = setTimeout(() => stop("timeout"), plan.timeoutMs);
    const onAbort = (): void => stop("cancelled");
    signal?.addEventListener("abort", onAbort, { once: true });
    const completion = await new Promise<{ code: number | null; errorCode?: string }>((resolveDone) => {
      let spawnError: string | undefined;
      child.on("error", (error: NodeJS.ErrnoException) => { spawnError = error.code ?? "UNKNOWN"; });
      child.on("close", (code) => resolveDone(spawnError ? { code, errorCode: spawnError } : { code }));
    });
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    const status = reason ?? (completion.errorCode ? "spawn_error" : completion.code === 0 ? "success" : "nonzero");
    return {
      status, exitCode: completion.code, stdout: stdout.text(), stderr: stderr.text(),
      stdoutTruncatedBytes: stdout.dropped, stderrTruncatedBytes: stderr.dropped,
      durationMs: Date.now() - started,
      ...(completion.errorCode ? { errorCode: completion.errorCode } : {}),
    };
  }
}
