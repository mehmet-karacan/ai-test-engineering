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
import { createHash, randomBytes } from "node:crypto";
import { AppError } from "../../domain/errors.js";
import { OpenCodeWorkerClient } from "./worker-client.js";
import { workerToolsConfigFlags, workerPermissionDenyRules } from "./worker-config.js";

export interface WorkerServerOptions {
  opencodeExecutable: string;
  port: number;
  startupTimeoutMs: number;
  workDir: string;
  /** Windows cmd /c shim yolu icin ek on-argumanlar (orn. ["/c", "opencode.cmd"]) */
  extraArgs?: string[];
  /** XDG_CONFIG_HOME worker izolasyonu icin; verilirse kullanici config mirasi kesilir */
  isolatedConfigHome?: string | null;
  /**
   * W01/F03: job/profil bazli izole config. Verilirse config dosyasi her kosuda
   * bu digeste gore yeniden yazilir (stale dosya reuse yok).
   */
  config_instance_key?: string | null;
}

export const DEFAULT_WORKER_PORT = 14096;

/**
 * W01/F03: worker config iceriginin deterministic digest'i.
 * Config degisince stale dosya reuse engellenir; ayni icerik reuse edilir.
 */
export function workerConfigDigest(content: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(content), "utf8").digest("hex");
}

/** W01/F03: worker env allowlist - tum process.env kopyalanmaz; yalniz bu on ekler + sentinel tasi */
function referencedProviderEnvNames(provider: unknown): string[] {
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) return [];
  const names = new Set<string>();
  for (const value of Object.values(provider as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const options = (value as Record<string, unknown>)["options"];
    if (!options || typeof options !== "object" || Array.isArray(options)) continue;
    const apiKey = (options as Record<string, unknown>)["apiKey"];
    const match = typeof apiKey === "string" ? /^\{env:([A-Za-z0-9_]+)\}$/u.exec(apiKey.trim()) : null;
    if (match) names.add(match[1]!);
  }
  return [...names];
}

