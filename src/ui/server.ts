import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { localUiPage, localUiCss } from "./page.js";
import { localUiClient } from "./client.js";

export interface UiFile { bytes: Buffer; contentType: string; policy?: string }
export interface UiBackend {
  bootstrap(): Promise<unknown>;
  history(query: URLSearchParams): Promise<unknown>;
  scan(input: unknown): Promise<unknown>;
  start(input: unknown): Promise<unknown>;
  job(id: string, query: URLSearchParams): Promise<unknown>;
  reportFile(id: string, name: string): Promise<UiFile>;
}
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Only the entry point binds this server, explicitly to 127.0.0.1. No tool/file proxy. */
export function createLocalUiServer(backend: UiBackend) {
  const session = randomBytes(32).toString("hex");
  const csrf = randomBytes(32).toString("hex");
  const cookieName = `aitest_${randomBytes(6).toString("hex")}`;
  const server = createServer((req, res) => { void route(req, res).catch(error => {
    if (res.headersSent) { res.destroy(); return; }
    const status = error instanceof HttpError ? error.status : 400;
    const message = error instanceof Error ? error.message : "İstek tamamlanamadı";
    json(res, status, { error: message });
  }); });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  function json(res: ServerResponse, status: number, value: unknown) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value));
  }
  async function body(req: IncomingMessage) {
    if (!req.headers["content-type"]?.startsWith("application/json")) throw new HttpError(415, "JSON isteği gerekli");
    let size = 0; const chunks: Buffer[] = [];
    for await (const data of req) { const bytes = Buffer.from(data as Uint8Array); size += bytes.length;
      if (size > 65536) throw new HttpError(413, "İstek çok büyük"); chunks.push(bytes); }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
    catch { throw new HttpError(400, "Geçersiz JSON"); }
  }
  async function route(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer"); res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const address = server.address();
    if (!address || typeof address === "string") throw new HttpError(503, "Sunucu hazır değil");
    const host = `127.0.0.1:${address.port}`;
    if (req.headers.host !== host) throw new HttpError(403, "Geçersiz yerel sunucu adresi");
    const origin = `http://${host}`;
    if ((req.headers.origin && req.headers.origin !== origin) || req.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "Yalnız yerel ekran üzerinden kullanılabilir");
    const url = new URL(req.url ?? "/", origin);
    if (url.origin !== origin) throw new HttpError(403, "Geçersiz adres");
    const method = req.method ?? "GET";
    if (method === "GET" && url.pathname === "/") {
      res.setHeader("Set-Cookie", `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/`);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(localUiPage); return;
    }
    if (method === "GET" && ["/ui.css", "/ui.js"].includes(url.pathname)) {
      res.writeHead(200, { "Content-Type": url.pathname.endsWith("css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8" });
      res.end(url.pathname.endsWith("css") ? localUiCss : `(${localUiClient.toString()})();`); return;
    }
    const supplied = (req.headers.cookie ?? "").split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? "";
    // Bootstrap sets the cookie for non-browser clients too; it discloses no data cross-origin.
    if (method === "GET" && url.pathname === "/api/bootstrap") {
      res.setHeader("Set-Cookie", `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/`);
      json(res, 200, { ...await backend.bootstrap() as object, csrf }); return;
    }
    if (!same(supplied, session)) throw new HttpError(403, "Oturum yenilenmeli; ekranı yeniden açın");
    if (method !== "GET") {
      if (req.headers.origin !== origin || !same(String(req.headers["x-ui-csrf"] ?? ""), csrf)) throw new HttpError(403, "İstek doğrulanamadı; ekranı yenileyin");
      if (method !== "POST") throw new HttpError(405, "Desteklenmeyen yöntem");
      if (url.pathname === "/api/scan") { json(res, 200, await backend.scan(await body(req))); return; }
      if (url.pathname === "/api/start") { json(res, 200, await backend.start(await body(req))); return; }
      throw new HttpError(404, "İşlem bulunamadı");
    }
    if (url.pathname === "/api/history") { json(res, 200, await backend.history(url.searchParams)); return; }
    const job = /^\/api\/jobs\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (job) { json(res, 200, await backend.job(job[1]!, url.searchParams)); return; }
    const report = /^\/reports\/([0-9a-f-]{36})\/(.+)$/.exec(url.pathname);
    if (report) {
      const file = await backend.reportFile(report[1]!, report[2]!);
      res.setHeader("Content-Security-Policy", file.policy ?? "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
      res.writeHead(200, { "Content-Type": file.contentType }); res.end(file.bytes); return;
    }
    throw new HttpError(404, "Sayfa bulunamadı");
  }
  return server;
}
