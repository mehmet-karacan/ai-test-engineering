import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { defaultConfig, saveConfig } from "../../src/configuration/config-loader.js";

function toolText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const content = result.content?.find((item) => item.type === "text");
  if (!content?.text) throw new Error("MCP text response missing");
  return content.text;
}

function ownedFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  return files;
}

describe.skipIf(process.platform !== "win32")("WN19 normal MCP fail-closed secret boundary", () => {
  it("keeps a synthetic credential out of wire, logs, DB and public artifacts before native readiness", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn19-mcp-"));
    const home = join(root, "home");
    const bin = join(root, "bin");
    const project = join(root, "project");
    const artifacts = join(root, "artifacts");
    const dbPath = join(root, "state.db");
    const configPath = join(root, "config.json");
    const mavenSentinel = join(root, "maven-ran.txt");
    const credential = `WN19_CREDENTIAL_${randomUUID().replace(/-/gu, "")}`;
    let client: Client | null = null;
    let transport: StdioClientTransport | null = null;
    let stderr = "";
    const wire: string[] = [];
    try {
      mkdirSync(join(home, ".m2"), { recursive: true });
      mkdirSync(bin);
      cpSync(join(process.cwd(), "tests", "fixtures", "sample-maven-project"), project, { recursive: true });
      writeFileSync(join(home, ".m2", "settings.xml"), `<settings><servers><server><id>fixture</id><password>${credential}</password></server></servers></settings>`);
      writeFileSync(join(bin, "mvn.cmd"), `@echo off\r\necho ran>"${mavenSentinel}"\r\nexit /b 0\r\n`);
      const config = defaultConfig();
      config.storage.root = artifacts;
      saveConfig(config, configPath);

      transport = new StdioClientTransport({
        command: process.execPath,
        args: [join(process.cwd(), "dist", "mcp", "stdio-entry.js")],
        stderr: "pipe",
        env: {
          ...process.env as Record<string, string>,
          USERPROFILE: home, HOME: home,
          Path: `${bin}${delimiter}${process.env.Path ?? process.env.PATH ?? ""}`,
          AITEST_CONFIG: configPath, AITEST_DB_PATH: dbPath,
          AITEST_RUNNER: "windows_native", AITEST_WORKER_ENABLED: "0",
        },
      });
      transport.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      client = new Client({ name: "wn19-fixture", version: "1" });
      await client.connect(transport);
      const start = toolText(await client.callTool({ name: "test_start", arguments: {
        project_root: project.replace(/\\/gu, "/"), targets: [{ selector: "PaymentService", kind: "class" }],
        coverage: { percent: 90, metrics: ["LINE"] }, mode: "TEST_ONLY",
      } }));
      wire.push(start);
      const started = JSON.parse(start) as { status: string; data?: { job_id?: string } };
      expect(started.status, start).toBe("ok");
      const jobId = started.data?.job_id;
      expect(jobId).toMatch(/^[0-9a-f-]{36}$/u);

      let status: { status: string; data?: { lifecycle?: string; report_facts?: unknown; report_path?: string | null } } | null = null;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const response = toolText(await client.callTool({ name: "test_status", arguments: { job_id: jobId } }));
        wire.push(response);
        status = JSON.parse(response) as typeof status;
        if (status?.data?.lifecycle === "FAILED") break;
        await delay(50);
      }
      expect(status?.data?.lifecycle).toBe("FAILED");
      const result = toolText(await client.callTool({ name: "test_result", arguments: { job_id: jobId } }));
      wire.push(result);
      const resultData = JSON.parse(result) as { data?: { report_facts?: unknown; report_path?: string | null } };
      expect(resultData.data?.report_facts).toBeNull();
      expect(resultData.data?.report_path).toBeNull();
      expect(existsSync(mavenSentinel)).toBe(false);
      expect(wire.join("\n") + stderr).toMatch(/NATIVE_PROCESS_OWNERSHIP_UNVERIFIED|process ownership/iu);
      expect(wire.join("\n") + stderr).not.toContain(credential);

      await client.close();
      client = null;
      transport = null;
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        const runCount = db.prepare("SELECT COUNT(*) AS count FROM test_run_provenance WHERE job_id = ?").get(jobId) as { count: number };
        const checkpointCount = db.prepare("SELECT COUNT(*) AS count FROM checkpoints WHERE job_id = ?").get(jobId) as { count: number };
        expect(runCount.count).toBe(0);
        expect(checkpointCount.count).toBe(0);
      } finally { db.close(); }
      for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, ...ownedFiles(artifacts)].filter(existsSync)) {
        expect(readFileSync(file).includes(Buffer.from(credential))).toBe(false);
      }
      expect(existsSync(join(artifacts, "jobs", jobId!, "reports", "PUBLISHED"))).toBe(false);
    } finally {
      try { await client?.close(); } catch { /* transport may already be closed */ }
      try { await transport?.close(); } catch { /* child may already be gone */ }
      const target = resolve(root);
      const inside = relative(resolve(tmpdir()), target);
      if (existsSync(target) && inside && !inside.startsWith("..") && !isAbsolute(inside) && basename(target).startsWith("aitest-wn19-mcp-") &&
          !lstatSync(target).isSymbolicLink() && realpathSync.native(target).toLowerCase() === target.toLowerCase()) {
        rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    }
  }, 60000);
});
