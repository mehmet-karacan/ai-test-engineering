/**
 * Gercek stdio client entegrasyon testi: server'i child process olarak baslatir,
 * initialize + tools/list + tools/call akisini gercek MCP protokoluyle dogrular.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("stdio MCP entegrasyonu (gercek client)", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "aitest-e2e-"));
    const artifactRoot = join(dir, "artifacts");
    const dbPath = join(dir, "state.db");
    const configPath = join(dir, "config.json");
    const { defaultConfig, saveConfig } = await import("../../src/configuration/config-loader.js");
    const config = defaultConfig();
    config.storage.root = artifactRoot;
    saveConfig(config, configPath);

    process.env["AITEST_CONFIG"] = configPath;
    process.env["AITEST_DB_PATH_OVERRIDE"] = dbPath;

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
    rmSync(dir, { recursive: true, force: true });
  });

  it("tools/list uc araci donmeli", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual(["project_inspect", "test_start", "test_status"]);
  });

  it("project_inspect sentetik proje kokunde calismali", async () => {
    const projectDir = join(dir, "sample-project");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "pom.xml"), "<project><artifactId>demo</artifactId></project>");

    const result = await client.callTool({
      name: "project_inspect",
      arguments: { project_root: projectDir.replace(/\\/g, "/"), refresh: false },
    });
    expect(result.isError !== true).toBe(true);
    const textContent = result.content?.find((c) => c.type === "text");
    expect(textContent).toBeDefined();
    const parsed = JSON.parse((textContent as { type: "text"; text: string }).text) as {
      status: string;
      data?: { inventory?: { kind?: string } };
    };
    expect(parsed.status).toBe("ok");
    expect(parsed.data?.inventory?.kind).toBe("maven_single");
  });

  it("test_start job baslatmali ve job_id donmeli", async () => {
    const projectDir = join(dir, "sample-project-2");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "pom.xml"), "<project><artifactId>demo2</artifactId></project>");

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
    const projectDir = join(dir, "sample-project-2");
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
});
