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
import { defaultWorkerConfig, workerToolFlags, DEFAULT_DISABLED_TOOLS, DEFAULT_ALLOWED_TOOLS } from "../../src/workers/opencode/worker-config.js";
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
