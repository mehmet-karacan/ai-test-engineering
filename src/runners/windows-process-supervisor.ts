/** One Windows .cmd invocation through the owned Job Object helper. */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { setTimeout as delay } from "node:timers/promises";
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
  /** Frozen resolver snapshot; these hashes must never be refreshed before a goal run. */
  pinnedInputs?: ReadonlyArray<{ path: string; sha256: string | null }>;
}

export interface NativeProcessLifecycle {
  beforeSpawn(plan: NativeProcessPlan): void;
  afterSpawn(pid: number | undefined): void;
  afterTerminal(result: NativeProcessResult): void;
}

export interface NativeProcessResult {
  status: "success" | "nonzero" | "spawn_error" | "timeout" | "cancelled";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stdoutTruncatedBytes: number;
  stderrTruncatedBytes: number;
  stdoutTruncationReason?: "BYTE_BUDGET_EXCEEDED";
  stderrTruncationReason?: "BYTE_BUDGET_EXCEEDED";
  durationMs: number;
  errorCode?: string;
  /** Set only after the helper proves an empty Job Object or pre-spawn refusal. */
  ownedTreeDrained?: boolean;
  /** Helper exited 102 after a pin refusal, before CreateProcess was called. */
  preSpawnNoChild?: boolean;
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

/** Complete path set, including absent optional config, for snapshot coverage. */
export function processPinPaths(plan: NativeProcessPlan): string[] {
  const paths = new Map<string, string>();
  const add = (path: string, required: boolean): void => {
    const absolute = resolve(path);
    if (!isAbsolute(path) || !/^[a-z]:\\/iu.test(absolute)) {
      throw new AppError("BLOCKED_ISOLATION", "Native pin requires an absolute drive path", { reason_code: "TOOLCHAIN_PIN_UNVERIFIED" });
    }
    if (required && !existsSync(absolute)) {
      throw new AppError("BLOCKED_ISOLATION", "Required native pin is missing", { reason_code: "TOOLCHAIN_PIN_UNVERIFIED" });
    }
    if (existsSync(absolute) && !statSync(absolute).isFile()) {
      throw new AppError("BLOCKED_ISOLATION", "Native pin is not a file", { reason_code: "TOOLCHAIN_PIN_UNVERIFIED" });
    }
    paths.set(absolute.toLowerCase(), absolute);
  };
  add(plan.executable, true);
  for (let cursor = resolve(plan.cwd); ; cursor = dirname(cursor)) {
    for (const name of ["jvm.config", "maven.config", "extensions.xml"]) add(join(cursor, ".mvn", name), false);
    if (dirname(cursor) === cursor) break;
  }
  for (const name of ["settings.xml", "toolchains.xml"]) add(join(homedir(), ".m2", name), false);
  for (let i = 0; i < plan.argv.length; i += 1) {
    if (plan.argv[i] === "-s" || plan.argv[i] === "-t") add(plan.argv[++i] ?? "", true);
  }
  if (basename(plan.executable).toLowerCase() === "mvnw.cmd") {
    add(join(dirname(plan.executable), ".mvn", "wrapper", "maven-wrapper.properties"), true);
    add(join(dirname(plan.executable), ".mvn", "wrapper", "maven-wrapper.jar"), true);
  }
  return [...paths.values()];
}

/** Native helper compares these digests against no-follow handles before it starts cmd. */
function collectPinnedFiles(plan: NativeProcessPlan): Array<{ path: string; sha256: string }> {
  const paths = processPinPaths(plan);
  if (plan.pinnedInputs) {
    const expected = new Map<string, { path: string; sha256: string | null }>();
    for (const input of plan.pinnedInputs) {
      if (!isAbsolute(input.path) || (input.sha256 !== null && !/^[a-f0-9]{64}$/u.test(input.sha256))) {
        throw new AppError("BLOCKED_ISOLATION", "Malformed native pin", { reason_code: "TOOLCHAIN_PIN_UNVERIFIED" });
      }
      const key = resolve(input.path).toLowerCase();
      if (expected.has(key)) throw new AppError("BLOCKED_ISOLATION", "Duplicate native pin", { reason_code: "TOOLCHAIN_PIN_UNVERIFIED" });
      expected.set(key, input);
    }
    if (expected.size !== paths.length || paths.some((path) => !expected.has(path.toLowerCase()))) {
      throw new AppError("BLOCKED_ISOLATION", "Incomplete native pin snapshot", { reason_code: "TOOLCHAIN_PIN_UNVERIFIED" });
    }
    return paths.map((path) => ({ path, sha256: expected.get(path.toLowerCase())!.sha256 ?? "-" }));
  }
  // Standalone version probes may capture a fresh local snapshot. A goal run
  // supplies pinnedInputs from the approved resolver identity instead.
  return paths.filter((path) => existsSync(path)).map((path) => ({
    path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  }));
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

/** A locked Windows control file can outlive the helper's close event briefly. */
export async function cleanupOwnedProcessControlRoot(
  root: string,
  remove: (path: string) => void = (path) => rmSync(path, { recursive: true, force: true }),
): Promise<boolean> {
  const tempRoot = resolve(tmpdir());
  const target = resolve(root);
  const inside = relative(tempRoot, target);
  if (!isAbsolute(root) || inside === "" || inside.startsWith("..") || isAbsolute(inside) ||
      !basename(target).startsWith("aitest-owned-process-")) return false;
  try {
    if (lstatSync(target).isSymbolicLink() || realpathSync.native(target).toLowerCase() !== target.toLowerCase()) return false;
  } catch { return false; }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try { remove(target); return true; }
    catch (error) {
      if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "") || attempt === 11) return false;
      await delay(50);
    }
  }
  return false;
}