function buildAllowedEnv(extraSecretNames: readonly string[] = []): Record<string, string> {
  const allowed: Record<string, string> = {};
  const allowPrefixes = ["PATH", "PATHEXT", "SYSTEMROOT", "COMSPEC", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "USERPROFILE", "HOME", "JAVA_HOME", "MAVEN_HOME", "NO_COLOR", "LANG", "TZ"];
  for (const key of allowPrefixes) {
    const value = process.env[key];
    if (value !== undefined) {
      allowed[key] = value;
    }
  }
  // OpenCode server auth sentinel'i (varsa) iletilir; diger secret'lar tasinmaz
  const password = process.env["OPENCODE_SERVER_PASSWORD"];
  if (password !== undefined) {
    allowed["OPENCODE_SERVER_PASSWORD"] = password;
  }
  const username = process.env["OPENCODE_SERVER_USERNAME"];
  if (username !== undefined) {
    allowed["OPENCODE_SERVER_USERNAME"] = username;
  }
  // Provider credentials are forwarded only when the worker config names an
  // explicit {env:NAME} reference.  Maven's separate environment allowlist
  // never includes these names.
  for (const name of extraSecretNames) {
    const entry = Object.entries(process.env).find(([key, value]) =>
      key.toUpperCase() === name.toUpperCase() && value !== undefined);
    if (entry) allowed[entry[0]] = entry[1]!;
  }
  return allowed;
}

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
    // OpenCode 2.x protects the /api surface with Basic Auth. Keep the
    // credential process-local; reuse an explicitly supplied sentinel, or
    // generate an unlogged per-worker secret when none was configured.
    const serverPassword = env["OPENCODE_SERVER_PASSWORD"] ?? randomBytes(32).toString("base64url");
    const serverUsername = env["OPENCODE_SERVER_USERNAME"] ?? "opencode";
    env["OPENCODE_SERVER_PASSWORD"] = serverPassword;
    env["OPENCODE_SERVER_USERNAME"] = serverUsername;
    // OpenCode 2.x no longer exposes the historical --pure serve flag. The
    // worker config is isolated through XDG_* roots above; passing --pure
    // makes current OpenCode exit before the HTTP endpoint is ready.
    const child = spawn(exe, [...(this.options.extraArgs ?? []), "serve", "--port", String(this.options.port), "--hostname", "127.0.0.1"], {
      stdio: "ignore",
      shell: false,
      windowsHide: true,
      cwd: resolve(this.options.workDir),
      env,
    });
    this.server = child;
    const client = new OpenCodeWorkerClient({
      base_url: `http://127.0.0.1:${this.options.port}`,
      api_prefix: "/api",
      username: serverUsername,
      password: serverPassword,
    });
    const attempts = Math.max(1, Math.ceil(this.options.startupTimeoutMs / 1000));
    for (let i = 0; i < attempts; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (child.exitCode !== null || child.killed) {
        await this.stopOwnedServer();
        throw new AppError("BLOCKED_ISOLATION", `Worker server baslatilamadi; process erken sonlandi (port ${this.options.port})`, {
          reason_code: "WORKER_SERVER_EXITED",
        });
      }
      if (await client.health(3000)) {
        this.client = client;
        return client;
      }
    }
    await this.stopOwnedServer();
    throw new AppError("BLOCKED_ISOLATION", `Worker server ${this.options.startupTimeoutMs} ms icinde hazir olmadi (port ${this.options.port})`, {
      reason_code: "WORKER_SERVER_UNAVAILABLE",
    });
  }

  /**
   * W01/F03: kullanici MCP config'i worker session'ina miras kalmaz. isolatedConfigHome
   * verildiyse XDG_CONFIG_HOME/XDG_DATA_HOME/XDG_CACHE_HOME/XDG_STATE_HOME o dizinlere cekilir ve
   * opencode/opencode.json (kullanici provider tanimi + mcp:{}) o dizine yazilir.
   * Secret degeri okunmaz/yazilmaz; {env:...} referansi korunur.
   * config_instance_key verildiyse config dosyasi instance bazli ayrilir; stale reuse yok.
   */
  private buildIsolatedEnv(): Record<string, string> {
    const configHome = this.options.isolatedConfigHome;
    // W01/F03: tum process.env kopyalanmaz; allowlist uygulanir.  Provider
    // secret references are the sole additional names admitted to the worker.
    const configContent = configHome ? this.buildWorkerConfigContent() : null;
    const base: Record<string, string> = buildAllowedEnv(
      configContent ? referencedProviderEnvNames(configContent["provider"]) : [],
    );
    if (!configHome) {
      return base;
    }
    const instanceKey = this.options.config_instance_key ?? null;
    const configDir = instanceKey
      ? join(configHome, "instances", instanceKey, "opencode")
      : join(configHome, "opencode");
    mkdirSync(configDir, { recursive: true });
    mkdirSync(join(configHome, "data"), { recursive: true });
    const workerConfigPath = join(configDir, "opencode.json");
    const content = configContent!;
    const digest = workerConfigDigest(content);
    // W01/F03: config digest dosyada degisince yeniden yazilir (stale reuse yok)
    let needsWrite = true;
    if (existsSync(workerConfigPath)) {
      const digestMarker = `${workerConfigPath}.digest`;
      if (existsSync(digestMarker) && readFileSync(digestMarker, "utf8").trim() === digest) {
        needsWrite = false;
      }
    }
    if (needsWrite) {
      writeFileSync(workerConfigPath, JSON.stringify(content, null, 2), "utf8");
      writeFileSync(`${workerConfigPath}.digest`, digest, "utf8");
    }
    base["XDG_CONFIG_HOME"] = instanceKey ? join(configHome, "instances", instanceKey) : configHome;
    base["XDG_DATA_HOME"] = join(configHome, "data");
    base["XDG_CACHE_HOME"] = join(configHome, "data", "cache");
    base["XDG_STATE_HOME"] = join(configHome, "data", "state");
    return base;
  }

  /**
   * Worker config icerigi: kullanici OpenCode config'inden provider tanimi (npm + models + options)
   * birebir tasinir; mcp bos kalir (kullanici MCP mirasi kesilir). model/small_model kullanici seciminden.
   * WN73/mcp95z: v2 prompt body'si tools tasimadigi icin arac kisiti config uzerinden
   * uygulanir: `tools:{...false}` araclarin toolset'ten kaldirilmasi (birincil kilit,
   * canli dogrulandi) + `permissions` deny (ikinci savunma katmani).
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
      // WN73/mcp95z fail-closed: worker modeli yalniz prompt'ta verilen bounded
      // context ile cevap verir; tum arac kullanimi kaldirilir (birincil kilit).
      tools: workerToolsConfigFlags(),
      // Ikinci savunma katmani: toolset'ten kacan bir arac (yeni surumde isim
      // degisimi vb.) permission deny ile cagri seviyesinde engellenir.
      // Etkilesimsiz worker'da 'ask' beklemeyi bloklardigi icin yalniz 'deny'.
      permissions: workerPermissionDenyRules(),
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
  async stopOwnedServer(): Promise<void> {
    if (this.server && this.server.pid) {
      try {
        if (process.platform === "win32") {
          const killer = spawn("taskkill", ["/pid", String(this.server.pid), "/T", "/F"], { stdio: "ignore", shell: false, windowsHide: true });
          await new Promise<void>((done) => {
            killer.once("close", () => done());
            killer.once("error", () => done());
          });
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

export function defaultWorkerServerManager(workDir: string, options?: { config_instance_key?: string; port?: number }): WorkerServerManager {
  // Windows'ta .cmd dosyalari shell:false ile spawn EDILEMEZ (Node v24 CVE-2024-27980 duzeltmesi; EINVAL).
  // NPM shim yerine gercek opencode.exe kullanilir; shim bulunamazsa cmd /c ile cmd shim calistirilir.
  let exe = "opencode";
  let args: string[] = [];
  if (process.platform === "win32") {
    const appData = process.env["APPDATA"] ?? "";
    const realExeCandidates = [
      join(appData, "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe"),
      join(appData, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe"),
    ];
    const realExe = realExeCandidates.find((candidate) => existsSync(candidate));
    if (realExe) {
      exe = realExe;
    } else {
      exe = join(process.env["ComSpec"] ?? "cmd.exe");
      args = ["/c", "opencode.cmd"];
    }
  }
  // RT21 pilot: kullanici MCP config'i worker'a miras kalmaz; worker'a ozel XDG izolasyon dizini.
  // W01/F03: config_instance_key verilirse instance bazli ayrilir.
  const isolatedConfigHome = join(tmpdir(), "aitest-worker-xdg");
  return new WorkerServerManager({
    opencodeExecutable: exe,
    port: options?.port ?? DEFAULT_WORKER_PORT,
    startupTimeoutMs: 30000,
    workDir,
    extraArgs: args,
    isolatedConfigHome,
    config_instance_key: options?.config_instance_key ?? null,
  });
}
