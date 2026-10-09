/**
 * v2 profil handler: resmi yeni lifecycle'a gore tool call akisi.
 * v1 API isimleriyle karismaz; ayni tool registry'yi kullanir.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveProfile, type McpProfileVersion } from "./profile-schemas.js";
import type { Services } from "../application/services.js";
import { createToolRegistry } from "./server-setup.js";

export interface V2ProfileServerResult {
  server: McpServer;
  profile_version: McpProfileVersion;
  protocol_version: string;
  tools: string[];
}

/**
 * v2 profili icin ayri server kurulumu: ayni tool registry, v2 lifecycle.
 * v1 handler'dan ayri instance; API isimleri karismaz.
 */
export function createV2ProfileServer(services: Services, requestedVersion?: string): V2ProfileServerResult {
  const profile = resolveProfile(requestedVersion ?? "v2");
  const registry = createToolRegistry(services);
  const server = new McpServer(
    { name: "ai-test-engineering", version: "0.1.0" },
    {
      instructions: `AI test muhendisligi (profil ${profile.version}, protokol ${profile.protocol_version}): yalniz test calisir, production degismez.`,
    },
  );
  const toolNames = registry.list().map((t) => t.name);
  return {
    server,
    profile_version: profile.version,
    protocol_version: profile.protocol_version,
    tools: toolNames,
  };
}
