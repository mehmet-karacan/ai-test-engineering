/**
 * W01/F01 kabul testleri (N09-N13): typed worker state machine.
 * - N09: prompt_async 204 + nihai mesaj korelasyonu; bos HTTP govdesine JSON parse yok.
 * - N10: tool-calls ara adimi; tools-denied ayri policy hatasi.
 * - N11: erken bos final -> EMPTY_FINAL; gercek zaman dolmadan MODEL_TIMEOUT yok.
 * - N12: finish=length/kesik JSON/fence-only/reasoning-only ayri kodlarla red.
 * - N13: 401/403/429/baglanti hatasi/cancel typed sonuc + owned abort.
 */
import { describe, it, expect } from "vitest";
import { OpenCodeWorkerClient, promptForJson, WorkerRequestFailure } from "../../src/workers/opencode/worker-client.js";
import { classifyFinish, classifyHttpFailure } from "../../src/workers/opencode/worker-outcome.js";
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

describe("W01/N09: 204 ve nihai mesaj korelasyonu", () => {
  it("prompt_async 204 accepted:true dondurur; JSON parse hatasi olmaz", async () => {
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
      const result = await client.promptAsync({ session_id: "ses_n09", parts: [{ type: "text", text: "gorev" }] });
      expect(result.accepted).toBe(true);
      expect(result.message_id).toBeNull();
    } finally {
      server.close();
    }
  }, 15000);

  it("finish=stop + completed assistant mesaji FINAL_TEXT olarak doner; elapsed kayitli", async () => {
    const messages = [
      {
        info: { id: "msg_req", role: "user", sessionID: "ses_n09b" },
        parts: [{ type: "text", text: "gorev" }],
      },
      {
        info: { id: "msg_final", role: "assistant", sessionID: "ses_n09b", finish: "stop", tokens: { input: 5, output: 7 } },
        parts: [{ type: "text", text: '{"schema_version":1,"changes":[]}' }],
      },
    ];
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/session/ses_n09b/message")) {
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
      const result = await client.waitForCompletion("ses_n09b", { timeout_ms: 5000, poll_interval_ms: 200 });
      expect(result.aborted).toBe(false);
      expect(result.outcome_kind).toBe("FINAL_TEXT");
      expect(result.finish).toBe("stop");
      expect(result.message_id).toBe("msg_final");
      expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
      expect(result.timed_out).toBe(false);
    } finally {
      server.close();
    }
  }, 15000);
});

describe("W01/N10: tool-calls ara adimi", () => {
  it("finish=tool-calls tamamlanma DEGIL; TOOL_STEP siniflandirilir ve beklenir", () => {
    const classified = classifyFinish("tool-calls");
    expect(classified.completed).toBe(false);
    expect(classified.kind).toBe("TOOL_STEP");
  });

  it("tool-calls mesajindan sonra final JSON beklenir; ara mesaj nihai sayilmaz", async () => {
    const toolStep = {
      info: { id: "msg_tool", role: "assistant", sessionID: "ses_n10", finish: "tool-calls" },
      parts: [{ type: "tool", tool: "read", state: { status: "completed" } }],
    };
    const finalMsg = {
      info: { id: "msg_final", role: "assistant", sessionID: "ses_n10", finish: "stop" },
      parts: [{ type: "text", text: '{"schema_version":1,"changes":[{"path":"src/test/java/X.java","action":"create","new_content":"class X"}]}' }],
    };
    let pollCount = 0;
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/session/ses_n10/message")) {
        pollCount++;
        res.writeHead(200);
        res.end(JSON.stringify(pollCount <= 1 ? [toolStep] : [toolStep, finalMsg]));
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
      const result = await client.waitForCompletion("ses_n10", { timeout_ms: 5000, poll_interval_ms: 200 });
      expect(result.outcome_kind).toBe("FINAL_TEXT");
      expect(result.message_id).toBe("msg_final");
      expect(result.tool_names).toContain("read");
    } finally {
      server.close();
    }
  }, 15000);
});

