/** Read-only installation smoke; customer project inventory is never created. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), "..");

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "aitest-smoke-"));
  const artifactRoot = join(dir, "artifacts");
  const dbPath = process.env["AITEST_DB_PATH"] || join(dir, "state.db");
  const configPath = process.env["AITEST_CONFIG"] || join(dir, "config.json");
  mkdirSync(artifactRoot, { recursive: true });
  if (!process.env["AITEST_CONFIG"]) {
    writeFileSync(configPath, JSON.stringify({
      schema_version: 1, storage: { root: artifactRoot }, coverage_defaults: {}, budgets: {},
      allowed_project_roots: [], worker_profiles: [],
    }));
  }
  // SDK framing validates response IDs and complete JSON-RPC messages, even when
  // child stdout splits a response between chunks. No hand-written substring parser.
  const transport = new StdioClientTransport({
    command: process.execPath, args: [join(repoRoot, "dist", "mcp", "stdio-entry.js")],
    env: { ...process.env, AITEST_CONFIG: configPath, AITEST_DB_PATH: dbPath }, stderr: "pipe",
  });
  const client = new Client({ name: "install-smoke", version: "0.1.0" });
  try {
    await client.connect(transport, { timeout: 45000 });
    const listed = await client.listTools({}, { timeout: 45000 });
    for (const name of ["project_inspect", "project_query", "test_start", "project_coverage"]) {
      if (!listed.tools.some((tool) => tool.name === name)) throw Error(`Beklenen arac yok: ${name}`);
    }
    // Works with restricted allowed_project_roots; read-only and no fixture rows.
    const result = await client.callTool({ name: "project_query", arguments: { view: "projects", limit: 1 } }, undefined, { timeout: 45000 });
    const text = result.content.find((item) => item.type === "text")?.text;
    const payload = JSON.parse(text ?? "null");
    if (result.isError || payload?.status !== "ok") throw Error("tools/call beklenen basariyi dondurmedi");
    console.log("MCP handshake smoke gecti: initialize + tools/list + tools/call");
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
main().catch((error) => { console.error(`MCP handshake smoke basarisiz: ${error.message}`); process.exitCode = 1; });
