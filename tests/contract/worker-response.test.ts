/**
 * D04/F07/RG24: Worker yanit sozlesmesi regresyon testleri.
 * 204 No Content, ic ice info/parts, unified text birlestirme.
 */
import { describe, it, expect } from "vitest";
import { OpenCodeWorkerClient, promptForJson } from "../../src/workers/opencode/worker-client.js";
import { extractJsonCandidate } from "../../src/workers/opencode/model-schemas.js";
import { createServer, type Server } from "node:http";
import { once } from "node:events";

function startTestServer(handler: (req, res) => void): Promise<{ server: Server; port: number }> {
  return new Promise((resolvePromise) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolvePromise({ server, port });
    });
  });
}

describe("D04/F07/RG24: 204 No Content", () => {
  it("session olusturma yaniti gelmezse bounded timeout uygulamali", async () => {
    const { server, port } = await startTestServer((req) => {
      if (req.method === "POST" && req.url?.includes("/session")) {
        return;
      }
    });
    try {
      const client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}` });
      await expect(client.createSession(undefined, 25)).rejects.toMatchObject({ outcome_kind: "REQUEST_TIMEOUT" });
    } finally {
      server.close();
    }
  }, 15000);

  it("prompt_async 204 dondururse JSON parse hatasi OLMAMALI", async () => {
    const { server, port } = await startTestServer((req, res) => {
      if (req.method === "POST" && req.url?.includes("/prompt_async")) {
        res.writeHead(204);
        res.end();
      } else if (req.url?.includes("/global/health")) {
        res.writeHead(200);
        res.end("ok");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      const client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}` });
      const result = await client.promptAsync({
        session_id: "ses_test",
        parts: [{ type: "text", text: "selam" }],
      });
      expect(result.message_id).toBeNull();
    } finally {
      server.close();
    }
  }, 15000);

  it("listMessages 204 dondururse bos array donmeli", async () => {
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/message")) {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      const client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}` });
      const messages = await client.listMessages("ses_test");
      expect(messages).toEqual([]);
    } finally {
      server.close();
    }
  }, 15000);

  it("listMessages bos body dondururse bos array donmeli", async () => {
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/message")) {
        res.writeHead(200);
        res.end("");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      const client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}` });
      const messages = await client.listMessages("ses_test");
      expect(messages).toEqual([]);
    } finally {
      server.close();
    }
  }, 15000);
});
describe("D04/F04: ic ice info/parts response", () => {
  it("waitForCompletion role/completed alanlarini INFO nesnesinde aramali (dis nesnede degil)", async () => {
    const messages = [
      {
        info: { id: "msg_1", role: "user", sessionID: "ses_test" },
        parts: [{ type: "text", text: "selam" }],
      },
      {
        info: { id: "msg_2", role: "assistant", sessionID: "ses_test", completed: true, tokens: { input: 10, output: 20 } },
        parts: [{ type: "text", text: "plan:" }, { type: "text", text: '{"schema_version":1}' }],
      },
    ];
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/session/ses_test/message")) {
        res.writeHead(200);
        res.end(JSON.stringify(messages));
      } else if (req.url?.includes("/prompt_async")) {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      const client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}` });
      const result = await client.waitForCompletion("ses_test", { timeout_ms: 8000, poll_interval_ms: 300 });
      expect(result.aborted).toBe(false);
      expect(result.message_id).toBe("msg_2");
      // parcalar birlestirilmeli (yalniz son parcasi degil):
      expect(result.text).toContain("plan:");
      expect(result.text).toContain('{"schema_version":1}');
      expect(result.usage.input_tokens).toBe(10);
    } finally {
      server.close();
    }
  }, 20000);
});

describe("D04/F09/RG30: tautoloji acigi", () => {
  it("extractJsonCandidate assertTrue(true) icinde JSON bulmaz", () => {
    expect(() => extractJsonCandidate("assertTrue(true)")).toThrow();
  });
});

describe("WN73/mcp95z: v2 (/api) promptAsync body sozlesmesi", () => {
  it("v2 yolu schema-uyumlu body gonderir: tools/system tasmaz; text+model tasir", async () => {
    let captured: Record<string, unknown> | null = null;
    let capturedPath = "";
    const { server, port } = await startTestServer((req, res) => {
      if (req.method === "POST" && req.url?.includes("/session/ses_wn73/prompt")) {
        capturedPath = req.url;
        let raw = "";
        req.on("data", (chunk) => {
          raw += String(chunk);
        });
        req.on("end", () => {
          captured = JSON.parse(raw) as Record<string, unknown>;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ data: { id: "msg_wn73" } }));
        });
        return;
      }
      res.writeHead(200);
      res.end("ok");
    });
    try {
      const client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}`, api_prefix: "/api" });
      const accepted = await client.promptAsync({
        session_id: "ses_wn73",
        parts: [{ type: "text", text: "yalniz JSON don" }],
        model: { providerID: "litellm", modelID: "GLM-5.3-Flash-IT" },
        // arac kisiti v2 body ile tasinamaz (schema additionalProperties:false);
        // bilerek gonderilmez — sunucu tarafinda worker config tools/permissions kilidiyle uygulanir
        tools: { bash: false, read: false },
        system: "test",
      });
      expect(accepted.accepted).toBe(true);
      expect(accepted.message_id).toBe("msg_wn73");
      expect(capturedPath).toContain("/api/session/ses_wn73/prompt");
      expect(captured).not.toBeNull();
      expect(captured!["text"]).toContain("yalniz JSON don");
      expect(captured!["model"]).toEqual({ providerID: "litellm", modelID: "GLM-5.3-Flash-IT" });
      // schema additionalProperties:false: tools/system body'de YOK (fail-closed: sunucu config kilidi)
      expect(captured!["tools"]).toBeUndefined();
      expect(captured!["system"]).toBeUndefined();
    } finally {
      server.close();
    }
  }, 15000);

  it("v2 yolu no_reply=true icin resume:false gonderir (agent loop calismaz)", async () => {
    let captured: Record<string, unknown> | null = null;
    const { server, port } = await startTestServer((req, res) => {
      if (req.method === "POST" && req.url?.includes("/prompt")) {
        let raw = "";
        req.on("data", (chunk) => {
          raw += String(chunk);
        });
        req.on("end", () => {
          captured = JSON.parse(raw) as Record<string, unknown>;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ data: { id: "msg_r" } }));
        });
        return;
      }
      res.writeHead(200);
      res.end("ok");
    });
    try {
      const client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}`, api_prefix: "/api" });
      await client.promptAsync({
        session_id: "ses_wn73",
        parts: [{ type: "text", text: "ping" }],
        no_reply: true,
      });
      expect(captured!["resume"]).toBe(false);
    } finally {
      server.close();
    }
  }, 15000);
});
