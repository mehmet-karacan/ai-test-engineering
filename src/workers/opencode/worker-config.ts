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

/**
 * Model oturumlari arac kullanan adaylarda bes dakikayi asabilir. Bu ust sinir
 * kontrat butcesiyle birlikte uygulanir; dispatcher ve adapter ayni degeri
 * kullanarak timeout ile lease arasinda sessiz bir ayrisma olusturmaz.
 */
export const MAX_WORKER_REQUEST_TIMEOUT_MS = 900_000;

/**
 * Worker timeout sonucu, durable AgentTask'a INTERRUPTED/FAILED olarak
 * yazilabilsin diye job deadline'dan ayrilan minimum tamamlanma payi.
 * Istek ile task lease ayni anda bitmemeli; aksi halde timeout kaniti stale
 * lease nedeniyle kaybolur.
 */
export const WORKER_COMPLETION_GRACE_MS = 60_000;

export interface WorkerRequestBudget {
  request_timeout_ms: number;
  task_lease_ttl_ms: number;
  remaining_minutes: number;
}

export function workerRequestBudget(remainingJobMs: number): WorkerRequestBudget {
  if (!Number.isFinite(remainingJobMs) || remainingJobMs < 0) {
    throw new Error("Worker kalan job suresi gecersiz");
  }
  const safeRemainingMs = Math.floor(remainingJobMs);
  const requestTimeoutMs = Math.max(
    1000,
    Math.min(MAX_WORKER_REQUEST_TIMEOUT_MS, Math.max(1000, safeRemainingMs - WORKER_COMPLETION_GRACE_MS)),
  );
  const taskLeaseTtlMs = Math.max(
    1000,
    Math.min(MAX_WORKER_REQUEST_TIMEOUT_MS + WORKER_COMPLETION_GRACE_MS, Math.max(1000, safeRemainingMs)),
  );
  return {
    request_timeout_ms: requestTimeoutMs,
    task_lease_ttl_ms: taskLeaseTtlMs,
    remaining_minutes: requestTimeoutMs / 60_000,
  };
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
    request_timeout_ms: MAX_WORKER_REQUEST_TIMEOUT_MS,
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

/**
 * WN73/mcp95z kok nedeni: OpenCode 2.x v2 prompt body'si tools/system tasimaz
 * (schema additionalProperties:false); request seviyesinde arac kisiti YOKTUR
 * ve workerToolFlags ciktisi v2 yolunda sessizce duser. Arac kisiti worker
 * config'in `tools` anahtari uzerinden uygulanir: `tools:{...false}` araclarin
 * model toolset'inden TAMAMEN kaldirilmasini saglar (canli dogrulama: read
 * kaldirilinca model tool part uretmeden terminal stop; 20.6 sn).
 * permission deny yalniz cagriyi engeller, araci modele sunmaya devam eder
 * (denied tool dongusu); bu yuzden birincil kilit `tools` kaldirma, `permissions`
 * deny ikinci savunma katmanidir. `tools` anahtari config semasinda deprecated
 * isaretli; kaldirilirsa deny katmani kilidi korur.
 * Liste DEFAULT_DISABLED_TOOLS'un V2 superset'idir.
 */
export const WORKER_DISABLED_TOOLS_CONFIG: readonly string[] = [
  ...DEFAULT_DISABLED_TOOLS,
  "websearch",
  "skill",
  "subagent",
  "todowrite",
  "todoread",
] as const;

/** LiteLLM bos tools dizisini reddediyor; bu zararsiz arac provider uyumlulugu icin acik kalir. */
export const WORKER_PROVIDER_COMPATIBILITY_TOOL = "todoread" as const;

export function workerToolsConfigFlags(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const tool of WORKER_DISABLED_TOOLS_CONFIG) {
    if (tool !== WORKER_PROVIDER_COMPATIBILITY_TOOL) {
      flags[tool] = false;
    }
  }
  flags[WORKER_PROVIDER_COMPATIBILITY_TOOL] = true;
  return flags;
}

/**
 * V2 permission deny kurallari (ikinci savunma katmani): `tools` kaldirma
 * kilidini yedekler. V2 aksiyon eslemesi: bash->shell, write/edit/patch->edit,
 * task->subagent. Etkilesimsiz worker oturumunda 'ask' beklemeyi bloklardigi
 * icin yalniz 'deny' effect kullanilir.
 */
export const WORKER_PERMISSION_DENY_ACTIONS: readonly string[] = [
  "shell",
  "edit",
  "subagent",
  "read",
  "glob",
  "grep",
  "webfetch",
  "websearch",
  "question",
  "skill",
  "execute",
  "external_directory",
] as const;

export interface WorkerPermissionRule {
  action: string;
  resource: string;
  effect: "deny";
}

export function workerPermissionDenyRules(): WorkerPermissionRule[] {
  return WORKER_PERMISSION_DENY_ACTIONS.map((action) => ({ action, resource: "*", effect: "deny" as const }));
}
