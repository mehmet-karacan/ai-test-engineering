/**
 * AC03: Yeni MCP protokol profili - v1/v2 profil ayrimi contract testleri.
 * Ayni tool registry; profil muzakeresi kontrolsuz melez protokol olusturmaz.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MCP_PROFILES, resolveProfile, negotiateProfile } from "../../src/mcp/profile-schemas.js";
import { createV2ProfileServer } from "../../src/mcp/v2-profile.js";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("MCP profil semalari", () => {
  it("v1 ve v2 profilleri tanimli olmali; protocol_version ayri olmali", () => {
    expect(MCP_PROFILES["v1"].protocol_version).toBe("2025-11-25");
    expect(MCP_PROFILES["v2"].protocol_version).toBe("2026-07-28");
    expect(MCP_PROFILES["v1"].version).toBe("v1");
    expect(MCP_PROFILES["v2"].version).toBe("v2");
  });

  it("resolveProfile varsayilan v1 donmeli", () => {
    expect(resolveProfile(undefined).version).toBe("v1");
    expect(resolveProfile("").version).toBe("v1");
  });

  it("resolveProfile bilinmeyen profilde hata vermeli", () => {
    expect(() => resolveProfile("v99")).toThrow();
  });

  it("negotiateProfile v2 destekli istemcide v2 donmeli", () => {
    const result = negotiateProfile(["v1", "v2"]);
    expect(result.served).toBe("v2");
    expect(result.protocol_version).toBe("2026-07-28");
  });

  it("negotiateProfile sadece v1 destekli istemcide v1 donmeli (v2 istenirse de)", () => {
    const result = negotiateProfile(["v1"], "v2");
    expect(result.served).toBe("v1");
    expect(result.protocol_version).toBe("2025-11-25");
  });

  it("negotiateProfile kontrolsuz melez protokol olusturmaz: served her zaman bilinen profil", () => {
    for (const supported of [["v1"], ["v1", "v2"], ["v2"], []]) {
      const result = negotiateProfile(supported);
      expect(["v1", "v2"]).toContain(result.served);
    }
  });
});

describe("v2 profil server kurulumu", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-v2-"));
  });

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("v2 profil icin ayri server instance uretmeli; ayni tool setiyle", () => {
    const services = createDefaultServicesForTest(join(dir, "state.db"), join(dir, "artifacts"));
    const result = createV2ProfileServer(services, "v2");
    expect(result.profile_version).toBe("v2");
    expect(result.protocol_version).toBe("2026-07-28");
    expect(result.tools.sort()).toEqual(["project_inspect", "project_query", "test_apply", "test_cancel", "test_result", "test_resume", "test_start", "test_status"]);
    services.storage?.close();
  });

  it("varsayilan v1 ile ayni tool registry kullanimi (tutarlilik)", () => {
    const servicesV2 = createDefaultServicesForTest(join(dir, "state-v2.db"), join(dir, "artifacts-v2"));
    const v2 = createV2ProfileServer(servicesV2, "v2");
    const servicesV1 = createDefaultServicesForTest(join(dir, "state-v1.db"), join(dir, "artifacts-v1"));
    const v1 = createV2ProfileServer(servicesV1, "v1");
    expect(v2.tools).toEqual(v1.tools);
    expect(v2.profile_version).toBe("v2");
    expect(v1.profile_version).toBe("v1");
    servicesV2.storage?.close();
    servicesV1.storage?.close();
  });
});
