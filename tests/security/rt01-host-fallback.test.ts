/**
 * RT01/RT02: Normal kurulumda AITEST_RUNNER/WORKER env ayari yokken customer host yolu baslamaz (B01).
 * Bu testler guncel koddaki kusuru gosterecek (kirmizi); K01 duzeltmesiyle yeserecek.
 */
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = process.cwd();

interface EnvProbeResult {
  start_ok: boolean;
  job_id: string | null;
  lifecycle: string | null;
  outcome: string | null;
  dispatch_error: string | null;
  host_maven_used: boolean;
}

/**
 * Env ayari olmadan test_start cagirir; dispatcher'in hangi runner'i sectigini
 * stderr dispatch ciktisindan ve lifecycle'dan anlar.
 */
function probeStartWithEnv(envOverrides: Record<string, string | undefined>): Promise<EnvProbeResult> {
  return new Promise((resolvePromise) => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-rt01-"));
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

    const projectDir = join(dir, "probe-project");
    mkdirSync(join(projectDir, "src", "main", "java", "com", "example", "probe"), { recursive: true });
    writeFileSync(join(projectDir, "pom.xml"), '<?xml version="1.0"?><project><modelVersion>4.0.0</modelVersion><groupId>com.example</groupId><artifactId>probe</artifactId><version>1.0.0</version><packaging>jar</packaging><properties><maven.compiler.source>17</maven.compiler.source><maven.compiler.target>17</maven.compiler.target></properties></project>');
    writeFileSync(join(projectDir, "src", "main", "java", "com", "example", "probe", "ProbeService.java"), 'package com.example.probe;\npublic class ProbeService { public int add(int a, int b) { return a + b; } }\n');

    // env ayarlari: verilmeyen degiskenler undefined ile silinir (RT01 senaryosu)
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !key.startsWith("AITEST_")) {
        env[key] = value;
      }
    }
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    const child = spawn(process.execPath, [join(repoRoot, "dist", "mcp", "stdio-entry.js")], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      env: { ...env, AITEST_CONFIG: configPath, AITEST_DB_PATH: join(dir, "state.db") },
    });

    let stdout = "";
    let stderr = "";
    const result: EnvProbeResult = { start_ok: false, job_id: null, lifecycle: null, outcome: null, dispatch_error: null, host_maven_used: false };
    let stage = 0;
    let requestId = 4;
    let statusAttempts = 0;

    const send = (obj: Record<string, unknown>) => {
      child.stdin.write(JSON.stringify(obj) + "\n");
    };

    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "rt01-probe", version: "0.1.0" } } });

    const cleanup = (code: number) => {
      clearTimeout(timer);
      child.kill();
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
      resolvePromise(result);
      void code;
    };

    const timer = setTimeout(() => {
      cleanup(1);
    }, 240000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stage === 0 && stdout.includes('"id":1')) {
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
              targets: [{ selector: "ProbeService", kind: "class" }],
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
          cleanup(1);
        }
      }
      if (stage === 3 && stdout.includes(`"id":${requestId}`)) {
        const responseStart = stdout.lastIndexOf(`"id":${requestId}`);
        const responseText = stdout.slice(Math.max(0, responseStart - 3000), responseStart + 200);
        const lifecycleMatch = /lifecycle\\+":\\+"([A-Z_]+)/.exec(responseText) ?? /lifecycle":"([A-Z_]+)"/.exec(responseText);
        const outcomeMatch = /outcome\\+":\\+"([A-Z_]+)"/.exec(responseText) ?? /outcome":"([A-Z_]+)"/.exec(responseText);
        const lifecycle = lifecycleMatch?.[1] ?? null;
        if (lifecycle === "QUEUED" || lifecycle === "RUNNING") {
          if (statusAttempts < 15) {
            statusAttempts++;
            requestId++;
            setTimeout(() => {
              send({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name: "test_status", arguments: { job_id: result.job_id } } });
            }, 10000);
          } else {
            result.lifecycle = lifecycle;
            cleanup(1);
          }
          return;
        }
        result.lifecycle = lifecycle;
        result.outcome = outcomeMatch?.[1] ?? null;
        cleanup(0);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      // dispatcher host_dev_only yolu kullandi mi (host Maven spawn):
      const dispatchMatch = /\[aitest-dispatch\] job ([0-9a-f-]+) ([A-Z_]+)/.exec(stderr);
      if (dispatchMatch) {
        result.dispatch_error = dispatchMatch[2]!;
      }
      if (stderr.includes("aitest-baseline-logs") || stderr.includes("maven-stdout.log")) {
        result.host_maven_used = true;
      }
    });
  });
}

describe("RT01/RT02: normal kurulumda host fallback (B01)", () => {
  const entryPath = join(repoRoot, "dist", "mcp", "stdio-entry.js");

  it("RT01: env ayari olmayan normal kurulumda customer host JVM/Maven BASLAMAMALI", async () => {
    const result = await probeStartWithEnv({});
    expect(result.start_ok).toBe(true);
    // mevcut kusur: host_dev_only ile host Maven calisir; duzeltme sonrasi bu test izolasyon/model hazirligina gore
    // BLOCKED veya guvenli runner ile calisir; host yolu KULLANILMAMALI.
    expect(result.host_maven_used).toBe(false);
  }, 300000);

  it("RT02: customer icin host_dev_only env'si yok sayilmaz; BLOCKED red edilir (tip donusumune guvenilmez)", async () => {
    const result = await probeStartWithEnv({ AITEST_RUNNER: "host_dev_only", AITEST_WORKER_ENABLED: "1" });
    // customer job'da env ile host yolu secilemez (dagitilan entrypoint'ten bu parametre kullanilamaz);
    // fail-closed: BLOCKED_ISOLATION ile job baslamaz veya izolasyon yoluyla devam eder; host Maven KULLANILMAZ:
    expect(result.host_maven_used).toBe(false);
  }, 300000);
});
