/**
 * OpenCode worker adapter: yonetilen worker server'a baglanir; prompt_async ile rol bazli gorev yollar.
 * Server crash olursa ayni job'da yeni session olusturulur; sonlanma/cancellation kayitli olur.
 * Gercek OpenCode HTTP API'si (dogrulandi): POST /session, POST /session/{id}/prompt_async, POST /session/{id}/abort.
 */
import { defaultWorkerConfig, workerToolFlags, type WorkerConfig } from "./worker-config.js";
import { extractJsonCandidate } from "./model-schemas.js";

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
}

export interface OpenCodeServerOptions {
  base_url: string;
  username?: string;
  password?: string;
  startup_timeout_ms?: number;
}

export class OpenCodeWorkerClient {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string | undefined;

  constructor(options: OpenCodeServerOptions) {
    this.baseUrl = options.base_url.replace(/\/$/, "");
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

  async health(timeoutMs: number): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/global/health`, { signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async createSession(directory?: string): Promise<SessionInfo> {
    const response = await fetch(`${this.baseUrl}/session`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(directory ? { directory } : {}),
    });
    if (!response.ok) {
      throw new Error(`Session olusturma basarisiz: HTTP ${response.status}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    return {
      session_id: String(data["id"] ?? ""),
      project_id: data["projectID"] !== undefined ? String(data["projectID"]) : undefined,
      directory: data["directory"] !== undefined ? String(data["directory"]) : undefined,
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
  }): Promise<{ message_id: string | null }> {
    const response = await fetch(`${this.baseUrl}/session/${options.session_id}/prompt_async`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        parts: options.parts,
        ...(options.model ? { model: options.model } : {}),
        ...(options.agent ? { agent: options.agent } : {}),
        ...(options.tools ? { tools: options.tools } : {}),
        ...(options.system ? { system: options.system } : {}),
        ...(options.no_reply !== undefined ? { noReply: options.no_reply } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`prompt_async basarisiz: HTTP ${response.status}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    return { message_id: data["id"] !== undefined ? String(data["id"]) : null };
  }

  async listMessages(session_id: string): Promise<Array<Record<string, unknown>>> {
    const response = await fetch(`${this.baseUrl}/session/${session_id}/message`, {
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`Mesaj listeleme basarisiz: HTTP ${response.status}`);
    }
    return (await response.json()) as Array<Record<string, unknown>>;
  }

  async abortSession(session_id: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/session/${session_id}/abort`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({}),
    });
    return response.ok;
  }

  async waitForCompletion(session_id: string, options: { timeout_ms: number; poll_interval_ms?: number }): Promise<WorkerPromptResult> {
    const pollInterval = options.poll_interval_ms ?? 1000;
    const started = Date.now();
    while (Date.now() - started < options.timeout_ms) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      const messages = await this.listMessages(session_id);
      const last = messages.length > 0 ? messages[messages.length - 1]! : undefined;
      if (!last) {
        continue;
      }
      const role = String(last["role"] ?? "");
      if (role !== "assistant") {
        continue;
      }
      const completed = last["completed"] === true || last["error"] !== undefined;
      if (!completed) {
        continue;
      }
      const parts = last["parts"];
      let text: string | null = null;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (part && typeof part === "object" && part["type"] === "text") {
            text = String(part["text"] ?? "");
          }
        }
      }
      const tokens = last["tokens"] as Record<string, unknown> | undefined;
      return {
        session_id,
        message_id: last["id"] !== undefined ? String(last["id"]) : null,
        text,
        usage: {
          input_tokens: tokens && typeof tokens === "object" && tokens["input"] !== undefined ? Number(tokens["input"]) : null,
          output_tokens: tokens && typeof tokens === "object" && tokens["output"] !== undefined ? Number(tokens["output"]) : null,
        },
        aborted: false,
      };
    }
    return { session_id, message_id: null, text: null, usage: { input_tokens: null, output_tokens: null }, aborted: true };
  }
}

export async function promptForJson(client: OpenCodeWorkerClient, options: {
  session_id: string;
  prompt: string;
  model?: { providerID: string; modelID: string };
  tools?: Record<string, boolean>;
  timeout_ms: number;
}): Promise<unknown> {
  await client.promptAsync({
    session_id: options.session_id,
    parts: [{ type: "text", text: options.prompt }],
    ...(options.model ? { model: options.model } : {}),
    ...(options.tools ? { tools: options.tools } : {}),
  });
  const result = await client.waitForCompletion(options.session_id, { timeout_ms: options.timeout_ms });
  if (result.aborted || result.text === null) {
    throw new Error("MODEL_TIMEOUT: worker cevabi zamaninda gelmedi");
  }
  const jsonCandidate = extractJsonCandidate(result.text);
  return JSON.parse(jsonCandidate) as unknown;
}

export { defaultWorkerConfig, workerToolFlags, type WorkerConfig };
