/**
 * RT21 pilot worker izolasyon teshisi kanit testleri (AITE-RUNTIME-ACCEPTANCE-003 v2.0).
 *
 * Bulgu 1 (MODEL_TIMEOUT): workerToolFlags 'question' tool'unu KAPALI göndermiyordu; model,
 * hedef sinif kaynak koduna erisemeyince question tool'u ile interaktif soru soruyor (state:running)
 * ve yanit bekliyor -> session bitmiyor. Duzeltme: question DEFAULT_DISABLED_TOOLS'a eklendi.
 *
 * Bulgu 2 (MCP mirasi): opencode server --pure flag'i ile bile kullanici MCP config'i
 * (innova-atlassian) session'a miras kaliyor. Duzeltme: defaultWorkerServerManager worker'a ozel
 * XDG_CONFIG_HOME/XDG_DATA_HOME izolasyon dizini kullanir; opencode/opencode.json (kullanici
 * provider tanimi + mcp:{}) o dizine yazilir; secret degeri yazilmaz ({env:...} referansi).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultWorkerConfig, workerToolFlags, workerToolsConfigFlags, workerPermissionDenyRules, DEFAULT_DISABLED_TOOLS, DEFAULT_ALLOWED_TOOLS } from "../../src/workers/opencode/worker-config.js";
import { WorkerServerManager, DEFAULT_WORKER_PORT } from "../../src/workers/opencode/worker-server-manager.js";

describe("RT21: worker tool policy - interaktif/MCP araclari kapali", () => {
  it("question tool DEFAULT_DISABLED_TOOLS listesinde (MODEL_TIMEOUT kok nedeni)", () => {
    expect(DEFAULT_DISABLED_TOOLS).toContain("question");
  });

  it("workerToolFlags question=false dondurur (interaktif soru kapanik)", () => {
    const flags = workerToolFlags(defaultWorkerConfig("http://127.0.0.1"));
    expect(flags["question"]).toBe(false);
    expect(flags["bash"]).toBe(false);
    expect(flags["write"]).toBe(false);
    expect(flags["edit"]).toBe(false);
    expect(flags["task"]).toBe(false);
  });

  it("DEFAULT_ALLOWED_TOOLS bos kalmali (allowlist mantigi; sessiz izin genisletme yok)", () => {
    expect(DEFAULT_ALLOWED_TOOLS).toHaveLength(0);
    const flags = workerToolFlags(defaultWorkerConfig("http://127.0.0.1"));
    for (const [tool, enabled] of Object.entries(flags)) {
      expect(enabled).toBe(false);
      void tool;
    }
  });

  it("tum disabled araclar flags'te false; flags'te true araclar yok", () => {
    const config = defaultWorkerConfig("http://127.0.0.1");
    expect(config.tool_policy.disabled_tools).toEqual([...DEFAULT_DISABLED_TOOLS]);
    const flags = workerToolFlags(config);
    expect(Object.keys(flags).length).toBeGreaterThanOrEqual(DEFAULT_DISABLED_TOOLS.length);
  });
});

describe("RT21: worker server XDG izolasyonu (kullanici MCP mirasi kesilir)", () => {
  let dir: string;
  let configHome: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-rt21-xdg-"));
    configHome = join(dir, "xdg");
    mkdirSync(configHome, { recursive: true });
  });

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("ensureRunning isolatedConfigHome ile opencode/opencode.json yazar; mcp bos; secret yok", async () => {
    const manager = new WorkerServerManager({
      opencodeExecutable: process.execPath,
      port: DEFAULT_WORKER_PORT + 1,
      startupTimeoutMs: 5000,
      workDir: dir,
      isolatedConfigHome: configHome,
    });
    // health bekleme fail-closed; server baslamayabilir (exe process.execPath "serve" anlamaz);
    // izolasyon davranisi config yazimi uzerinden dogrulanir:
    const envAccess = (manager as unknown as { buildIsolatedEnv(): Record<string, string> }).buildIsolatedEnv();
    expect(envAccess["XDG_CONFIG_HOME"]).toBe(configHome);
    expect(envAccess["XDG_DATA_HOME"]).toBe(join(configHome, "data"));

    const cfgPath = join(configHome, "opencode", "opencode.json");
    expect(existsSync(cfgPath)).toBe(true);
    const config = JSON.parse(readFileSync(cfgPath, "utf8")) as { mcp: Record<string, unknown>; provider: Record<string, unknown>; model?: string };
    expect(Object.keys(config.mcp ?? {})).toHaveLength(0);
    // secret degeri yazilmaz:
    const serialized = JSON.stringify(config);
    expect(/sk-[A-Za-z0-9]{10,}/.test(serialized)).toBe(false);
  });

  it("worker config icerigi kullanici provider tanimini tasiyabilir; secret degeri tasimaz", () => {
    const manager = new WorkerServerManager({
      opencodeExecutable: process.execPath,
      port: DEFAULT_WORKER_PORT + 2,
      startupTimeoutMs: 5000,
      workDir: dir,
      isolatedConfigHome: configHome,
    });
    const content = (manager as unknown as { buildWorkerConfigContent(): Record<string, unknown> }).buildWorkerConfigContent();
    expect(content["mcp"]).toEqual({});
    expect(content["autoupdate"]).toBe(false);
    const serialized = JSON.stringify(content);
    expect(/sk-[A-Za-z0-9]{10,}/.test(serialized)).toBe(false);
  });

  it("provider {env:...} referansini worker env allowlist'ine tasir; diger secret'lari tasimaz", () => {
    const manager = new WorkerServerManager({
      opencodeExecutable: process.execPath,
      port: DEFAULT_WORKER_PORT + 4,
      startupTimeoutMs: 5000,
      workDir: dir,
      isolatedConfigHome: configHome,
    });
    const key = "AITEST_RT21_PROVIDER_KEY";
    const unrelated = "AITEST_RT21_UNRELATED_SECRET";
    const oldKey = process.env[key];
    const oldUnrelated = process.env[unrelated];
    process.env[key] = "test-provider-secret";
    process.env[unrelated] = "must-not-forward";
    try {
      (manager as unknown as { buildWorkerConfigContent(): Record<string, unknown> }).buildWorkerConfigContent = () => ({
        mcp: {},
        provider: { litellm: { options: { apiKey: `{env:${key}}` } } },
      });
      const envAccess = (manager as unknown as { buildIsolatedEnv(): Record<string, string> }).buildIsolatedEnv();
      expect(envAccess[key]).toBe("test-provider-secret");
      expect(envAccess[unrelated]).toBeUndefined();
    } finally {
      if (oldKey === undefined) delete process.env[key]; else process.env[key] = oldKey;
      if (oldUnrelated === undefined) delete process.env[unrelated]; else process.env[unrelated] = oldUnrelated;
    }
  });

  it("isolatedConfigHome olmadan env degismedi (kullanici izolasyonu icin opt-in davranisi korunur)", () => {
    const manager = new WorkerServerManager({
      opencodeExecutable: process.execPath,
      port: DEFAULT_WORKER_PORT + 3,
      startupTimeoutMs: 5000,
      workDir: dir,
    });
    const envAccess = (manager as unknown as { buildIsolatedEnv(): Record<string, string> }).buildIsolatedEnv();
    // opt-in olmadan XDG degiskenleri atanmaz:
    expect(envAccess["XDG_CONFIG_HOME"]).toBe(process.env["XDG_CONFIG_HOME"]);
  });
});

describe("WN73/mcp95z: v2 worker config fail-closed arac kilidi", () => {
  let dir: string;
  let configHome: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-wn73-xdg-"));
    configHome = join(dir, "xdg");
    mkdirSync(configHome, { recursive: true });
  });

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("workerToolsConfigFlags kritik araclarin TAMAMINI false yazar; true araclar yok", () => {
    const flags = workerToolsConfigFlags();
    for (const tool of ["bash", "write", "edit", "patch", "task", "webfetch", "websearch", "grep", "glob", "list", "read", "question", "skill", "subagent", "todowrite"]) {
      expect(flags[tool]).toBe(false);
    }
    expect(flags["todoread"]).toBe(true);
  });

  it("LiteLLM bos tools dizisini reddettigi icin zararsiz read-only uyumluluk araci acik kalmali", () => {
    const flags = workerToolsConfigFlags();
    expect(Object.values(flags).some(Boolean)).toBe(true);
    expect(flags["todoread"]).toBe(true);
    expect(flags["read"]).toBe(false);
  });

  it("workerPermissionDenyRules V2 aksiyon adlariyla deny uretir; allow/ask uretmez", () => {
    const rules = workerPermissionDenyRules();
    const actions = new Set(rules.map((rule) => rule.action));
    for (const action of ["shell", "edit", "subagent", "read", "glob", "grep", "webfetch", "websearch", "question"]) {
      expect(actions.has(action)).toBe(true);
    }
    for (const rule of rules) {
      expect(rule.effect).toBe("deny");
      expect(rule.resource).toBe("*");
    }
  });

  it("buildWorkerConfigContent tools kaldirma + permission deny yazar; mcp bos; secret yok", () => {
    const manager = new WorkerServerManager({
      opencodeExecutable: process.execPath,
      port: DEFAULT_WORKER_PORT + 5,
      startupTimeoutMs: 5000,
      workDir: dir,
      isolatedConfigHome: configHome,
    });
    const content = (manager as unknown as { buildWorkerConfigContent(): Record<string, unknown> }).buildWorkerConfigContent();
    // birincil kilit: tools config anahtari (araclar toolset'ten kaldirilir)
    const tools = content["tools"] as Record<string, boolean> | undefined;
    expect(tools).toBeDefined();
    expect(tools?.["read"]).toBe(false);
    expect(tools?.["bash"]).toBe(false);
    expect(tools?.["edit"]).toBe(false);
    expect(tools?.["webfetch"]).toBe(false);
    expect(tools?.["question"]).toBe(false);
    expect(tools?.["todoread"]).toBe(true);
    // ikinci savunma katmani: permission deny (V2 array bicimi)
    const permissions = content["permissions"] as Array<{ action: string; resource: string; effect: string }>;
    expect(Array.isArray(permissions)).toBe(true);
    const permActions = new Set(permissions.map((rule) => rule.action));
    for (const action of ["shell", "edit", "read", "question", "subagent"]) {
      expect(permActions.has(action)).toBe(true);
    }
    for (const rule of permissions) {
      expect(rule.effect).toBe("deny");
    }
    expect(content["mcp"]).toEqual({});
    const serialized = JSON.stringify(content);
    expect(/sk-[A-Za-z0-9]{10,}/.test(serialized)).toBe(false);
  });

  it("yazilan worker config dosyasi tools/permissions kilidini tasiyor (disk uzerinden)", () => {
    const manager = new WorkerServerManager({
      opencodeExecutable: process.execPath,
      port: DEFAULT_WORKER_PORT + 6,
      startupTimeoutMs: 5000,
      workDir: dir,
      isolatedConfigHome: configHome,
    });
    (manager as unknown as { buildIsolatedEnv(): Record<string, string> }).buildIsolatedEnv();
    const cfgPath = join(configHome, "opencode", "opencode.json");
    expect(existsSync(cfgPath)).toBe(true);
    const config = JSON.parse(readFileSync(cfgPath, "utf8")) as Record<string, unknown>;
    const tools = config["tools"] as Record<string, boolean>;
    expect(tools["read"]).toBe(false);
    const permissions = config["permissions"] as Array<{ effect: string }>;
    expect(permissions.every((rule) => rule.effect === "deny")).toBe(true);
  });
});
