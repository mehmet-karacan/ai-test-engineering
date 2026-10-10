/**
 * Guvenli worker config: OpenCode worker oturumu icin kontrollu ayar.
 * bash, genel edit/write/patch, task, web ve diger MCP araclari kapali;
 * gerekli salt-okunur araclari allowlist ile acik.
 * Host kullanici konfigurasyonu tum olarak miras alinmaz.
 */
export interface WorkerToolPolicy {
  disabled_tools: string[];
  allowed_tools: string[];
}

export interface WorkerConfig {
  readonly base_url: string;
  readonly username: string;
  readonly password_source: "env:OPENCODE_SERVER_PASSWORD";
  readonly tool_policy: WorkerToolPolicy;
  readonly request_timeout_ms: number;
  readonly startup_timeout_ms: number;
}

export const DEFAULT_DISABLED_TOOLS: readonly string[] = [
  "bash",
  "write",
  "edit",
  "patch",
  "task",
  "webfetch",
  "grep",
  "glob",
  "list",
  "read",
  // RT21 pilot bulgusu: model, hedef sinif kaynak koduna erisemeyince 'question' tool'u ile
  // interaktif soru soruyor (state:running) ve yanit bekliyor -> session bitmiyor (MODEL_TIMEOUT).
  // Pilot akisi interaktif degil; interaktif ve yan MCP araclari kapali kalmali.
  "question",
] as const;

export const DEFAULT_ALLOWED_TOOLS: readonly string[] = [] as const;

export function defaultWorkerConfig(base_url: string): WorkerConfig {
  return {
    base_url,
    username: "opencode",
    password_source: "env:OPENCODE_SERVER_PASSWORD",
    tool_policy: {
      disabled_tools: [...DEFAULT_DISABLED_TOOLS],
      allowed_tools: [...DEFAULT_ALLOWED_TOOLS],
    },
    request_timeout_ms: 300000,
    startup_timeout_ms: 30000,
  };
}

export function workerToolFlags(config: WorkerConfig): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const tool of config.tool_policy.disabled_tools) {
    flags[tool] = false;
  }
  for (const tool of config.tool_policy.allowed_tools) {
    if (!(tool in flags)) {
      flags[tool] = true;
    }
  }
  return flags;
}
