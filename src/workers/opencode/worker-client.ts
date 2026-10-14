/**
 * OpenCode worker adapter: yonetilen worker server'a baglanir; rol bazli gorev yollar.
 * Server crash olursa ayni job'da yeni session olusturulur; sonlanma/cancellation kayitli olur.
 * Hem legacy (`/session`) hem OpenCode 2.x (`/api/session`) HTTP yuzeyleri
 * desteklenir. 2.x, prompt/interrupt ve envelope response semasini kullanir.
 */
import { defaultWorkerConfig, workerToolFlags, type WorkerConfig } from "./worker-config.js";
import { extractJsonCandidate } from "./model-schemas.js";
import { classifyFinish, classifyHttpFailure, type WorkerOutcomeKind } from "./worker-outcome.js";

export interface SessionInfo {
  session_id: string;
  project_id?: string | undefined;
  directory?: string | undefined;
}

export interface PromptUsage {
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface WorkerPromptResult {
  session_id: string;
  message_id: string | null;
  text: string | null;
  usage: PromptUsage;
  aborted: boolean;
  /** W01/F01: tipli sonuc; her dolu finish tamamlanma degil */
  finish: string | null;
  outcome_kind: WorkerOutcomeKind;
  elapsed_ms: number;
  timed_out: boolean;
  tool_names: string[];
}

/** W01/N13: typed request hatasi; kod + maskelenen ayrinti */
export class WorkerRequestFailure extends Error {
  readonly outcome_kind: WorkerOutcomeKind;
  readonly result: WorkerPromptResult | null;

  constructor(kind: WorkerOutcomeKind, message: string, result: WorkerPromptResult | null = null) {
    super(message);
    this.name = "WorkerRequestFailure";
    this.outcome_kind = kind;
    this.result = result;
  }
}

export interface OpenCodeServerOptions {
  base_url: string;
  /** Empty for the legacy API; `/api` for OpenCode 2.x. */
  api_prefix?: string;
  username?: string;
  password?: string;
  startup_timeout_ms?: number;
}

export class OpenCodeWorkerClient {
  private readonly baseUrl: string;
  private readonly apiPrefix: string;
  private readonly username: string;
  private readonly password: string | undefined;

  constructor(options: OpenCodeServerOptions) {
    this.baseUrl = options.base_url.replace(/\/$/, "");
    const prefix = options.api_prefix ?? "";
    this.apiPrefix = prefix.length === 0 ? "" : `/${prefix.replace(/^\/+|\/+$/gu, "")}`;
    this.username = options.username ?? "opencode";
    this.password = options.password;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.password !== undefined) {
      const token = Buffer.from(`${this.username}:${this.password}`).toString("base64");
      headers["Authorization"] = `Basic ${token}`;
    }
    return headers;
  }

  private endpoint(path: string): string {
    return `${this.baseUrl}${this.apiPrefix}${path}`;
  }

