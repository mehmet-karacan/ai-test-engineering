/**
 * Gercek stdio client entegrasyon testi: server'i child process olarak baslatir,
 * initialize + tools/list + tools/call akisini gercek MCP protokoluyle dogrular.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

describe("stdio MCP entegrasyonu (gercek client)", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let dir: string;
  let projectDir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "aitest-e2e-"));
    const artifactRoot = join(dir, "artifacts");
    const dbPath = join(dir, "state.db");
    const configPath = join(dir, "config.json");
    const { defaultConfig, saveConfig } = await import("../../src/configuration/config-loader.js");
    const config = defaultConfig();
    config.storage.root = artifactRoot;
    saveConfig(config, configPath);

    const { cpSync } = await import("node:fs");
    projectDir = join(dir, "fixture-project");
    cpSync(join(FIXTURES, "sample-maven-project"), projectDir, { recursive: true });

    const entryPath = join(process.cwd(), "dist", "mcp", "stdio-entry.js");
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [entryPath],
      env: {
        ...process.env as Record<string, string>,
        AITEST_CONFIG: configPath,
        AITEST_DB_PATH: dbPath,
      },
    });
    client = new Client({ name: "test-client", version: "0.1.0" });
    await client.connect(transport);
  }, 60000);

  afterAll(async () => {
    try {
      await client.close();
    } catch {
      // transport zaten kapanmis olabilir
    }
    delete process.env["AITEST_CONFIG"];
    delete process.env["AITEST_DB_PATH_OVERRIDE"];
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("tools/list sekiz araci donmeli", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual(["project_inspect", "project_query", "test_apply", "test_cancel", "test_result", "test_resume", "test_start", "test_status"]);
  });

  it("project_inspect fixture projesinde envanter uretmeli", async () => {
    const result = await client.callTool({
      name: "project_inspect",
      arguments: { project_root: projectDir.replace(/\\/g, "/"), refresh: true },
    });
    expect(result.isError !== true).toBe(true);
    const textContent = result.content?.find((c) => c.type === "text");
    expect(textContent).toBeDefined();
    const parsed = JSON.parse((textContent as { type: "text"; text: string }).text) as {
      status: string;
      data?: { inventory?: { kind?: string; module_count?: number } };
    };
    expect(parsed.status).toBe("ok");
    expect(parsed.data?.inventory?.kind).toBe("maven_single");
    expect(parsed.data?.inventory?.module_count).toBe(1);
  });

  it("test_start job baslatmali, hedefi cozmeli ve idempotent olmali", async () => {
    const args = {
      project_root: projectDir.replace(/\\/g, "/"),
      targets: [{ selector: "PaymentService", kind: "class" as const }],
      coverage: { percent: 90, metrics: ["LINE" as const, "BRANCH" as const] },
      mode: "TEST_ONLY" as const,
    };
    const result = await client.callTool({ name: "test_start", arguments: args });
    const textContent = result.content?.find((c) => c.type === "text");
    const parsed = JSON.parse((textContent as { type: "text"; text: string }).text) as {
      status: string;
      error?: { code?: string; message?: string };
      data?: { job_id?: string; created?: boolean };
    };
    expect(parsed.status).toBe("ok");
    expect(parsed.data?.job_id).toBeTruthy();
    expect(parsed.data?.created).toBe(true);

    const second = await client.callTool({ name: "test_start", arguments: args });
    const secondText = second.content?.find((c) => c.type === "text");
    const secondParsed = JSON.parse((secondText as { type: "text"; text: string }).text) as {
      data?: { job_id?: string; created?: boolean };
    };
    expect(secondParsed.data?.created).toBe(false);
    expect(secondParsed.data?.job_id).toBe(parsed.data?.job_id);
  });

  it("test_status job durumunu donmeli", async () => {
    const status = await client.callTool({
      name: "test_status",
      arguments: { project_root: projectDir.replace(/\\/g, "/") },
    });
    const textContent = status.content?.find((c) => c.type === "text");
    const parsed = JSON.parse((textContent as { type: "text"; text: string }).text) as {
      status: string;
      data?: { lifecycle?: string; events?: unknown[] };
    };
    expect(parsed.status).toBe("ok");
    expect(parsed.data?.events?.length).toBeGreaterThan(0);
  });

  it("project_query siniflari listelemeli", async () => {
    const query = await client.callTool({
      name: "project_query",
      arguments: { project_root: projectDir.replace(/\\/g, "/"), view: "classes", limit: 20 },
    });
    const textContent = query.content?.find((c) => c.type === "text");
    const parsed = JSON.parse((textContent as { type: "text"; text: string }).text) as {
      status: string;
      data?: { rows?: Array<{ fqn?: string }> };
    };
    expect(parsed.status).toBe("ok");
    expect(parsed.data?.rows?.some((r) => r.fqn === "com.example.payment.PaymentService")).toBe(true);
  });
});
