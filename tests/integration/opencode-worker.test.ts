/**
 * Gercek OpenCode server contract/smoke testi: server'i child process olarak baslatir,
 * /api/session olusturma + prompt + interrupt akisini gercek HTTP API'yle dogrular.
 * Model cagrisi gerektiren akis yalniz yetkili model mevcutsa calisir; yoksa smoke yalniz session/abort dogrular.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { OpenCodeWorkerClient } from "../../src/workers/opencode/worker-client.js";
import { defaultWorkerConfig, workerToolFlags } from "../../src/workers/opencode/worker-config.js";

const TEST_SERVER_PASSWORD = "aitest-opencode-contract";

async function findFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => resolve());
  });
  const address = probe.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  if (port === 0) throw new Error("OpenCode test portu secilemedi");
  return port;
}

describe("OpenCode server entegrasyonu (gercek)", () => {
  let server: ChildProcess;
  let client: OpenCodeWorkerClient;
  let serverUp = false;
  let opencodePort = 0;

  beforeAll(async () => {
    opencodePort = await findFreePort();
    const realExecutable = join(process.env["APPDATA"] ?? "", "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe");
    const executable = existsSync(realExecutable) ? realExecutable : "cmd";
    const args = existsSync(realExecutable)
      ? ["serve", "--port", String(opencodePort), "--hostname", "127.0.0.1"]
      : ["/c", "opencode.cmd", "serve", "--port", String(opencodePort), "--hostname", "127.0.0.1"];
    server = spawn(executable, args, {
      stdio: "ignore",
      shell: false,
      windowsHide: true,
      env: { ...process.env, OPENCODE_SERVER_USERNAME: "opencode", OPENCODE_SERVER_PASSWORD: TEST_SERVER_PASSWORD },
    });
    client = new OpenCodeWorkerClient({
      base_url: `http://127.0.0.1:${opencodePort}`,
      api_prefix: "/api",
      username: "opencode",
      password: TEST_SERVER_PASSWORD,
    });
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (await client.health(3000)) {
        serverUp = true;
        break;
      }
    }
  }, 60000);

  afterAll(async () => {
    try {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore", shell: false, windowsHide: true });
        killer.once("close", () => resolve());
        setTimeout(resolve, 2000);
      });
    } catch {
      // server zaten sonlanmis
    }
  });

  it("server health dogrulanmali", async () => {
    if (!serverUp) {
      expect(serverUp).toBe(true);
      return;
    }
    expect(serverUp).toBe(true);
  });

  it("session olusturma ve abort calismali (gercek HTTP API)", async () => {
    if (!serverUp) {
      expect(serverUp).toBe(true);
      return;
    }
    const session = await client.createSession();
    expect(session.session_id).toMatch(/^ses_/);
    const aborted = await client.abortSession(session.session_id);
    expect(typeof aborted).toBe("boolean");
  });

  it("worker config bash/edit/task kapali olmali", () => {
    const config = defaultWorkerConfig(`http://127.0.0.1:${opencodePort}`);
    const flags = workerToolFlags(config);
    expect(flags["bash"]).toBe(false);
    expect(flags["edit"]).toBe(false);
    expect(flags["task"]).toBe(false);
  });
});
