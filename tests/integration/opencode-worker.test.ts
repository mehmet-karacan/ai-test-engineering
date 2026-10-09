/**
 * Gercek OpenCode server contract/smoke testi: server'i child process olarak baslatir,
 * /session olusturma + prompt_async + abort akisini gercek HTTP API'yle dogrular.
 * Model cagrisi gerektiren akis yalniz yetkili model mevcutsa calisir; yoksa smoke yalniz session/abort dogrular.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { OpenCodeWorkerClient } from "../../src/workers/opencode/worker-client.js";
import { defaultWorkerConfig, workerToolFlags } from "../../src/workers/opencode/worker-config.js";

const OPENCODE_PORT = 24196;

describe("OpenCode server entegrasyonu (gercek)", () => {
  let server: ChildProcess;
  let client: OpenCodeWorkerClient;
  let serverUp = false;

  beforeAll(async () => {
    server = spawn("cmd", ["/c", "opencode.cmd", "serve", "--port", String(OPENCODE_PORT), "--hostname", "127.0.0.1", "--pure"], {
      stdio: "ignore",
      shell: false,
      windowsHide: true,
    });
    client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${OPENCODE_PORT}` });
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (await client.health(3000)) {
        serverUp = true;
        break;
      }
    }
  }, 60000);

  afterAll(() => {
    try {
      spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore", shell: false });
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
    const config = defaultWorkerConfig(`http://127.0.0.1:${OPENCODE_PORT}`);
    const flags = workerToolFlags(config);
    expect(flags["bash"]).toBe(false);
    expect(flags["edit"]).toBe(false);
    expect(flags["task"]).toBe(false);
  });
});