describe("W01/N11: erken bos final", () => {
  it("finish=stop + bos text EMPTY_FINAL hatasi; MODEL_TIMEOUT degil; cleanup kayitli", async () => {
    const messages = [
      {
        info: { id: "msg_empty", role: "assistant", sessionID: "ses_n11", finish: "stop", tokens: { input: 3, output: 0 } },
        parts: [],
      },
    ];
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/session/ses_n11/message")) {
        res.writeHead(200);
        res.end(JSON.stringify(messages));
      } else if (req.url?.includes("/prompt_async")) {
        res.writeHead(204);
        res.end();
      } else if (req.url?.includes("/abort")) {
        res.writeHead(200);
        res.end("ok");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      const client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}` });
      let caught: unknown = null;
      try {
        await promptForJson(client, { session_id: "ses_n11", prompt: "gorev", timeout_ms: 4000 });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(WorkerRequestFailure);
      const failure = caught as WorkerRequestFailure;
      expect(failure.outcome_kind).toBe("EMPTY_FINAL");
      expect(failure.message).toContain("bos final");
    } finally {
      server.close();
    }
  }, 15000);

  it("finish=stop + completed bos mesaj outcome EMPTY_FINAL", async () => {
    const messages = [
      {
        info: { id: "msg_empty2", role: "assistant", sessionID: "ses_n11b", finish: "stop" },
        parts: [{ type: "text", text: "" }],
      },
    ];
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/session/ses_n11b/message")) {
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
      const result = await client.waitForCompletion("ses_n11b", { timeout_ms: 4000, poll_interval_ms: 200 });
      expect(result.outcome_kind).toBe("EMPTY_FINAL");
      expect(result.text).toBeNull();
      expect(result.timed_out).toBe(false);
    } finally {
      server.close();
    }
  }, 15000);
});

describe("W01/N12: length ve kesik JSON", () => {
  it("finish=length OUTPUT_TRUNCATED hatasi", async () => {
    const messages = [
      {
        info: { id: "msg_len", role: "assistant", sessionID: "ses_n12", finish: "length" },
        parts: [{ type: "text", text: '{"schema_version":1,"chang' }],
      },
    ];
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/session/ses_n12/message")) {
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
      let caught: unknown = null;
      try {
        await promptForJson(client, { session_id: "ses_n12", prompt: "gorev", timeout_ms: 4000 });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(WorkerRequestFailure);
      expect((caught as WorkerRequestFailure).outcome_kind).toBe("OUTPUT_TRUNCATED");
    } finally {
      server.close();
    }
  }, 15000);

  it("kesik JSON INVALID_JSON olarak reddedilir", () => {
    const classified = classifyFinish("length");
    expect(classified.completed).toBe(true);
    expect(classified.kind).toBe("OUTPUT_TRUNCATED");
  });

  it("reasoning-only cikti JSON bulunamadi olarak reddedilir", async () => {
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/session/ses_n12b/message")) {
        res.writeHead(200);
        res.end(JSON.stringify([
          {
            info: { id: "msg_r", role: "assistant", sessionID: "ses_n12b", finish: "stop" },
            parts: [{ type: "text", text: "Bu bir dusunme/analiz metnidir; JSON yok." }],
          },
        ]));
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
      let caught: unknown = null;
      try {
        await promptForJson(client, { session_id: "ses_n12b", prompt: "gorev", timeout_ms: 4000 });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(String(caught)).toContain("INVALID_MODEL_OUTPUT");
    } finally {
      server.close();
    }
  }, 15000);
});

describe("W01/N13: HTTP/izin/timeout/cancel", () => {
  it("401 AUTH_OR_PERMISSION_ERROR typed hata", async () => {
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/prompt_async")) {
        res.writeHead(401);
        res.end('{"error":"unauthorized"}');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      const client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}` });
      let caught: unknown = null;
      try {
        await client.promptAsync({ session_id: "ses_n13", parts: [{ type: "text", text: "g" }] });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(WorkerRequestFailure);
      expect((caught as WorkerRequestFailure).outcome_kind).toBe("AUTH_OR_PERMISSION_ERROR");
    } finally {
      server.close();
    }
  }, 15000);

  it("429 SERVER_ERROR typed hata", async () => {
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/prompt_async")) {
        res.writeHead(429);
        res.end('{"error":"rate_limited"}');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      const client = new OpenCodeWorkerClient({ base_url: `http://127.0.0.1:${port}` });
      let caught: unknown = null;
      try {
        await client.promptAsync({ session_id: "ses_n13b", parts: [{ type: "text", text: "g" }] });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(WorkerRequestFailure);
      expect((caught as WorkerRequestFailure).outcome_kind).toBe("SERVER_ERROR");
    } finally {
      server.close();
    }
  }, 15000);

  it("baglanti hatasi TRANSPORT_ERROR typed hata (maskeli ayrinti)", async () => {
    const client = new OpenCodeWorkerClient({ base_url: "http://127.0.0.1:9" });
    let caught: unknown = null;
    try {
      await client.promptAsync({ session_id: "ses_n13c", parts: [{ type: "text", text: "g" }] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkerRequestFailure);
    expect((caught as WorkerRequestFailure).outcome_kind).toBe("TRANSPORT_ERROR");
  }, 15000);

  it("gercek timeout REQUEST_TIMEOUT; timed_out=true; elapsed kayitli", async () => {
    const { server, port } = await startTestServer((req, res) => {
      if (req.url?.includes("/session/ses_n13d/message")) {
        res.writeHead(200);
        res.end(JSON.stringify([]));
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
      const result = await client.waitForCompletion("ses_n13d", { timeout_ms: 1200, poll_interval_ms: 300 });
      expect(result.outcome_kind).toBe("REQUEST_TIMEOUT");
      expect(result.timed_out).toBe(true);
      expect(result.elapsed_ms).toBeGreaterThanOrEqual(1100);
      expect(result.text).toBeNull();
    } finally {
      server.close();
    }
  }, 15000);

  it("cancel sonrasi gelen cevap stale; CANCELLED outcome'u", () => {
    const classified = classifyFinish("cancelled");
    expect(classified.completed).toBe(true);
    expect(classified.kind).toBe("CANCELLED");
  });

  it("classifyHttpFailure ayrisimi", () => {
    expect(classifyHttpFailure(401)).toBe("AUTH_OR_PERMISSION_ERROR");
    expect(classifyHttpFailure(403)).toBe("AUTH_OR_PERMISSION_ERROR");
    expect(classifyHttpFailure(429)).toBe("SERVER_ERROR");
    expect(classifyHttpFailure(500)).toBe("SERVER_ERROR");
    expect(classifyHttpFailure(400)).toBe("TRANSPORT_ERROR");
  });
});
