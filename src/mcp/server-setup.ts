/**
 * MCP server kurulumu: tek tool registry, resmi SDK McpServer uzerinden v1 uyumlu profil.
 * Server her tool'u registry'den typed olarak kaydeder.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { ToolRegistry, type ToolContext, type ServiceRegistry } from "./tool-registry.js";
import { handleProjectInspect, handleTestStart, handleTestStatus, handleProjectQuery, type Services } from "../application/services.js";
import { ProjectInspectInputSchema, TestStartInputSchema, TestStatusInputSchema, ProjectQueryInputSchema } from "../domain/tool-schemas.js";

type AnySchemaCompat = AnySchema;

export function createToolRegistry(services: Services): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register({
    name: "project_inspect",
    description: "Yetkili Java projesini tanir, envanter ozeti ve preflight durumu verir; test veya production degistirmez.",
    inputSchema: ProjectInspectInputSchema,
    readOnly: true,
    idempotent: true,
    handler: async (input) => {
      return (await handleProjectInspect(input, services)) as unknown as Record<string, unknown>;
    },
  });

  registry.register({
    name: "test_start",
    description: "Dogrulanmis parametrelerle tek kalici test job baslatir; kisa surede job handle doner.",
    inputSchema: TestStartInputSchema,
    readOnly: false,
    idempotent: true,
    handler: async (input) => {
      return (await handleTestStart(input, services)) as unknown as Record<string, unknown>;
    },
  });

  registry.register({
    name: "test_status",
    description: "Job durumu, aktif asama, son dogrulanmis olcum ve gereken eylemi verir.",
    inputSchema: TestStatusInputSchema,
    readOnly: true,
    idempotent: true,
    handler: async (input) => {
      return (await handleTestStatus(input, services)) as unknown as Record<string, unknown>;
    },
  });

  registry.register({
    name: "project_query",
    description: "Projeler, moduller, paketler, siniflar, testler ve is gecmisi icin sinirli sorgu; serbest SQL kabul etmez.",
    inputSchema: ProjectQueryInputSchema,
    readOnly: true,
    idempotent: true,
    handler: async (input) => {
      return (await handleProjectQuery(input, services)) as unknown as Record<string, unknown>;
    },
  });

  return registry;
}

export function registerToolsOnServer(server: McpServer, registry: ToolRegistry): void {
  const serviceRegistry: ServiceRegistry = {};
  for (const tool of registry.list()) {
    const definition = registry.get(tool.name)!;
    const zodShape = definition.inputSchema as unknown as AnySchemaCompat;
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: zodShape,
        annotations: {
          readOnlyHint: tool.readOnly,
          idempotentHint: tool.idempotent,
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>, extra: { requestId: string | number | undefined }) => {
        const context: ToolContext = {
          requestId: extra.requestId !== undefined ? String(extra.requestId) : crypto.randomUUID(),
          services: serviceRegistry,
        };
        const result = await registry.call(tool.name, args, context);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result),
            },
          ],
        };
      },
    );
  }
}

export function createMcpServer(services: Services): McpServer {
  const server = new McpServer(
    { name: "ai-test-engineering", version: "0.1.0" },
    { instructions: "AI test muhendisligi: yalniz test calisir, production degismez." },
  );
  const registry = createToolRegistry(services);
  registerToolsOnServer(server, registry);
  return server;
}
