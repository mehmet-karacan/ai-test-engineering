import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, readSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { CandidateChangeSetSchema } from "../opencode/model-schemas.js";
import { WindowsProcessSupervisor, processPinPaths, type NativeProcessLifecycle, type NativeProcessPlan } from "../../runners/windows-process-supervisor.js";

export type CliBackendConfig = { kind: "cli_json"; command: string[] } | { kind: "codex_cli"; executable: string; auth_home?: string };
export type CliCandidateErrorKind = "TIMEOUT" | "CANCELLED" | "PROVIDER_ERROR" | "EMPTY_FINAL" | "TRUNCATED_JSON";
export class CliCandidateError extends Error {
  constructor(readonly kind: CliCandidateErrorKind) { super(`CLI candidate request failed: ${kind}`); this.name = "CliCandidateError"; }
}
interface CliOptions {
  backend: CliBackendConfig; workRoot: string; envReferenceNames?: string[];
  pinnedInputs?: Array<{ path: string; sha256: string }>; lifecycle?: NativeProcessLifecycle;
}
interface GenerateOptions {
  session_id: string; prompt: string; model: { providerID: string; modelID: string };
  timeout_ms: number; max_output_bytes: number; signal?: AbortSignal;
}
interface ActiveCall { controller: AbortController; done: Promise<unknown> }
const BRIDGE = fileURLToPath(new URL("../../../scripts/cli-candidate-bridge.mjs", import.meta.url));
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PROMPT_BYTES = 4 * 1024 * 1024;
const BASE_ENV = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOME", "HOMEDRIVE", "HOMEPATH", "LANG", "TZ", "NO_COLOR"]);
const hashFile = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
function regularAbsolute(path: string): void {
  if (!isAbsolute(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile() || realpathSync.native(path).toLowerCase() !== resolve(path).toLowerCase()) throw new CliCandidateError("PROVIDER_ERROR");
}
function environment(names: string[], backend: CliBackendConfig): NodeJS.ProcessEnv {
  const approved = new Set([...BASE_ENV, ...names.map((name) => name.toUpperCase())]);
  if (names.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || ["NODE_OPTIONS", "NODE_PATH", "CODEX_HOME"].includes(name.toUpperCase()))) throw new CliCandidateError("PROVIDER_ERROR");
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (approved.has(key.toUpperCase()) && value !== undefined) env[key] = value;
  if (backend.kind === "codex_cli" && backend.auth_home) env.CODEX_HOME = backend.auth_home;
  return env;
}
function cleanupCallRoot(callRoot: string, workRoot: string): void {
  const inside = relative(resolve(workRoot), resolve(callRoot));
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new CliCandidateError("PROVIDER_ERROR");
  try { rmSync(callRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
  catch { throw new CliCandidateError("PROVIDER_ERROR"); }
}
function readBounded(path: string, limit: number): string {
  regularAbsolute(path);
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(limit + 1); const size = readSync(fd, buffer, 0, buffer.length, 0);
    if (size > limit) throw new CliCandidateError("TRUNCATED_JSON");
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size));
  } finally { closeSync(fd); }
}
// Codex strict structured outputs require every property; only schema-optional
// fields become nullable. Required engine fields retain their original types.
function strictSchema(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(strictSchema);
  if (!input || typeof input !== "object") return input;
  const out = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, strictSchema(value)]));
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    const properties = out.properties as Record<string, unknown>;
    const required = new Set(Array.isArray(out.required) ? out.required as string[] : []);
    for (const key of Object.keys(properties)) if (!required.has(key)) properties[key] = { anyOf: [properties[key], { type: "null" }] };
    out.required = Object.keys(properties); out.additionalProperties = false;
  }
  return out;
}
function normalizeCodex(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out = value as Record<string, unknown>;
  for (const key of ["base_checkpoint", "parent_hash"]) if (out[key] === null) delete out[key];
  if (Array.isArray(out.changes)) for (const item of out.changes) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    for (const key of ["before_hash", "after_hash", "new_content", "patch"]) if (item[key] === null) delete item[key];
  }
  return out;
}
export class CliCandidateClient {
  private readonly options: CliOptions;
  private readonly frozenPins: Array<{ path: string; sha256: string }>;
  private readonly sessions = new Set<string>();
  private readonly cancelled = new Set<string>();
  private readonly active = new Map<string, ActiveCall>();
  private stopped = false;
  constructor(options: CliOptions) {
    const { lifecycle: _lifecycle, ...serializable } = options;
    this.options = structuredClone(serializable);
    if (options.lifecycle) this.options.lifecycle = options.lifecycle;
    try {
      if (!isAbsolute(options.workRoot)) throw new Error("root");
      if (options.backend.kind === "codex_cli" && options.backend.auth_home !== undefined && !isAbsolute(options.backend.auth_home)) throw new Error("auth root");
      const command = options.backend.kind === "cli_json" ? options.backend.command : [options.backend.executable];
      if (!command.length || !command[0]?.toLowerCase().endsWith(".exe")) throw new Error("executable");
      regularAbsolute(command[0]);
      const pins = new Map<string, { path: string; sha256: string }>();
      for (const input of options.pinnedInputs ?? []) {
        if (!isAbsolute(input.path) || !/^[a-f0-9]{64}$/u.test(input.sha256) || pins.has(resolve(input.path).toLowerCase())) throw new Error("pin");
        pins.set(resolve(input.path).toLowerCase(), { ...input });
      }
      for (const path of [command[0], ...command.slice(1).filter((arg) => isAbsolute(arg) && existsSync(arg) && statSync(arg).isFile()), process.execPath, BRIDGE]) {
        regularAbsolute(path);
        if (!pins.has(resolve(path).toLowerCase())) pins.set(resolve(path).toLowerCase(), { path, sha256: hashFile(path) });
      }
      this.frozenPins = [...pins.values()];
    } catch { throw new CliCandidateError("PROVIDER_ERROR"); }
  }
  async createSession(): Promise<{ session_id: string }> {
    if (this.stopped) throw new CliCandidateError("CANCELLED");
    const session_id = randomUUID(); this.sessions.add(session_id); return { session_id };
  }
  async generate(request: GenerateOptions): Promise<{ value: unknown; text: string; message_id: string | null; usage: { input_tokens: number | null; output_tokens: number | null } }> {
    if (this.stopped || this.cancelled.has(request.session_id) || request.signal?.aborted) throw new CliCandidateError("CANCELLED");
    if (!this.sessions.has(request.session_id) || this.active.has(request.session_id)) throw new CliCandidateError("PROVIDER_ERROR");
    if (!Number.isSafeInteger(request.max_output_bytes) || request.max_output_bytes < 1 || request.max_output_bytes > MAX_BYTES || !Number.isSafeInteger(request.timeout_ms) || request.timeout_ms <= 0 || request.timeout_ms > 900000 || Buffer.byteLength(request.prompt) > MAX_PROMPT_BYTES) throw new CliCandidateError("PROVIDER_ERROR");
    const controller = new AbortController();
    const abort = (): void => controller.abort(); request.signal?.addEventListener("abort", abort, { once: true });
    const done = this.run(request, controller.signal);
    this.active.set(request.session_id, { controller, done });
    try { return await done; }
    finally { request.signal?.removeEventListener("abort", abort); this.active.delete(request.session_id); }
  }
  private async run(request: GenerateOptions, signal: AbortSignal) {
    let callRoot: string | undefined;
    try {
      mkdirSync(this.options.workRoot, { recursive: true, mode: 0o700 });
      if (lstatSync(this.options.workRoot).isSymbolicLink() || realpathSync.native(this.options.workRoot).toLowerCase() !== resolve(this.options.workRoot).toLowerCase()) throw new CliCandidateError("PROVIDER_ERROR");
      callRoot = mkdtempSync(join(this.options.workRoot, "call-"));
      const cwd = join(callRoot, "cwd"); mkdirSync(cwd);
      const requestFile = join(callRoot, "request.json"); const responseFile = join(callRoot, "response.json");
      const schemaFile = join(callRoot, "schema.json"); const lastMessageFile = join(callRoot, "last-message.json");
      const schema = z.toJSONSchema(CandidateChangeSetSchema);
      writeFileSync(schemaFile, JSON.stringify(this.options.backend.kind === "codex_cli" ? strictSchema(schema) : schema), { flag: "wx", mode: 0o600 });
      writeFileSync(requestFile, JSON.stringify({ schema_version: 1, backend: this.options.backend, prompt: request.prompt, model: request.model, json_schema: schema, max_output_bytes: request.max_output_bytes, responseFile, schemaFile, lastMessageFile }), { flag: "wx", mode: 0o600 });
      const plan: NativeProcessPlan = { invocationKind: "cli", executable: process.execPath, argv: [BRIDGE, requestFile], cwd, pinRoot: callRoot, env: environment(this.options.envReferenceNames ?? [], this.options.backend), timeoutMs: request.timeout_ms, maxLogBytes: 1024, pinnedInputs: [] };
      const pins = new Map(this.frozenPins.map((pin) => [resolve(pin.path).toLowerCase(), pin]));
      for (const path of [...processPinPaths(plan), schemaFile]) if (!pins.has(resolve(path).toLowerCase())) pins.set(resolve(path).toLowerCase(), { path, sha256: hashFile(path) });
      plan.pinnedInputs = [...pins.values()];
      const result = await new WindowsProcessSupervisor().run(plan, signal, this.options.lifecycle);
      if (result.status === "timeout") throw new CliCandidateError("TIMEOUT");
      if (result.status === "cancelled" || signal.aborted || this.cancelled.has(request.session_id) || this.stopped) throw new CliCandidateError("CANCELLED");
      if (result.status !== "success" || !result.ownedTreeDrained || result.stdoutTruncatedBytes || result.stderrTruncatedBytes) throw new CliCandidateError("PROVIDER_ERROR");
      const response = JSON.parse(result.stdout) as { kind?: CliCandidateErrorKind | "OK"; text?: string };
      if (response.kind && ["PROVIDER_ERROR", "EMPTY_FINAL", "TRUNCATED_JSON"].includes(response.kind)) throw new CliCandidateError(response.kind as CliCandidateErrorKind);
      if (response.kind !== "OK") throw new CliCandidateError("PROVIDER_ERROR");
      const text = readBounded(responseFile, request.max_output_bytes);
      let value: unknown;
      try { value = JSON.parse(text); } catch { throw new CliCandidateError("TRUNCATED_JSON"); }
      if (this.options.backend.kind === "codex_cli") value = normalizeCodex(value);
      return { value, text: JSON.stringify(value), message_id: null, usage: { input_tokens: null, output_tokens: null } };
    } catch (error) { if (error instanceof CliCandidateError) throw error; throw new CliCandidateError("PROVIDER_ERROR"); }
    finally { if (callRoot) cleanupCallRoot(callRoot, this.options.workRoot); }
  }
  async abortSession(id: string): Promise<void> {
    this.cancelled.add(id); const active = this.active.get(id); active?.controller.abort(); await active?.done.catch(() => {});
  }
  async stopOwnedServer(): Promise<void> {
    this.stopped = true; for (const active of this.active.values()) active.controller.abort();
    await Promise.all([...this.active.values()].map((active) => active.done.catch(() => {})));
  }
}
