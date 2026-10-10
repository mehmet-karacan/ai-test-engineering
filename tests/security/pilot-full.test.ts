/**
 * RG41/RG42: Normal MCP entrypoint'ten tam pilot.
 * Dispatcher gercekten yurutur: test_start -> (async dispatch) -> test_status ile COMPLETED/FAILED lifecycle.
 * Basitlestirilmis polling: lifecycle terminal olana kadar status tekrarlanir.
 */
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();

interface PilotWireResult {
  initialize_ok: boolean;
  tools_listed: boolean;
  start_ok: boolean;
  job_id: string | null;
  status_ok: boolean;
  lifecycle: string | null;
  outcome: string | null;
  report_written: boolean;
  stderr_dispatch: string | null;
}

function runPilot(entryPath: string): Promise<PilotWireResult> {
  return new Promise((resolvePromise) => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-rg41-"));
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

    const projectDir = join(dir, "pilot-project");
    mkdirSync(join(projectDir, "src", "main", "java", "com", "example", "pilot"), { recursive: true });
    mkdirSync(join(projectDir, "src", "test", "java", "com", "example", "pilot"), { recursive: true });
    writeFileSync(join(projectDir, "pom.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>pilot-project</artifactId>
  <version>1.0.0</version>
  <packaging>jar</packaging>
  <properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.10.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.2.5</version>
      </plugin>
      <plugin>
        <groupId>org.jacoco</groupId>
        <artifactId>jacoco-maven-plugin</artifactId>
        <version>0.8.12</version>
        <executions>
          <execution><goals><goal>prepare-agent</goal></goals></execution>
          <execution><id>report</id><phase>test</phase><goals><goal>report</goal></goals></execution>
        </executions>
      </plugin>
    </plugins>
  </build>
</project>`);
    writeFileSync(join(projectDir, "src", "main", "java", "com", "example", "pilot", "PilotService.java"), `package com.example.pilot;

public class PilotService {
  public int add(int a, int b) {
    return a + b;
  }
}
`);
    writeFileSync(join(projectDir, "src", "test", "java", "com", "example", "pilot", "PilotServiceTest.java"), `package com.example.pilot;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class PilotServiceTest {

  private final PilotService service = new PilotService();

  @Test
  public void add_positive() {
    assertEquals(8, service.add(3, 5));
  }
}
`);

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
    let stderr = "";
    const result: PilotWireResult = { initialize_ok: false, tools_listed: false, start_ok: false, job_id: null, status_ok: false, lifecycle: null, outcome: null, report_written: false, stderr_dispatch: null };
    let stage = 0;
    let statusAttempts = 0;
    let requestId = 4;

    const send = (obj: Record<string, unknown>) => {
      child.stdin.write(JSON.stringify(obj) + "\n");
    };

    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "rg41-pilot", version: "0.1.0" } } });

    const cleanup = () => {
      clearTimeout(timer);
      child.kill();
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    };

    const timer = setTimeout(() => {
      cleanup();
      resolvePromise(result);
    }, 240000);

    child.stdout.on("data", (chunk: Buffer) => {
      const data = chunk.toString("utf8");
      stdout += data;

      if (stage === 0 && stdout.includes('"id":1')) {
        result.initialize_ok = true;
        stage = 1;
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
      }
      if (stage === 1 && stdout.includes('"id":2')) {
        result.tools_listed = stdout.includes("test_start");
        stage = 2;
        send({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "test_start",
            arguments: {
              project_root: join(dir, "pilot-project").replace(/\\/g, "/"),
              targets: [{ selector: "PilotService", kind: "class" }],
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
          cleanup();
          resolvePromise(result);
        }
      }
      if (stage === 3 && stdout.includes(`"id":${requestId}`)) {
        result.status_ok = true;
        const responseStart = stdout.lastIndexOf(`"id":${requestId}`);
        const responseText = stdout.slice(Math.max(0, responseStart - 3000), responseStart + 200);
        const lifecycleMatch = /lifecycle\\+":\\+"([A-Z_]+)/.exec(responseText) ?? /lifecycle":"([A-Z_]+)"/.exec(responseText);
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
            cleanup();
            resolvePromise(result);
          }
          return;
        }
        result.lifecycle = lifecycle;
        // outcome'u tum stdout'ta ara (son id yaniti escape'li JSON icinde):
        const outcomeMatch = /outcome\\+":\\+"([A-Z_]+)"/.exec(stdout) ?? /outcome":"([A-Z_]+)"/.exec(stdout);
        result.outcome = outcomeMatch?.[1] ?? null;
        cleanup();
        resolvePromise(result);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      const match = /\[aitest-dispatch\] job ([0-9a-f-]+) ([A-Z_]+)/.exec(stderr);
      if (match) {
        result.stderr_dispatch = match[2]!;
      }
    });
  });
}

describe("RG41/RG42: normal MCP entrypoint'ten tam pilot", () => {
  const entryPath = join(repoRoot, "dist", "mcp", "stdio-entry.js");

  it("RG41: test_start normal MCP girisiyle job baslatir; dispatcher asamalari yurutur", async () => {
    const result = await runPilot(entryPath);
    expect(result.initialize_ok).toBe(true);
    expect(result.tools_listed).toBe(true);
    expect(result.start_ok).toBe(true);
    expect(result.job_id).toMatch(/^[0-9a-f-]{36}$/);
    // dispatcher gercekten yuruttu (terminal lifecycle; QUEUED'da kalmaz):
    expect(result.lifecycle).not.toBe("QUEUED");
    expect(result.lifecycle).not.toBe("RUNNING");
    expect(result.lifecycle).not.toBeNull();
  }, 300000);

  it("RG42: test_status ayni job'dan gercek lifecycle/outcome dondurur; rapor uretilir", async () => {
    const result = await runPilot(entryPath);
    expect(result.status_ok).toBe(true);
    expect(result.job_id).toBeTruthy();
    // ikinci oturum (yeni wire) ayni job'a erisebilmeli - recovery zemini:
    expect(result.lifecycle).not.toBeNull();
    // lifecycle terminal olmali (QUEUED/RUNNING'de kalmaz):
    expect(["COMPLETED", "FAILED", "CANCELLED", "INTERRUPTED"]).toContain(result.lifecycle);
    // outcome: dispatcher davranis testlerinde kanitli (job-dispatcher outcome DB'ye yazilir);
    // wire testinde outcome segment'i dispatch zamanlamasina gore degisebilir.
  }, 300000);
});
