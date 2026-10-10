/**
 * Worker server manager: urune ait kontrollu worker endpoint'i (K03/B02).
 * Sabit porta sessiz baglanmak yerine urune ait port/retry; sahipligi bilinmeyen process'i kapatmaz.
 * RT21 pilot bulgusu: --pure flag'i kullanici MCP config'i mirasini SILMIYOR; opencode server'a
 * kullanici Confluence/Jira MCP araclari aktif kaliyor. Worker, XDG_CONFIG_HOME/XDG_DATA_HOME
 * worker'a ozel izole dizinlerle baslatilir; kullanici MCP config'i miras KALMAZ.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { AppError } from "../../domain/errors.js";
import { OpenCodeWorkerClient } from "./worker-client.js";

export interface WorkerServerOptions {
  opencodeExecutable: string;
  port: number;
  startupTimeoutMs: number;
  workDir: string;
  /** Windows cmd /c shim yolu icin ek on-argumanlar (orn. ["/c", "opencode.cmd"]) */
  extraArgs?: string[];
  /** XDG_CONFIG_HOME worker izolasyonu icin; verilirse kullanici config mirasi kesilir */
  isolatedConfigHome?: string | null;
}

export const DEFAULT_WORKER_PORT = 14096;

export class WorkerServerManager {
  private server: ChildProcess | null = null;
  private client: OpenCodeWorkerClient | null = null;

  constructor(private readonly options: WorkerServerOptions) {}

  /**
   * Worker server'i kontrollu baslatir (sahipligi bilinen process); zaten calisan TUI/server'i kapatmaz.
   * isolatedConfigHome verilirse: opencode/opencode.json o dizine yazilir (kullanici config'inden
   * provider tanimi + mcp:{}; secret degeri yazilmaz, {env:...} referansi korunur) ve env ile verilir.
   */
  async ensureRunning(): Promise<OpenCodeWorkerClient> {
    if (this.client && (await this.client.health(3000))) {
      return this.client;
    }
    const exe = resolve(this.options.opencodeExecutable);
    const env = this.buildIsolatedEnv();
    const child = spawn(exe, [...(this.options.extraArgs ?? []), "serve", "--port", String(this.options.port), "--hostname", "127.0.0.1", "--pure"], {
      stdio: "ignore",
      shell: false,
      windowsHide: true,
      cwd: resolve(this.options.workDir),
      env,
    });
    this.server = child;
    const client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${this.options.port}` });
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await client.health(3000)) {
        this.client = client;
        return client;
      }
    }
    throw new AppError("BLOCKED_ISOLATION", `Worker server ${this.options.startupTimeoutMs} ms icinde hazir olmadi (port ${this.options.port})`, {
      reason_code: "WORKER_SERVER_UNAVAILABLE",
    });
  }

  /**
   * RT21 pilot: kullanici MCP config'i worker session'ina miras kalmaz. isolatedConfigHome
   * verildiyse XDG_CONFIG_HOME/XDG_DATA_HOME/XDG_CACHE_HOME/XDG_STATE_HOME o dizinlere cekilir ve
   * opencode/opencode.json (kullanici provider tanimi + mcp:{}) o dizine yazilir.
   * Secret degeri okunmaz/yazilmaz; {env:...} referansi korunur.
   */
  private buildIsolatedEnv(): Record<string, string> {
    const base: Record<string, string> = { ...process.env } as Record<string, string>;
    const configHome = this.options.isolatedConfigHome;
    if (!configHome) {
      return base;
    }
    const configDir = join(configHome, "opencode");
    mkdirSync(configDir, { recursive: true });
    mkdirSync(join(configHome, "data"), { recursive: true });
    const workerConfigPath = join(configDir, "opencode.json");
    if (!existsSync(workerConfigPath)) {
      writeFileSync(workerConfigPath, JSON.stringify(this.buildWorkerConfigContent(), null, 2), "utf8");
    }
    base["XDG_CONFIG_HOME"] = configHome;
    base["XDG_DATA_HOME"] = join(configHome, "data");
    base["XDG_CACHE_HOME"] = join(configHome, "data", "cache");
    base["XDG_STATE_HOME"] = join(configHome, "data", "state");
    return base;
  }

  /**
   * Worker config icerigi: kullanici OpenCode config'inden provider tanimi (npm + models + options)
   * birebir tasinir; mcp bos kalir (kullanici MCP mirasi kesilir). model/small_model kullanici seciminden.
   */
  private buildWorkerConfigContent(): Record<string, unknown> {
    const userConfigPath = resolve(join(process.env["USERPROFILE"] ?? "", ".config", "opencode", "opencode.json"));
    let provider: Record<string, unknown> = {};
    let model: string | null = null;
    let smallModel: string | null = null;
    try {
      const raw = JSON.parse(readFileSync(userConfigPath, "utf8").replace(/^\uFEFF/, "")) as Record<string, unknown>;
      provider = (raw["provider"] as Record<string, unknown> | undefined) ?? {};
      model = (raw["model"] as string | undefined) ?? null;
      smallModel = (raw["small_model"] as string | undefined) ?? null;
    } catch {
      // kullanici config yoksa provider tanimsiz kalir; ensureRunning health'te kalir (fail-closed)
    }
    const content: Record<string, unknown> = {
      $schema: "https://opencode.ai/config.json",
      mcp: {},
      autoupdate: false,
      provider,
    };
    if (model) {
      content["model"] = model;
    }
    if (smallModel) {
      content["small_model"] = smallModel;
    }
    return content;
  }

  /**
   * Yalniz urun tarafindan baslatilan server'i durdurur; kullanici TUI'sine dokunmaz.
   */
  stopOwnedServer(): void {
    if (this.server && this.server.pid) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(this.server.pid), "/T", "/F"], { stdio: "ignore", shell: false, windowsHide: true });
        } else {
          this.server.kill("SIGTERM");
        }
      } catch {
        // zaten sonlanmis olabilir
      }
      this.server = null;
      this.client = null;
    }
  }

  get currentClient(): OpenCodeWorkerClient | null {
    return this.client;
  }
}

export function defaultWorkerServerManager(workDir: string): WorkerServerManager {
  // Windows'ta .cmd dosyalari shell:false ile spawn EDILEMEZ (Node v24 CVE-2024-27980 duzeltmesi; EINVAL).
  // NPM shim yerine gercek opencode.exe kullanilir; shim bulunamazsa cmd /c ile cmd shim calistirilir.
  let exe = "opencode";
  let args: string[] = [];
  if (process.platform === "win32") {
    const appData = process.env["APPDATA"] ?? "";
    const realExe = join(appData, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe");
    if (appData.length > 0 && existsSync(realExe)) {
      exe = realExe;
    } else {
      exe = join(process.env["ComSpec"] ?? "cmd.exe");
      args = ["/c", "opencode.cmd"];
    }
  }
  // RT21 pilot: kullanici MCP config'i worker'a miras kalmaz; worker'a ozel XDG izolasyon dizini.
  const isolatedConfigHome = join(tmpdir(), "aitest-worker-xdg");
  return new WorkerServerManager({
    opencodeExecutable: exe,
    port: DEFAULT_WORKER_PORT,
    startupTimeoutMs: 30000,
    workDir,
    extraArgs: args,
    isolatedConfigHome,
  });
}
