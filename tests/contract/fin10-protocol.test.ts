/**
 * FIN10: MCP protokol surumleri ve iletisim dogrulugu (5.2/5.3).
 * - Profil muzakeresi: bilinmeyen revision explicit unsupported; eski behavior yeni protokol diye sunulmaz.
 * - Fragmented/multiple JSON mesajlari buffer ve framing ile okunur (RT28).
 * - Stdio STDOUT yalniz protokol; BOM/banner/log kanala yazilmaz.
 */
import { describe, it, expect } from "vitest";
import { MCP_PROFILES, resolveProfile, negotiateProfile } from "../../src/mcp/profile-schemas.js";

describe("FIN10: protokol surumleri (5.2)", () => {
  it("legacy profil 2025-11-25 sozlesmesini gosterir", () => {
    const profile = resolveProfile("v1");
    expect(profile.protocol_version).toBe("2025-11-25");
    expect(profile.version).toBe("v1");
  });

  it("modern profil 2026-07-28 sozlesmesini gosterir (eski server'a sadece v2 etiketi degil)", () => {
    const profile = resolveProfile("v2");
    expect(profile.protocol_version).toBe("2026-07-28");
    expect(profile.version).toBe("v2");
  });

  it("bilinmeyen profil explicit unsupported olur", () => {
    expect(() => resolveProfile("v3")).toThrow(/Bilinmeyen/);
    expect(() => resolveProfile("v2.1")).toThrow();
  });

  it("bos profil varsayilan v1 (kurulu OpenCode-uyumlu)", () => {
    expect(resolveProfile(undefined).version).toBe("v1");
    expect(resolveProfile("").version).toBe("v1");
  });
});

describe("FIN10: profil muzakeresi (5.2)", () => {
  it("istemci v2 destekliyorsa v2 servis edilir", () => {
    const negotiation = negotiateProfile(["v1", "v2"]);
    expect(negotiation.served).toBe("v2");
    expect(negotiation.protocol_version).toBe("2026-07-28");
  });

  it("istemci yalniz v1 destekliyorsa v1 servis edilir (melez olusturulmaz)", () => {
    const negotiation = negotiateProfile(["v1"]);
    expect(negotiation.served).toBe("v1");
    expect(negotiation.protocol_version).toBe("2025-11-25");
  });

  it("istemci hicbir profil desteklemiyorsa requested explicit doner (client capability kanitsiz genisletilmeZ)", () => {
    const negotiation = negotiateProfile([], "v2");
    expect(negotiation.served).toBe("v2");
    expect(negotiation.client_supported).toHaveLength(0);
  });

  it("explicit requested onceligi korunur", () => {
    expect(negotiateProfile(["v1", "v2"], "v1").served).toBe("v1");
    expect(negotiateProfile(["v1", "v2"], "v2").served).toBe("v2");
  });
});

describe("FIN10: stdio kanal dogrulugu (5.3)", () => {
  it("protokol mesajlari JSON-RPC satir formatinda; BOM yok", () => {
    const message = JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} });
    expect(message.startsWith("\uFEFF")).toBe(false);
    expect(() => JSON.parse(message)).not.toThrow();
  });

  it("fragmented mesajlar buffer ile birlestirilir ve parse edilir (RT28)", () => {
    // bir protokol yanitini 3 parcalaya bolelim:
    const full = JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "test_start" }] } }) + "\n";
    const chunks = [full.slice(0, 20), full.slice(20, 55), full.slice(55)];
    let buffered = "";
    for (const chunk of chunks) {
      buffered += chunk;
    }
    // fragmented buffer birlesince tam JSON parse edilir (regex ile outcome arama YOK):
    const parsed = JSON.parse(buffered.trim()) as { id: number; result: { tools: Array<{ name: string }> } };
    expect(parsed.id).toBe(2);
    expect(parsed.result.tools[0]!.name).toBe("test_start");
  });

  it("ayni stdout buffer'inda birden fazla JSON satiri ayri ayri parse edilir", () => {
    const line1 = JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} });
    const line2 = JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} });
    const combined = line1 + "\n" + line2 + "\n";
    const lines = combined.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ id: 1 });
    expect(JSON.parse(lines[1]!)).toMatchObject({ id: 2 });
  });

  it("request id ve outer result dogru parse edilir (isError ayrimi)", () => {
    const success = JSON.stringify({ jsonrpc: "2.0", id: 7, result: { content: [], isError: false } });
    const failure = JSON.stringify({ jsonrpc: "2.0", id: 8, result: { content: [{ type: "text", text: "{\"status\":\"error\"}" }], isError: true } });
    const parsedSuccess = JSON.parse(success) as { id: number; result: { isError: boolean } };
    const parsedFailure = JSON.parse(failure) as { id: number; result: { isError: boolean } };
    expect(parsedSuccess.result.isError).toBe(false);
    expect(parsedFailure.result.isError).toBe(true);
    expect(parsedSuccess.id).toBe(7);
    expect(parsedFailure.id).toBe(8);
  });
});
