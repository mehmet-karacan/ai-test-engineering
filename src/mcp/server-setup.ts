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
import { ProjectCoverageInputSchema } from "../domain/tool-schemas.js";
import { handleProjectCoverage } from "../application/project-coverage.js";

type AnySchemaCompat = AnySchema;

export function createToolRegistry(services: Services): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({
    name: "project_coverage",
    description: "Hedef sinif istemeden tum Maven projesinin mevcut testlerini ayri kopyada JaCoCo ile calistirir. job_id ile test_status/test_result kullan. Dusuk coverage'li uygun siniflari kullaniciya onerir; kullanici secmeden test uretmez. Secimden sonra test_start'a coverage_scan_id ve tam sinif adi ver.",
    inputSchema: ProjectCoverageInputSchema,
    readOnly: false,
    idempotent: true,
    handler: async (input) => (await handleProjectCoverage(input, services)) as unknown as Record<string, unknown>,
  });

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
    description: "Kullanici sinif sectikten sonra tek kalici test job baslatir. Genel coverage onerisi icin once project_coverage, sonra test_result kullan; secilen tek FQN ve coverage_scan_id gonder. Kisa surede job handle doner.",
    inputSchema: TestStartInputSchema,
    readOnly: false,
    idempotent: true,
    handler: async (input) => {
      return (await handleTestStart(input, services)) as unknown as Record<string, unknown>;
    },
  });

  registry.register({
    name: "test_status",
    description: "Job durumu, kayitli proje/hedef/checkpoint ve lease durumunu verir. Repo degisince project_root ile job_id baglamini dogrula. Sohbet yanitini durdurmak MCP isi icin pause degildir; once gercek durumu kontrol et.",
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
    description: "Checkpoint/source/lease dogrulayarak ayni isi kalan butceyle surdurur. project_root ile baglami dogrula; coklu is varsa job_id sec. Iptal/bitmis is yeniden baslamaz; kaynak/hedef/model degisirse yeni analiz/is gerekir. Aktif lease varken ikinci resume baslatma.",
    inputSchema: TestResumeInputSchema,
    readOnly: false,
    idempotent: true,
    handler: async (input) => {
      return (await handleTestResume(input, services)) as unknown as Record<string, unknown>;
    },
  });

  registry.register({
    name: "test_cancel",
    description: "project_root ile dogru isi kontrol edip reason=pause ile duraklatir, reason=cancel ile iptal eder. Artifact'ler korunur. cleanup_pending varsa process temizligi dogrulanmamistir; aninda yeni is baslatma.",
    inputSchema: TestCancelInputSchema,
    readOnly: false,
    idempotent: true,
    handler: async (input) => {
      return (await handleTestCancel(input, services)) as unknown as Record<string, unknown>;
    },
  });

  registry.register({
    name: "test_result",
    description: "DB/artifact registry'den gercek sonuc, job_context ve gereken eylemi verir. Yeni sohbet/repo icin project_root gonder; eski job ile yeni repo karismaz. Yeni test kosmaz; basari veya apply durumu varsayma.",
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
    { instructions: `AI test muhendisligi (profil ${profileVersion ?? "v1"}): MCP isi TEST_ONLY'dir, production degismez. Ana sohbet modeli kullanici niyetini yorumlayabilir, inceleyebilir ve secenek sunabilir. job_context ve required_action kanitlarini kullan; repo degisince acik proje/job baglamini dogrula. Sohbeti durdurmak pause degildir; durum sorgula ve istenirse test_cancel(reason=pause) cagir. Kaynak/hedef/model degisince eski ise sessizce katma; uygun yeni analiz/is yolunu acikla.` },
  );
  const registry = createToolRegistry(services);
  registerToolsOnServer(server, registry);
  return server;
}
