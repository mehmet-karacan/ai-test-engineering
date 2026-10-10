/**
 * stdio entrypoint: MCP protokolu STDOUT'u kullanir; loglar STDERR'de.
 * Profil (AITEST_PROFILE: v1/v2) kurulumun sectigi server konfigurasyonundan gelir;
 * varsayilan v1 (OpenCode-uyumlu eski handshake).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server-setup.js";
import { createServices } from "../application/services.js";
import { Storage } from "../storage/storage.js";
import { JobRepository } from "../storage/job-repository.js";
import { ArtifactStore } from "../storage/artifact-store.js";
import { resolveProfile } from "./profile-schemas.js";

async function main(): Promise<void> {
  const configPath = process.env["AITEST_CONFIG"];
  const services = createServices(configPath);
  const dbPath = process.env["AITEST_DB_PATH"] && process.env["AITEST_DB_PATH"].length > 0
    ? process.env["AITEST_DB_PATH"]
    : `${services.config.storage.root}\\state.db`;
  const storage = new Storage({ dbPath });
  storage.migrate();
  services.storage = storage;
  services.jobs = new JobRepository(storage.db);
  services.artifacts = new ArtifactStore({ root: services.config.storage.root });
  const profile = resolveProfile(process.env["AITEST_PROFILE"]);
  const server = createMcpServer(services, profile.version);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[aitest-mcp] stdio transport baglandi (profil ${profile.version}, protokol ${profile.protocol_version})\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`[aitest-mcp] baslatma hatasi: ${String(error)}\n`);
  process.exit(1);
});