  private unwrapEnvelope(value: unknown): unknown {
    if (value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "data")) {
      return (value as { data: unknown }).data;
    }
    return value;
  }

  async health(timeoutMs: number): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.endpoint(this.apiPrefix ? "/project" : "/global/health"), {
        signal: controller.signal,
        headers: this.headers(),
      });
      if (!response.ok) return false;
      if (!this.apiPrefix) return true;
      const body = await response.text();
      return body.trim().length > 0;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async createSession(directory?: string): Promise<SessionInfo> {
    const response = await fetch(this.endpoint("/session"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.apiPrefix
        ? (directory ? { location: { directory } } : {})
        : (directory ? { directory } : {})),
    });
    if (!response.ok) {
      throw new Error(`Session olusturma basarisiz: HTTP ${response.status}`);
    }
    const raw = (await response.json()) as unknown;
    const data = this.unwrapEnvelope(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Session cevabi beklenen nesne degil");
    }
    const session = data as Record<string, unknown>;
    return {
      session_id: String(session["id"] ?? ""),
      project_id: session["projectID"] !== undefined ? String(session["projectID"]) : undefined,
      directory: session["directory"] !== undefined
        ? String(session["directory"])
        : session["location"] && typeof session["location"] === "object"
          ? String((session["location"] as Record<string, unknown>)["directory"] ?? "")
          : undefined,
    };
  }

  async promptAsync(options: {
    session_id: string;
    parts: Array<Record<string, unknown>>;
    model?: { providerID: string; modelID: string };
    agent?: string;
    tools?: Record<string, boolean>;
    system?: string;
    no_reply?: boolean;
    timeout_ms?: number;
  }): Promise<{ message_id: string | null; accepted: boolean }> {
    let response: Response;
    const controller = new AbortController();
    const timer = options.timeout_ms ? setTimeout(() => controller.abort(), options.timeout_ms) : undefined;
    try {
      const text = options.parts
        .map((part) => typeof part["text"] === "string" ? part["text"] : "")
        .filter((part) => part.length > 0)
        .join("\n");
      const body = this.apiPrefix
        ? {
          text,
          ...(options.model ? { model: options.model } : {}),
          ...(options.agent ? { agent: options.agent } : {}),
          ...(options.no_reply !== undefined ? { resume: !options.no_reply } : {}),
        }
        : {
          parts: options.parts,
          ...(options.model ? { model: options.model } : {}),
          ...(options.agent ? { agent: options.agent } : {}),
          ...(options.tools ? { tools: options.tools } : {}),
          ...(options.system ? { system: options.system } : {}),
          ...(options.no_reply !== undefined ? { noReply: options.no_reply } : {}),
        };
      response = await fetch(this.endpoint(this.apiPrefix
        ? `/session/${options.session_id}/prompt`
        : `/session/${options.session_id}/prompt_async`), {
        method: "POST",
        headers: this.headers(),
        signal: controller.signal,
        body: JSON.stringify(body),
      });
    } catch (error) {
      // W01/N13: baglanti hatasi typed transport hatasi; provider ayrintisi maskelenir
      if (controller.signal.aborted) {
        throw new WorkerRequestFailure("REQUEST_TIMEOUT", "prompt_async deadline asildi");
      }
      const failure = new WorkerRequestFailure(classifyHttpFailure(0), `prompt_async transport hatasi: ${String(error)}`);
      throw failure;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
    if (!response.ok) {
      throw new WorkerRequestFailure(classifyHttpFailure(response.status), `prompt_async basarisiz: HTTP ${response.status}`);
    }
    // prompt_async resmi cevabi 204 No Content olabilir (D04/E01); v2 prompt
    // ise kabul makbuzunu {data:{id}} envelope'u icinde doner.
    if (response.status === 204) {
      return { message_id: null, accepted: true };
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength === "0") {
      return { message_id: null, accepted: true };
    }
    const text = await response.text();
    if (text.trim().length === 0) {
      return { message_id: null, accepted: true };
    }
    try {
      const data = this.unwrapEnvelope(JSON.parse(text) as unknown);
      const record = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
      return { message_id: record["id"] !== undefined ? String(record["id"]) : null, accepted: true };
    } catch {
      throw new WorkerRequestFailure("INVALID_JSON", "prompt_async cevabi JSON degil");
    }
  }

  async listMessages(session_id: string, timeoutMs = 10000): Promise<Array<Record<string, unknown>>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.endpoint(`/session/${session_id}/message`), {
        headers: this.headers(),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new WorkerRequestFailure("REQUEST_TIMEOUT", "worker mesaj listesi deadline asildi");
      }
      throw new WorkerRequestFailure("TRANSPORT_ERROR", `Mesaj listeleme transport hatasi: ${String(error)}`);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new Error(`Mesaj listeleme basarisiz: HTTP ${response.status}`);
    }
    if (response.status === 204) {
      return [];
    }
    const bodyText = await response.text();
    if (bodyText.trim().length === 0) {
      return [];
    }
    const unwrapped = this.unwrapEnvelope(JSON.parse(bodyText) as unknown);
    if (!Array.isArray(unwrapped)) return [];
    // OpenCode 2.x returns compact v2 messages (`type`, `text`) while the
    // legacy endpoint returns `{info, parts}`. Normalize both for the bounded
    // completion classifier below.
    return unwrapped.map((message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) return {};
      const record = message as Record<string, unknown>;
      if (record["info"] && typeof record["info"] === "object") return record;
      const role = record["type"] === "assistant" ? "assistant" : record["type"] === "user" ? "user" : String(record["role"] ?? record["type"] ?? "");
      const text = typeof record["text"] === "string" ? record["text"] : "";
      return {
        info: {
          id: record["id"],
          role,
          sessionID: record["sessionID"] ?? session_id,
          ...(record["finish"] !== undefined ? { finish: record["finish"] } : {}),
          ...(record["completed"] !== undefined ? { completed: record["completed"] } : {}),
          ...(record["error"] !== undefined ? { error: record["error"] } : {}),
        },
        parts: text.length > 0 ? [{ type: "text", text }] : [],
      };
    });
  }

  async abortSession(session_id: string): Promise<boolean> {
    const response = await fetch(this.endpoint(this.apiPrefix ? `/session/${session_id}/interrupt` : `/session/${session_id}/abort`), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({}),
    });
    return response.ok;
  }

  async waitForCompletion(session_id: string, options: { timeout_ms: number; poll_interval_ms?: number; request_message_id?: string | null }): Promise<WorkerPromptResult> {
    const pollInterval = options.poll_interval_ms ?? 1000;
    const started = Date.now();
    // W01/N10: ara tool adimlarindaki tool adlari biriktirilir; nihai sonucta raporlanir
    const seenToolNames: string[] = [];
    while (Date.now() - started < options.timeout_ms) {
      const beforePollRemaining = options.timeout_ms - (Date.now() - started);
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollInterval, Math.max(1, beforePollRemaining))));
      const remaining = options.timeout_ms - (Date.now() - started);
      if (remaining <= 0) {
        break;
      }
      const messages = await this.listMessages(session_id, Math.min(10000, remaining));
      // Mesaj listesi { info: Message, parts: Part[] } yapIsminda (D04/E01);
      // role/completed/id alanlari info nesnesindedir.
      const candidates = messages.filter((message) => {
        const info = (message["info"] && typeof message["info"] === "object" ? message["info"] : message) as Record<string, unknown>;
        const role = String(info["role"] ?? "");
        if (role !== "assistant") {
          return false;
        }
        const messageSession = info["sessionID"] ?? info["session_id"];
        if (messageSession !== undefined && String(messageSession) !== session_id) {
          return false;
        }
        // OpenCode surumleri prompt_async cevabini assistant id'si veya
        // parentID olarak tasiyabilir; bilinmiyorsa taze session'in son
        // assistant mesaji kullanilir.
        const requestId = options.request_message_id;
        if (!requestId) {
          return true;
        }
        const messageId = info["id"] !== undefined ? String(info["id"]) : null;
        const parentId = info["parentID"] !== undefined ? String(info["parentID"]) : info["parent_id"] !== undefined ? String(info["parent_id"]) : null;
        return messageId === requestId || parentId === requestId || messageId !== null;
      });
      const last = candidates.length > 0 ? candidates[candidates.length - 1]! : undefined;
      if (!last) {
        continue;
      }
      const info = (last["info"] && typeof last["info"] === "object" ? last["info"] : last) as Record<string, unknown>;
      const role = String(info["role"] ?? "");
      if (role !== "assistant") {
        continue;
      }
      // W01/F01: finish tipli siniflandirma; her dolu finish tamamlanma degil.
      // TOOL_STEP ara adimdir: nihai degil, gercek session bitisi beklenir; tool adlari birikir.
      const finishValue = typeof info["finish"] === "string" ? info["finish"] : null;
      const classified = classifyFinish(finishValue);
      const hardCompleted = info["completed"] === true || info["error"] !== undefined;
      if (classified.kind === "TOOL_STEP") {
        this.collectToolNames(last, seenToolNames);
        continue;
      }
      if (!classified.completed && !hardCompleted) {
        continue;
      }
      const parts = last["parts"];
      let text = "";
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (part && typeof part === "object" && part["type"] === "text") {
            const piece = String(part["text"] ?? "");
            text = text.length === 0 ? piece : `${text}\n${piece}`;
          }
        }
      }
      this.collectToolNames(last, seenToolNames);
      const tokens = info["tokens"] as Record<string, unknown> | undefined;
      const outcomeKind: WorkerOutcomeKind =
        info["error"] !== undefined
          ? "SERVER_ERROR"
          : classified.kind ?? (text.length > 0 ? "FINAL_TEXT" : "EMPTY_FINAL");
      return {
        session_id,
        message_id: info["id"] !== undefined ? String(info["id"]) : null,
        text: text.length > 0 ? text : null,
        usage: {
          input_tokens: tokens && typeof tokens === "object" && tokens["input"] !== undefined ? Number(tokens["input"]) : null,
          output_tokens: tokens && typeof tokens === "object" && tokens["output"] !== undefined ? Number(tokens["output"]) : null,
        },
        aborted: false,
        finish: finishValue,
        outcome_kind: outcomeKind,
        elapsed_ms: Date.now() - started,
        timed_out: false,
        tool_names: [...seenToolNames],
      };
    }
    // W01/N11: gercek zaman dolmasi haric TIMEOUT olamaz; elapsed ile kayitli
    return {
      session_id,
      message_id: null,
      text: null,
      usage: { input_tokens: null, output_tokens: null },
      aborted: false,
      finish: null,
      outcome_kind: "REQUEST_TIMEOUT",
      elapsed_ms: Date.now() - started,
      timed_out: true,
      tool_names: [...seenToolNames],
    };
  }

  /** W01/N10: mesaj parcalarindan tool adlarini biriktirir (duplicate yoksayar) */
  private collectToolNames(message: Record<string, unknown>, into: string[]): void {
    const parts = message["parts"];
    if (!Array.isArray(parts)) {
      return;
    }
    for (const part of parts) {
      if (part && typeof part === "object" && (part["type"] === "tool" || (part["tool"] !== undefined && part["type"] !== "text"))) {
        const name = String(part["tool"] ?? part["name"] ?? "unknown");
        if (!into.includes(name)) {
          into.push(name);
        }
      }
    }
  }
}

