/**
 * Worker server manager: urune ait kontrollu worker endpoint'i (K03/B02).
 * Sabit porta sessiz baglanmak yerine urune ait port/retry; sahipligi bilinmeyen process'i kapatmaz.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { AppError } from "../../domain/errors.js";
import { OpenCodeWorkerClient } from "./worker-client.js";

export interface WorkerServerOptions {
  opencodeExecutable: string;
  port: number;
  startupTimeoutMs: number;
  workDir: string;
}

export const DEFAULT_WORKER_PORT = 14096;

export class WorkerServerManager {
  private server: ChildProcess | null = null;
  private client: OpenCodeWorkerClient | null = null;

  constructor(private readonly options: WorkerServerOptions) {}

  /**
   * Worker server'i kontrollu baslatir (sahipligi bilinen process); zaten calisan TUI/server'i kapatmaz.
   */
  async ensureRunning(): Promise<OpenCodeWorkerClient> {
    if (this.client && (await this.client.health(3000))) {
      return this.client;
    }
    const exe = resolve(this.options.opencodeExecutable);
    const child = spawn(exe, ["serve", "--port", String(this.options.port), "--hostname", "127.0.0.1", "--pure"], {
      stdio: "ignore",
      shell: false,
      windowsHide: true,
      cwd: resolve(this.options.workDir),
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
  const exe = process.platform === "win32"
    ? join(process.env["APPDATA"] ?? "", "npm", "opencode.cmd")
    : "opencode";
  return new WorkerServerManager({
    opencodeExecutable: exe,
    port: DEFAULT_WORKER_PORT,
    startupTimeoutMs: 30000,
    workDir,
  });
}
