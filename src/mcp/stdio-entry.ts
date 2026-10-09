/**
 * stdio entrypoint: MCP protokolu STDOUT'u kullanir; loglar STDERR'de.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server-setup.js";
import { createServices } from "../application/services.js";
import { Storage } from "../storage/storage.js";
import { JobRepository } from "../storage/job-repository.js";
import { ArtifactStore } from "../storage/artifact-store.js";

async function main(): Promise<void> {
  const configPath = process.env["AITEST_CONFIG"];
  const services = createServices(configPath);
  const dbPathOverride = process.env["AITEST_DB_PATH"];
  if (dbPathOverride && dbPathOverride.length > 0) {
    const storage = new Storage({ dbPath: dbPathOverride });
    storage.migrate();
    services.storage = storage;
    services.jobs = new JobRepository(storage.db);
    services.artifacts = new ArtifactStore({ root: services.config.storage.root });
  }
  const server = createMcpServer(services);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[aitest-mcp] stdio transport baglandi\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`[aitest-mcp] baslatma hatasi: ${String(error)}\n`);
  process.exit(1);
});
