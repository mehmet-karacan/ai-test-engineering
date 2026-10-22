import { afterEach, describe, expect, it } from "vitest";
import { createLocalUiServer, type UiBackend } from "../../src/ui/server.js";

describe("loopback UI HTTP boundary", () => {
  const servers: ReturnType<typeof createLocalUiServer>[] = [];
  afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); } });
  async function fixture() {
    const calls: unknown[] = [];
    const backend: UiBackend = {
      bootstrap: async () => ({ projects: [], worker_enabled: true, model: null }),
      history: async () => ({ jobs: [] }),
      scan: async value => { calls.push(value); return { job_id: "scan" }; },
      start: async value => { calls.push(value); return { job_id: "test" }; },
      job: async () => ({ status: {}, result: {}, measurements: [] }),
      reportFile: async () => { throw new Error("not published"); },
    };
    const server = createLocalUiServer(backend); servers.push(server);
    await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}`;
    const initial = await fetch(`${url}/api/bootstrap`);
    const cookie = initial.headers.get("set-cookie")!.split(";")[0]!;
    const data = await initial.json() as { csrf: string };
    return { server, url, cookie, csrf: data.csrf, calls };
  }
  it("serves the real page/assets and requires same-origin session + token for mutations", async () => {
    const f = await fixture();
    const page = await fetch(f.url);
    expect(await page.text()).toContain("Genel kapsamı analiz et");
    expect(page.headers.get("content-security-policy")).toContain("connect-src 'self'");
    expect((await fetch(`${f.url}/api/scan`, { method: "POST", body: "{}" })).status).toBe(403);
    const headers = { cookie: f.cookie, origin: f.url, "content-type": "application/json", "x-ui-csrf": f.csrf };
    expect((await fetch(`${f.url}/api/scan`, { method: "POST", headers: { ...headers, origin: "https://evil.example" }, body: "{}" })).status).toBe(403);
    expect((await fetch(`${f.url}/api/scan`, { method: "POST", headers, body: JSON.stringify({ project_root: "C:/project" }) })).status).toBe(200);
    expect(f.calls).toHaveLength(1);
    expect((await fetch(`${f.url}/api/start`, { method: "POST", headers, body: "[" })).status).toBe(400);
    expect((await fetch(`${f.url}/api/start`, { method: "POST", headers, body: JSON.stringify({ value: "x".repeat(66000) }) })).status).toBe(413);
    expect((await fetch(`${f.url}/api/anything`, { headers: { cookie: f.cookie } })).status).toBe(404);
    expect((await fetch(`${f.url}/api/history`, { headers: { origin: "https://evil.example", cookie: f.cookie } })).status).toBe(403);
  });
  it("does not accept DNS-rebinding host names", async () => {
    const f = await fixture();
    const { request } = await import("node:http");
    const code = await new Promise<number>(resolve => {
      const req = request(`${f.url}/api/bootstrap`, { headers: { host: "attacker.example" } }, res => { res.resume(); resolve(res.statusCode!); }); req.end();
    });
    expect(code).toBe(403);
  });
});