export interface PromptForJsonResult {
  value: unknown;
  result: WorkerPromptResult;
}

export async function promptForJsonResult(client: OpenCodeWorkerClient, options: {
  session_id: string;
  prompt: string;
  model?: { providerID: string; modelID: string };
  tools?: Record<string, boolean>;
  timeout_ms: number;
}): Promise<PromptForJsonResult> {
  const started = Date.now();
  const accepted = await client.promptAsync({
    session_id: options.session_id,
    parts: [{ type: "text", text: options.prompt }],
    ...(options.model ? { model: options.model } : {}),
    ...(options.tools ? { tools: options.tools } : {}),
    timeout_ms: options.timeout_ms,
  });
  const remainingTimeout = Math.max(1, options.timeout_ms - (Date.now() - started));
  const result = await client.waitForCompletion(options.session_id, { timeout_ms: remainingTimeout, request_message_id: accepted.message_id });
  // W01/F01: tip sonuc; EMPTY_FINAL/OUTPUT_TRUNCATED/TIMEOUT ayrismasi korunur
  if (result.aborted || result.outcome_kind === "REQUEST_TIMEOUT" || result.outcome_kind === "CANCELLED") {
    throw new WorkerRequestFailure(result.outcome_kind === "REQUEST_TIMEOUT" ? "REQUEST_TIMEOUT" : "CANCELLED", `worker sonuc beklenmedi: ${result.outcome_kind}`, result);
  }
  if (result.text === null || result.text.trim().length === 0) {
    throw new WorkerRequestFailure("EMPTY_FINAL", "worker bos final dondurdur (finish=stop, text yok)", result);
  }
  if (result.outcome_kind === "OUTPUT_TRUNCATED") {
    throw new WorkerRequestFailure("OUTPUT_TRUNCATED", "worker ciktisi kesildi (finish=length)", result);
  }
  try {
    const jsonCandidate = extractJsonCandidate(result.text);
    return { value: JSON.parse(jsonCandidate) as unknown, result };
  } catch (error) {
    throw new WorkerRequestFailure("INVALID_JSON", String(error), result);
  }
}

export async function promptForJson(client: OpenCodeWorkerClient, options: {
  session_id: string;
  prompt: string;
  model?: { providerID: string; modelID: string };
  tools?: Record<string, boolean>;
  timeout_ms: number;
}): Promise<unknown> {
  const response = await promptForJsonResult(client, options);
  return response.value;
}

export { defaultWorkerConfig, workerToolFlags, type WorkerConfig };
