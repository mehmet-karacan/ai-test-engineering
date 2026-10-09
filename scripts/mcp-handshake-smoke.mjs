/**
 * MCP handshake smoke: gercek stdio server baslat, initialize + tools/list + tools/call dogrula.
 * Kurulumun baglanti dogrulamasi icin; tam kabul suite'i ayridir.
 */
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const repoRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

function main() {
  const dir = mkdtempSync(join(tmpdir(), "aitest-smoke-"));
  const artifactRoot = join(dir, "artifacts");
  const dbPath = join(dir, "state.db");
  const configPath = join(dir, "config.json");
  mkdirSync(artifactRoot, { recursive: true });

  writeFileSync(configPath, JSON.stringify({
    schema_version: 1,
    storage: { root: artifactRoot },
    coverage_defaults: { metrics: ["LINE", "BRANCH"] },
    budgets: { max_candidate_iterations: 20, max_repairs_per_candidate: 2, no_progress_window: 3, total_job_minutes: 120 },
    worker_profiles: [],
    allowed_project_roots: [],
  }, null, 2));

  const projectDir = join(dir, "sample-project");
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, "pom.xml"), "<project><artifactId>smoke</artifactId></project>");

  const child = spawn(process.execPath, [join(repoRoot, "dist", "mcp", "stdio-entry.js")], {
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
    env: { ...process.env, AITEST_CONFIG: configPath, AITEST_DB_PATH: dbPath },
  });

  let stdout = "";
  let stderr = "";
  let done = false;
  let stage = 0;
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

  const send = (obj) => {
    child.stdin.write(JSON.stringify(obj) + "\n");
  };

  const toolsCall = { name: "project_inspect", arguments: { project_root: projectDir.replace(/\\/g, "/"), refresh: false } };

  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "install-smoke", version: "0.1.0" } } });

  const timer = setTimeout(() => {
    if (!done) {
      done = true;
      child.kill();
      console.error(`MCP handshake smoke timeout (stage: ${stage})`);
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
      process.exit(1);
    }
  }, 45000);

  const onData = () => {
    if (stage === 0 && stdout.includes('"id":1')) {
      stage = 1;
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    }
    if (stage === 1 && stdout.includes('"id":2')) {
      const listOk = stdout.includes("project_inspect") && stdout.includes("test_start");
      if (!listOk) {
        done = true;
        clearTimeout(timer);
        child.kill();
        console.error("Beklenen araclara tools/list'te rastlanmadi");
        try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
        process.exit(1);
      }
      stage = 2;
      send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: toolsCall });
    }
    if (stage === 2 && stdout.includes('"id":3')) {
      done = true;
      clearTimeout(timer);
      child.kill();
      // tool sonucu text content'te escape'li JSON olarak geliyor (\\"status\\":\\"ok\\");
      const ok = stdout.includes('"status":"ok"') || stdout.includes('\\"status\\":\\"ok\\"');
      if (!ok) {
        console.error("tools/call beklenen basariyi dondurmedi");
        try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
        process.exit(1);
      }
      console.log("MCP handshake smoke gecti: initialize + tools/list + tools/call");
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
      process.exit(0);
    }
  };

  child.stdout.on("data", onData);
  child.on("exit", (code) => {
    if (!done) {
      done = true;
      clearTimeout(timer);
      console.error(`Server beklenmeden sonlandi (exit ${code}); stderr: ${stderr.slice(0, 300)}`);
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
      process.exit(1);
    }
  });
}

main();
