/**
 * MCP server kurulumu: tek tool registry, resmi SDK McpServer uzerinden v1 uyumlu profil.
 * Server her tool'u registry'den typed olarak kaydeder.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { ToolRegistry, type ToolContext, type ServiceRegistry } from "./tool-registry.js";
import { handleProjectInspect, handleTestStart, handleTestStatus, handleProjectQuery, type Services } from "../application/services.js";
import { handleTestResume, handleTestCancel, handleTestResult, handleTestApply } from "../application/job-tools.js";
import { ProjectInspectInputSchema, TestStartInputSchema, TestStatusInputSchema, ProjectQueryInputSchema, TestResumeInputSchema, TestCancelInputSchema, TestResultInputSchema, TestApplyInputSchema } from "../domain/tool-schemas.js";

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

  registry.register({
    name: "test_resume",
    description: "Checkpoint/source/lease dogrulayarak mevcut isi surdurur; yeni job gibi davranmaz.",
    inputSchema: TestResumeInputSchema,
    readOnly: false,
    idempotent: true,
    handler: async (input) => {
      return (await handleTestResume(input, services)) as unknown as Record<string, unknown>;
    },
  });

  registry.register({
    name: "test_cancel",
    description: "Process tree'yi guvenle durdurur; artifact'leri silmez. Pause/devam edilebilir iptal ayrimi sonuc alaninda aciktir.",
    inputSchema: TestCancelInputSchema,
    readOnly: false,
    idempotent: true,
    handler: async (input) => {
      return (await handleTestCancel(input, services)) as unknown as Record<string, unknown>;
    },
  });

  registry.register({
    name: "test_result",
    description: "DB ve artifact registry'den raporu dondurur; keyfi path okuma ya da yeni test kosma yapmaz.",
    inputSchema: TestResultInputSchema,
    readOnly: true,
    idempotent: true,
    handler: async (input) => {
      return (await handleTestResult(input, services)) as unknown as Record<string, unknown>;
    },
  });

  registry.register({
    name: "test_apply",
    description: "Sadece acik onayli test degisikliklerini uygular. Guvenilir onay yoksa patch-only sonuc doner.",
    inputSchema: TestApplyInputSchema,
    readOnly: false,
    idempotent: true,
    handler: async (input) => {
      return (await handleTestApply(input, services)) as unknown as Record<string, unknown>;
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

export function createMcpServer(services: Services, profileVersion?: string): McpServer {
  const server = new McpServer(
    { name: "ai-test-engineering", version: "0.1.0" },
    { instructions: `AI test muhendisligi (profil ${profileVersion ?? "v1"}): yalniz test calisir, production degismez.` },
  );
  const registry = createToolRegistry(services);
  registerToolsOnServer(server, registry);
  return server;
}