export class WindowsProcessSupervisor {
  async run(plan: NativeProcessPlan, signal?: AbortSignal, lifecycle?: NativeProcessLifecycle): Promise<NativeProcessResult> {
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
    const pinnedFiles = collectPinnedFiles(plan);
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
    const stagedHelper = join(controlRoot, "windows-process-helper.exe");
    try {
      copyFileSync(HELPER, stagedHelper);
      const manifest = JSON.parse(readFileSync(HELPER_MANIFEST, "utf8")) as { binary_sha256: string };
      const copiedHash = createHash("sha256").update(readFileSync(stagedHelper)).digest("hex");
      if (copiedHash !== manifest.binary_sha256) throw new Error("staged helper digest mismatch");
    } catch {
      const cleaned = await cleanupOwnedProcessControlRoot(controlRoot);
      return { status: "spawn_error", exitCode: null, stdout: "", stderr: "", stdoutTruncatedBytes: 0, stderrTruncatedBytes: 0,
        durationMs: Date.now() - started, errorCode: cleaned ? "HELPER_STAGE_FAILED" : "HELPER_CONTROL_CLEANUP_FAILED" };
    }
    try { lifecycle?.beforeSpawn(plan); }
    catch (error) {
      if (!await cleanupOwnedProcessControlRoot(controlRoot)) {
        throw new AppError("BLOCKED_ISOLATION", "Native helper control cleanup failed", { reason_code: "HELPER_CONTROL_CLEANUP_FAILED" });
      }
      throw error;
    }
    let child: ChildProcess;
    try {
      const nativeCommand = `"${cmd}" /d /s /v:off /c ${commandLine}`;
      child = spawn(stagedHelper, [statusPath, plan.cwd, cmd, nativeCommand,
        ...pinnedFiles.flatMap(({ path, sha256 }) => [sha256, path])], {
        cwd: plan.cwd, env: plan.env, shell: false,
        windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      const cleaned = await cleanupOwnedProcessControlRoot(controlRoot);
      return { status: "spawn_error", exitCode: null, stdout: "", stderr: "", stdoutTruncatedBytes: 0, stderrTruncatedBytes: 0, durationMs: Date.now() - started, errorCode: cleaned ? (error as NodeJS.ErrnoException).code ?? "UNKNOWN" : "HELPER_CONTROL_CLEANUP_FAILED" };
    }
    let registrationFailed = false;
    try { lifecycle?.afterSpawn(child.pid); }
    catch {
      registrationFailed = true;
      // Only the helper PID returned by this spawn is targeted. Closing it
      // closes the Job Object handle; the durable record remains unresolved.
      child.kill();
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
    const cleaned = await cleanupOwnedProcessControlRoot(controlRoot);
    const validExit = helperStatus?.kind === "exited" && helperStatus.win32_error === 0 &&
      Number.isSafeInteger(helperStatus.exit_code) && helperStatus.exit_code >= 0 && helperStatus.exit_code <= 0xffffffff;
    const validCancelled = helperStatus?.kind === "cancelled" && helperStatus.win32_error === 0 && completion.code === 101;
    const preSpawnNoChild = cleaned && !registrationFailed && completion.code === 102 &&
      (helperStatus?.kind === "pin_unavailable" || helperStatus?.kind === "pin_mismatch") &&
      Number.isSafeInteger(helperStatus.win32_error) && helperStatus.win32_error > 0;
    const status = !cleaned || registrationFailed ? "spawn_error" : reason && validCancelled ? reason :
      (completion.errorCode || !validExit || completion.code !== 0 ? "spawn_error" :
      helperStatus?.exit_code === 0 ? "success" : "nonzero");
    const result: NativeProcessResult = {
      status, exitCode: validExit ? helperStatus?.exit_code ?? null : null, stdout: stdout.text(), stderr: stderr.text(),
      stdoutTruncatedBytes: stdout.dropped, stderrTruncatedBytes: stderr.dropped,
      ...(stdout.dropped > 0 ? { stdoutTruncationReason: "BYTE_BUDGET_EXCEEDED" as const } : {}),
      ...(stderr.dropped > 0 ? { stderrTruncationReason: "BYTE_BUDGET_EXCEEDED" as const } : {}),
      durationMs: Date.now() - started,
      ownedTreeDrained: preSpawnNoChild || (status !== "spawn_error" && (validExit || validCancelled)),
      preSpawnNoChild,
      ...(status === "spawn_error" ? { errorCode: !cleaned ? "HELPER_CONTROL_CLEANUP_FAILED" : registrationFailed ? "NATIVE_REGISTRY_WRITE_FAILED" : completion.errorCode ?? helperStatus?.kind ?? "HELPER_STATUS_MISSING" } : {}),
    };
    try { lifecycle?.afterTerminal(result); }
    catch { return { ...result, status: "spawn_error", exitCode: null, errorCode: "NATIVE_REGISTRY_COMMIT_FAILED" }; }
    return result;
  }
}
