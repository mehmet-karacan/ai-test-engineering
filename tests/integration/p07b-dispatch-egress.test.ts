/**
 * P07-B: normal MCP customer dispatcher + Docker egress allowlist enforcement.
 * Gercek stdio-entry uzerinden test_start -> dispatch -> test_status terminal
 * lifecycle/outcome kaniti. Egress enforcement mekanizmasi (Docker network
 * policy/proxy) bagli DEGIL; provisioning acik + izinli mirror dolu iken urun
 * typed BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE doner (fail-closed).
 * Network yok diye sahte PASS/COMPLETED yazilmaz. Docker/imaj yoksa test
 * NOT_RUN (skip) kaniti olarak korunur.
 */
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const entryPath = join(repoRoot, "dist", "mcp", "stdio-entry.js");
const ALLOWED_MIRROR = "https://repo.maven.apache.org/maven2/";

interface EgressWireResult {
  initialize_ok: boolean;
  start_ok: boolean;
  job_id: string | null;
  lifecycle: string | null;
  outcome: string | null;
  status_polls?: number;
}

async function runDispatchScenario(timeoutMs: number): Promise<EgressWireResult> {
  const dir = mkdtempSync(join(tmpdir(), "aitest-p07b-egress-"));
  const artifactRoot = join(dir, "artifacts");
  const configPath = join(dir, "config.json");
  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    schema_version: 1,
    storage: { root: artifactRoot },
    coverage_defaults: { metrics: ["LINE", "BRANCH"] },
    budgets: { max_candidate_iterations: 2, max_repairs_per_candidate: 0, no_progress_window: 3, total_job_minutes: 30 },
    discovery: { max_concrete_targets: 500 },
    worker_profiles: [],
    allowed_project_roots: [],
    // P07-B: provisioning ACIK + izinli mirror DOLU; enforcement mekanizmasi
    // (network policy/proxy) bagli degil -> typed blocker beklentisi.
    dependency_provisioning: {
      enabled: true,
      allowed_mirrors: [ALLOWED_MIRROR],
      timeout_ms: 900000,
    },
  }));

  const projectDir = join(dir, "customer-project");
  cpSync(join(repoRoot, "tests", "fixtures", "sample-maven-project"), projectDir, { recursive: true });

  const child = spawn(process.execPath, [entryPath], {
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      AITEST_CONFIG: configPath,
      AITEST_DB_PATH: join(dir, "state.db"),
      AITEST_RUNNER: "docker",
      AITEST_WORKER_ENABLED: "0",
    },
  });

  let stdout = "";
  const result: EgressWireResult = { initialize_ok: false, start_ok: false, job_id: null, lifecycle: null, outcome: null };
  let stage = 0;
  let statusAttempts = 0;
  let requestId = 4;
  let settled = false;
  let finishResolve: ((value: EgressWireResult) => void) | null = null;

  const send = (obj: Record<string, unknown>): void => {
    child.stdin.write(JSON.stringify(obj) + "\n");
  };

  const finish = (value: EgressWireResult): void => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timer);
    child.kill();
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    finishResolve?.(value);
  };

  const timer = setTimeout(() => finish(result), timeoutMs);

  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "p07b-egress", version: "0.1.0" } } });

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");

    if (stage === 0 && stdout.includes('"id":1')) {
      result.initialize_ok = true;
      stage = 1;
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    }
    if (stage === 1 && stdout.includes('"id":2')) {
      stage = 2;
      send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "test_start",
          arguments: {
            project_root: projectDir.replace(/\\/g, "/"),
            targets: [{ selector: "PaymentService", kind: "class" }],
            coverage: { percent: 90, metrics: ["LINE", "BRANCH"] },
            mode: "TEST_ONLY",
          },
        },
      });
    }
    if (stage === 2 && stdout.includes('"id":3')) {
      const jobMatch = /job_id\\+":\\+"([0-9a-f-]{36})/.exec(stdout) ?? /job_id":"([0-9a-f-]{36})"/.exec(stdout);
      if (jobMatch) {
        result.start_ok = true;
        result.job_id = jobMatch[1]!;
        stage = 3;
        send({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name: "test_status", arguments: { job_id: result.job_id } } });
      } else {
        finish(result);
      }
    }
    if (stage === 3 && stdout.includes(`"id":${requestId}`)) {
      // JSONRPC cevabi: result icerigi frame'in SONUNDAKI "id":N'den ONCE gelir.
      // Yalniz bu response segmentinin icerigi parse edilir; onceki status
      // cevabinin bos "outcome":null alani karismaz.
      result.status_polls = (result.status_polls ?? 0) + 1;
      const responseEnd = stdout.lastIndexOf(`"id":${requestId}`);
      const rawText = stdout.slice(Math.max(0, responseEnd - 4000), responseEnd + 100);
      // tool text icerigi escaped JSON; parse oncesi unescape edilir
      const responseText = rawText.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      const lifecycleMatch = /lifecycle":"([A-Z_]+)"/.exec(responseText) ?? /lifecycle":"([A-Z_]+)/.exec(responseText);
      const lifecycle = lifecycleMatch?.[1] ?? null;
      if (lifecycle === "QUEUED" || lifecycle === "RUNNING") {
        if (statusAttempts < 30) {
          statusAttempts++;
          requestId++;
          setTimeout(() => {
            send({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name: "test_status", arguments: { job_id: result.job_id! } } });
          }, 5000);
        } else {
          result.lifecycle = lifecycle;
          finish(result);
        }
        return;
      }
      result.lifecycle = lifecycle;
      const outcomeMatch = /outcome":"([A-Z_]+)"/.exec(responseText);
      result.outcome = outcomeMatch?.[1] ?? null;
      finish(result);
    }
  });

  child.on("error", () => finish(result));

  return new Promise<EgressWireResult>((resolvePromise) => {
    finishResolve = resolvePromise;
  });
}

describe("P07-B: normal MCP customer dispatcher egress enforcement (gercek Docker)", () => {
  it("provisioning acik + izinli mirror: typed BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE (sahte COMPLETED/PASS yok)", async (ctx) => {
    const { DockerRunner } = await import("../../src/runners/docker-runner.js");
    const preflight = await new DockerRunner().preflight();
    if (!preflight.docker_available || !preflight.maven_image_present) {
      // Docker/imaj yok: NOT_RUN kaniti (skip), sahte yesil yok
      ctx.skip();
    }
    const result = await runDispatchScenario(90000);
    expect(result.initialize_ok).toBe(true);
    expect(result.start_ok).toBe(true);
    expect(result.job_id).toMatch(/^[0-9a-f-]{36}$/);
    // fail-closed: sahte COMPLETED/READY DEGIL; terminal FAILED + typed egress blocker:
    expect(result.lifecycle).toBe("FAILED");
    expect(result.outcome).toBe("BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE");
  }, 600000);
});
