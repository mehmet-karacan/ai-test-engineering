import { describe, it, expect } from "vitest";
import { ToolRegistry, coveragePercent, assertTargetBasisPoints } from "../../src/mcp/tool-registry.js";
import { z } from "zod";

describe("ToolRegistry", () => {
  it("kayitli arac listelenmeli ve cagrilmali", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "sample_tool",
      description: "test araci",
      inputSchema: z.object({ value: z.number() }),
      readOnly: true,
      idempotent: true,
      handler: async (input) => ({ doubled: (input as { value: number }).value * 2 }),
    });
    expect(registry.list()).toHaveLength(1);
    const result = await registry.call("sample_tool", { value: 21 }, { requestId: "req-1", services: {} });
    expect(result.status).toBe("ok");
    expect(result.data).toEqual({ doubled: 42 });
  });

  it("bilinmeyen arac hata donmeli", async () => {
    const registry = new ToolRegistry();
    const result = await registry.call("yok", {}, { requestId: "req-2", services: {} });
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("INVALID_PARAMETERS");
  });

  it("schema ihlali INVALID_PARAMETERS donmeli", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "strict_tool",
      description: "test",
      inputSchema: z.object({ required_field: z.string() }),
      readOnly: false,
      idempotent: false,
      handler: async () => ({}),
    });
    const result = await registry.call("strict_tool", {}, { requestId: "req-3", services: {} });
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("INVALID_PARAMETERS");
  });

  it("handler hatasi AppError koduyla donmeli", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "failing_tool",
      description: "test",
      inputSchema: z.object({}),
      readOnly: false,
      idempotent: false,
      handler: async () => {
        throw Object.assign(new Error("policy"), { code: "POLICY_VIOLATION" });
      },
    });
    const result = await registry.call("failing_tool", {}, { requestId: "req-4", services: {} });
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("INTERNAL_ERROR");
  });
});

describe("coverage hesabi", () => {
  it("%90 hedef basis point hesabi dogru olmali", () => {
    expect(coveragePercent({ covered: 90, missed: 10 })).toEqual({ percent: 90, basisPoints: 9000 });
  });

  it("%89.96 sonucu rounded %90 gibi gorunse de bps 8996 olmali", () => {
    const r = coveragePercent({ covered: 8996, missed: 1004 });
    expect(r.basisPoints).toBe(8996);
    expect(r.percent).toBe(89.96);
  });

  it("toplam 0 oldugunda hata donmeli", () => {
    expect(() => coveragePercent({ covered: 0, missed: 0 })).toThrow();
  });

  it("hedef basis point dogrulamasi", () => {
    expect(assertTargetBasisPoints(90)).toBe(9000);
    expect(assertTargetBasisPoints(100)).toBe(10000);
    expect(assertTargetBasisPoints(0)).toBe(0);
    expect(() => assertTargetBasisPoints(101)).toThrow();
    expect(() => assertTargetBasisPoints(-1)).toThrow();
  });
});
