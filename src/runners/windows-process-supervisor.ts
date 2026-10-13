/** One Windows .cmd invocation through the owned Job Object helper. */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { AppError } from "../domain/errors.js";

const UNSUPPORTED = /[%!^|<>"\r\n\0]/u;
const DEFAULT_LOG_BUDGET = 8 * 1024 * 1024;
const HELPER = fileURLToPath(new URL("../../native/bin/windows-process-helper.exe", import.meta.url));
const HELPER_MANIFEST = fileURLToPath(new URL("../../native/windows-process-helper.manifest.json", import.meta.url));

interface HelperStatus { kind: "exited" | "cancelled" | "owner_lost" | string; win32_error: number; exit_code: number }

export function assertWindowsProcessHelper(): void {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new AppError("BLOCKED_ISOLATION", "Windows x64 Job Object helper required", {
      reason_code: "NATIVE_PROCESS_OWNERSHIP_UNVERIFIED",
    });
  }
  try {
    const manifest = JSON.parse(readFileSync(HELPER_MANIFEST, "utf8")) as {
      schema_version?: number; source_sha256?: string; binary_sha256?: string;
    };
    const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
    if (manifest.schema_version !== 1 || !/^[a-f0-9]{64}$/.test(manifest.binary_sha256 ?? "") ||
        !/^[a-f0-9]{64}$/.test(manifest.source_sha256 ?? "") ||
        hash(readFileSync(HELPER)) !== manifest.binary_sha256 ||
        hash(readFileSync(fileURLToPath(new URL("../../native/windows-process-helper.cpp", import.meta.url)))) !== manifest.source_sha256) {
      throw new Error("helper hash mismatch");
    }
  } catch {
    throw new AppError("BLOCKED_ISOLATION", "Windows Job Object helper provenance unavailable", {
      reason_code: "NATIVE_PROCESS_OWNERSHIP_UNVERIFIED",
    });
  }
}

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
    assertWindowsProcessHelper();
    const controlRoot = mkdtempSync(join(tmpdir(), "aitest-owned-process-"));
    const statusPath = join(controlRoot, "status.json");
    let child: ChildProcess;
    try {
      const nativeCommand = `"${cmd}" /d /s /v:off /c ${commandLine}`;
      child = spawn(HELPER, [statusPath, plan.cwd, cmd, nativeCommand], {
        cwd: plan.cwd, env: plan.env, shell: false,
        windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      rmSync(controlRoot, { recursive: true, force: true });
      return { status: "spawn_error", exitCode: null, stdout: "", stderr: "", stdoutTruncatedBytes: 0, stderrTruncatedBytes: 0, durationMs: Date.now() - started, errorCode: (error as NodeJS.ErrnoException).code ?? "UNKNOWN" };
    }
    child.stdout?.on("data", (data: Buffer) => stdout.append(data));
    child.stderr?.on("data", (data: Buffer) => stderr.append(data));
    let reason: "timeout" | "cancelled" | undefined;
    child.stdin?.on("error", () => { /* helper may close after natural completion */ });
    let fallbackTimer: NodeJS.Timeout | undefined;
    const stop = (why: "timeout" | "cancelled"): void => {
      if (reason || child.exitCode !== null) return;
      reason = why;
      try { if (child.stdin && !child.stdin.destroyed) child.stdin.write("C"); }
      catch { /* helper exit races cancellation; status still decides */ }
      // Killing our own helper closes its only Job Object handle. This never
      // targets a remembered Maven/JVM PID, including after PID reuse.
      fallbackTimer = setTimeout(() => { if (child.exitCode === null) child.kill(); }, 5000);
    };
    const completionPromise = new Promise<{ code: number | null; errorCode?: string }>((resolveDone) => {
      let spawnError: string | undefined;
      child.on("error", (error: NodeJS.ErrnoException) => { spawnError = error.code ?? "UNKNOWN"; });
      child.on("close", (code) => resolveDone(spawnError ? { code, errorCode: spawnError } : { code }));
    });
    const timer = setTimeout(() => stop("timeout"), Math.max(0, plan.timeoutMs - (Date.now() - started)));
    const onAbort = (): void => stop("cancelled");
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const completion = await completionPromise;
    clearTimeout(timer);
    if (fallbackTimer) clearTimeout(fallbackTimer);
    signal?.removeEventListener("abort", onAbort);
    let helperStatus: HelperStatus | undefined;
    try { helperStatus = JSON.parse(readFileSync(statusPath, "utf8")) as HelperStatus; }
    catch { /* Missing/invalid status is a typed ownership failure. */ }
    rmSync(controlRoot, { recursive: true, force: true });
    const validExit = helperStatus?.kind === "exited" && helperStatus.win32_error === 0 &&
      Number.isSafeInteger(helperStatus.exit_code) && helperStatus.exit_code >= 0 && helperStatus.exit_code <= 0xffffffff;
    const validCancelled = helperStatus?.kind === "cancelled" && helperStatus.win32_error === 0 && completion.code === 101;
    const status = reason && validCancelled ? reason :
      (completion.errorCode || !validExit || completion.code !== 0 ? "spawn_error" :
      helperStatus?.exit_code === 0 ? "success" : "nonzero");
    return {
      status, exitCode: validExit ? helperStatus?.exit_code ?? null : null, stdout: stdout.text(), stderr: stderr.text(),
      stdoutTruncatedBytes: stdout.dropped, stderrTruncatedBytes: stderr.dropped,
      durationMs: Date.now() - started,
      ...(status === "spawn_error" ? { errorCode: completion.errorCode ?? helperStatus?.kind ?? "HELPER_STATUS_MISSING" } : {}),
    };
  }
}
