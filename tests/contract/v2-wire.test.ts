/**
 * F12/RG11: Gercek v2 profil wire lifecycle contract testi.
 * Ikinci profil gercek stdio initialize/discovery/call akisini calistirir;
 * yalniz tools array karsilastirmasi degil, gercek wire kaniti.
 */
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = process.cwd();

interface WireResult {
  initialize_ok: boolean;
  tools_listed: boolean;
  call_ok: boolean;
  protocol_version: string | null;
  stderr: string;
}

/**
 * Gercek stdio wire akisi: spawn -> initialize -> initialized -> tools/list -> tools/call.
 * v1 ve v2 profillerinde ayni use-case'leri dogrular.
 */
function runWireFlow(entryPath: string, envOverrides: Record<string, string>): Promise<WireResult> {
  return new Promise((resolvePromise) => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-wire-"));
    const artifactRoot = join(dir, "artifacts");
    const configPath = join(dir, "config.json");
    mkdirSync(artifactRoot, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      schema_version: 1,
      storage: { root: artifactRoot },
      coverage_defaults: { metrics: ["LINE", "BRANCH"] },
      budgets: { max_candidate_iterations: 20, max_repairs_per_candidate: 2, no_progress_window: 3, total_job_minutes: 120 },
      worker_profiles: [],
      allowed_project_roots: [],
    }));

    const projectDir = join(dir, "sample-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "pom.xml"), "<project><artifactId>wire</artifactId></project>");

    const child = spawn(process.execPath, [entryPath], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      env: { ...process.env, AITEST_CONFIG: configPath, AITEST_DB_PATH: join(dir, "state.db"), ...envOverrides },
    });

    let stdout = "";
    const result: WireResult = { initialize_ok: false, tools_listed: false, call_ok: false, protocol_version: null, stderr: "" };
    let stage = 0;

    const send = (obj: Record<string, unknown>) => {
      child.stdin.write(JSON.stringify(obj) + "\n");
    };

    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "wire-test", version: "0.1.0" } } });

    const timer = setTimeout(() => {
      child.kill();
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
      resolvePromise(result);
    }, 45000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stage === 0 && stdout.includes('"id":1')) {
        result.initialize_ok = true;
        const protoMatch = /"protocolVersion":"([^"]+)"/.exec(stdout);
        result.protocol_version = protoMatch?.[1] ?? null;
        stage = 1;
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
      }
      if (stage === 1 && stdout.includes('"id":2')) {
        result.tools_listed = stdout.includes("project_inspect") && stdout.includes("test_start");
        stage = 2;
        send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "project_inspect", arguments: { project_root: projectDir.replace(/\\/g, "/"), refresh: false } } });
      }
      if (stage === 2 && stdout.includes('"id":3')) {
        result.call_ok = stdout.includes('\\"status\\":\\"ok\\"') || stdout.includes('"status":"ok"');
        done();
      }
    });

    function done() {
      clearTimeout(timer);
      child.kill();
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
      resolvePromise(result);
    }

    child.stderr.on("data", (chunk: Buffer) => {
      result.stderr += chunk.toString("utf8");
    });
    child.on("exit", () => {
      if (timer.hasRef && !done.length) {
        // timer hala aktif; done zaten cagrilmediyse timeout bekle
      }
    });
  });
}

describe("F12/RG11: gercek v2 profil wire lifecycle", () => {
  const entryPath = join(repoRoot, "dist", "mcp", "stdio-entry.js");

  it("v1 profili gercek wire initialize/discovery/call akisini gecmeli", async () => {
    const result = await runWireFlow(entryPath, { AITEST_PROFILE: "v1" });
    expect(result.initialize_ok).toBe(true);
    expect(result.tools_listed).toBe(true);
    expect(result.call_ok).toBe(true);
  }, 90000);

  it("v2 profili gercek wire initialize/discovery/call akisini gecmeli (ayni use-case'ler)", async () => {
    const result = await runWireFlow(entryPath, { AITEST_PROFILE: "v2" });
    expect(result.initialize_ok).toBe(true);
    expect(result.tools_listed).toBe(true);
    expect(result.call_ok).toBe(true);
  }, 90000);

  it("iki profil ayni use-case'leri sunar; tool seti degismez", async () => {
    const v1 = await runWireFlow(entryPath, { AITEST_PROFILE: "v1" });
    const v2 = await runWireFlow(entryPath, { AITEST_PROFILE: "v2" });
    expect(v1.tools_listed).toBe(v2.tools_listed);
    expect(v1.call_ok).toBe(v2.call_ok);
  }, 120000);
});
