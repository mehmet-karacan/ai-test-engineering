/**
 * MCP tool registry: tek typed registry, v1/v2 adapter ayni handler'lari kullanir.
 * Handler'lar application service cagrilari yapar; is mantigi transport'tan bagimsizdir.
 */
import { z } from "zod";
import { percentToBasisPoints } from "../domain/tool-schemas.js";
import { AppError } from "../domain/errors.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  readOnly: boolean;
  idempotent: boolean;
  handler: (input: unknown, context: ToolContext) => Promise<Record<string, unknown>>;
}

export interface ToolContext {
  requestId: string;
  services: ServiceRegistry;
}

export interface ServiceRegistry {
  [key: string]: unknown;
}

export interface ToolResult {
  schema_version: 1;
  request_id: string;
  status: "ok" | "error";
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown> | undefined;
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new AppError("INTERNAL_ERROR", `Arac zaten kayitli: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): Array<{ name: string; description: string; readOnly: boolean; idempotent: boolean }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      readOnly: tool.readOnly,
      idempotent: tool.idempotent,
    }));
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  async call(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        schema_version: 1,
        request_id: context.requestId,
        status: "error",
        error: { code: "INVALID_PARAMETERS", message: `Bilinmeyen arac: ${name}` },
      };
    }
    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        schema_version: 1,
        request_id: context.requestId,
        status: "error",
        error: {
          code: "INVALID_PARAMETERS",
          message: "Giris parametreleri schema dogrulamasi basarisiz",
          details: { issues: parsed.error.issues },
        },
      };
    }
    try {
      const data = await tool.handler(parsed.data, context);
      return {
        schema_version: 1,
        request_id: context.requestId,
        status: "ok",
        data,
      };
    } catch (error) {
      if (error instanceof AppError) {
        return {
          schema_version: 1,
          request_id: context.requestId,
          status: "error",
          error: { code: error.code, message: error.message, details: error.details },
        };
      }
      return {
        schema_version: 1,
        request_id: context.requestId,
        status: "error",
        error: { code: "INTERNAL_ERROR", message: `Beklenmeyen hata: ${String(error)}` },
      };
    }
  }
}

export function coveragePercent(data: { covered: number; missed: number }): { percent: number; basisPoints: number } {
  const n = data.covered + data.missed;
  if (n <= 0) {
    throw new AppError("INVALID_PARAMETERS", "Coverage sayaclari toplami 0 olamaz");
  }
  const basisPoints = Math.floor((data.covered * 10000) / n);
  return { percent: basisPoints / 100, basisPoints };
}

export function assertTargetBasisPoints(percent: number): number {
  const bps = percentToBasisPoints(percent);
  if (bps < 0 || bps > 10000) {
    throw new AppError("INVALID_PARAMETERS", `Hedef yuzde 0-100 araliginda olmali: ${percent}`);
  }
  return bps;
}
