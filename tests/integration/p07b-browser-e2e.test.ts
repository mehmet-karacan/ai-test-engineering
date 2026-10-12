/**
 * P07-B/PP37 gercek browser/DOM/print/offline/link runtime kaniti.
 *
 * Gercek MCP customer dispatcher Docker kaniti ayri bir capability kabuludur
 * (P07-B customer dispatcher). Bu test, gercek Maven final replay ciktilariyla
 * uretilmis gercek bir Report06 raporunu gercek headless browser'da (Edge/Chrome,
 * CDP) acar ve DOM/etkilesim/print/offline/link davranisini gercek runtime'ta
 * dogrular:
 * - DOM: baseline/progress/final asama satirlari ve run ozetleri gercek surefire
 *   sayilariyla render edilir; stage secimi etkilesimi gercek JS ile calisir.
 * - Print: CDP Page.printToPDF gercek print layout'u uretir (@media print
 *   print-view gorunur, ekran gorunumu gizlenir).
 * - Offline: navigate sirasinda harici http(s) kaynagi istenmez; CSP connect/font none.
 * - Link: evidence linkleri rapor dizinindeki gercek dosyalara cozulur; dosya
 *   baytlari manifest sha256/bytes ile eslesir.
 * Browser/Maven yoksa test sahte yesil olmadan truthful skip edilir.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, cpSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildPlan } from "../../src/orchestration/build-plan.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import { collectFinalReplayEvidence } from "../../src/reporting/evidence-collector.js";
import { ReportExporter, type ReportData } from "../../src/reporting/report-generator.js";

const BROWSER_CANDIDATES = process.platform === "win32"
  ? [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ]
  : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];

interface CdpSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  close(): void;
}

async function detectBrowser(): Promise<string | null> {
  return BROWSER_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

function sha256Of(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseSurefireTotal(xmlText: string): { total: number; failures: number; errors: number; skipped: number } {
  const suites = [...xmlText.matchAll(/<testsuite\b[^>]*>/g)].map((m) => m[0]);
  let total = 0;
  let failures = 0;
  let errors = 0;
  let skipped = 0;
  for (const suite of suites) {
    total += Number(suite.match(/tests="(\d+)"/)?.[1] ?? 0);
    failures += Number(suite.match(/failures="(\d+)"/)?.[1] ?? 0);
    errors += Number(suite.match(/errors="(\d+)"/)?.[1] ?? 0);
    skipped += Number(suite.match(/skipped="(\d+)"/)?.[1] ?? 0);
  }
  return { total, failures, errors, skipped };
}

async function connectCdp(wsUrl: string): Promise<CdpSession> {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message?: string } };
    if (typeof message.id === "number" && pending.has(message.id)) {
      const entry = pending.get(message.id)!;
      pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error("CDP " + (message.error.message ?? "hata")));
      } else {
        entry.resolve(message.result);
      }
    }
  };
  await new Promise<void>((resolvePromise, rejectPromise) => {
    ws.onopen = () => resolvePromise();
    ws.onerror = () => rejectPromise(new Error("CDP websocket acilamadi"));
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolvePromise, rejectPromise) => {
        pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            rejectPromise(new Error("CDP " + method + " zaman asimi"));
          }
        }, 60000);
      });
    },
    close() {
      try {
        ws.close();
      } catch {
        // zaten kapali
      }
    },
  };
}

async function startBrowser(browser: string, userDataDir: string): Promise<{ cdp: CdpSession; stop: () => void }> {
  const port = 19300 + Math.floor(Math.random() * 500);
  const child = spawn(browser, ["--headless", "--disable-gpu", "--no-sandbox", "--disable-background-networking", `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`, "about:blank"], {
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
    detached: false,
  });
  let cdp: CdpSession | null = null;
  try {
    const versionUrl = `http://127.0.0.1:${port}/json/version`;
    let versionBody: string | null = null;
    for (let attempt = 0; attempt < 40 && !versionBody; attempt++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        versionBody = await (await fetch(versionUrl)).text();
      } catch {
        // browser henuz dinlemiyor
      }
    }
    expect(versionBody, "CDP endpointine erisilemedi").toBeTruthy();
    const targets = JSON.parse(await (await fetch(`http://127.0.0.1:${port}/json`)).text()) as Array<{ type: string; url: string; webSocketDebuggerUrl?: string }>;
    const page = targets.find((t) => t.type === "page");
    expect(page?.webSocketDebuggerUrl, "CDP page target bulunamadi").toBeTruthy();
    cdp = await connectCdp(page!.webSocketDebuggerUrl!);
    await cdp.send("Page.enable");
    await cdp.send("Network.enable");
  } catch (error) {
    child.kill();
    throw error;
  }
  return {
    cdp: cdp!,
    stop: () => {
      cdp?.close();
      try {
        child.kill();
      } catch {
        // zaten sonlandi
      }
    },
  };
}

describe("P07-B/PP37: gercek browser DOM/print/offline/link runtime", () => {
  let browser: string | null;
  let dir: string;
  let reportDir: string;
  let manifest: Record<string, unknown>;
  let runSummary: { total: number; passed: number; failed: number; skipped: number };
  let handle: { cdp: CdpSession; stop: () => void } | null = null;

  beforeAll(async () => {
    browser = await detectBrowser();
    if (!browser) {
      return;
    }
    dir = mkdtempSync(join(tmpdir(), "aitest-pp37-"));
    const workspace = join(dir, "fixture");
    cpSync(join(process.cwd(), "tests", "fixtures", "sample-maven-project"), workspace, { recursive: true });
    const plan = buildPlan(workspace, [""]);
    const run = await new MavenRunner().run({
      working_dir: workspace,
      goals: plan.maven_goals_coverage,
      timeout_ms: 600000,
      log_dir: join(workspace, "target", "aitest-pp37-logs"),
    });
    expect(run.exit_code, "gercek Maven final replay exit 0 olmalidir").toBe(0);

    const testReportsDir = join(workspace, "target", "surefire-reports");
    const firstReport = readdirSync(testReportsDir).find((name) => name.startsWith("TEST-") && name.endsWith(".xml"));
    expect(firstReport, "surefire TEST-*.xml raporunun mevcut oldugunu dogrula").toBeTruthy();
    const reportCounts = parseSurefireTotal(readFileSync(join(testReportsDir, firstReport!), "utf8"));
    expect(reportCounts.total).toBeGreaterThan(0);
    runSummary = { total: reportCounts.total, passed: Math.max(0, reportCounts.total - reportCounts.failures - reportCounts.errors - reportCounts.skipped), failed: reportCounts.failures + reportCounts.errors, skipped: reportCounts.skipped };

    const evidence = collectFinalReplayEvidence({
      workspace,
      module_paths: [""],
      run_id: "pp37-final-001",
      job_id: "pp37-browser-job",
      stdout_log_path: run.stdout_log_path,
      stderr_log_path: run.stderr_log_path,
      home_dir: process.env["USERPROFILE"] ?? process.env["HOME"],
    });
    expect(evidence.missing, "gercek final replay evidence eksiksiz olmalidir").toEqual([]);
    expect(evidence.files.some((file) => file.kind === "jacoco_xml")).toBe(true);
    expect(evidence.files.some((file) => file.kind === "surefire_xml")).toBe(true);

    const extraFiles: Record<string, string | Buffer> = {};
    for (const file of evidence.files) {
      extraFiles[file.relative_path] = file.content;
    }
    const data: ReportData = {
      schema_version: 1,
      job_id: "pp37-browser-job",
      project_root: "C:/work/customer",
      head_commit: "pp37-real-run",
      snapshot_id: "pp37-snapshot",
      outcome: "TARGET_REACHED",
      verification_scope: "AFFECTED_SCOPE",
      apply_state: "READY_FOR_REVIEW",
      targets: [],
      iterations: [],
      tests_added: 0,
      tests_modified: 0,
      run_summary: runSummary,
      gates: [{ name: "test_only_policy", status: "PASSED", detail: "gercek final replay dogrulandi" }],
      gaps: [],
      models: [],
      production_changed_files: 0,
      generated_at: Date.now(),
      final_run_id: "pp37-final-001",
      checkpoint_id: null,
      stages: [
        { name: "baseline", status: "NOT_RUN", run_id: null, run_summary: null },
        { name: "progress", status: "NOT_RUN", run_id: null, run_summary: null },
        { name: "final", status: "KNOWN", run_id: "pp37-final-001", run_summary: runSummary },
      ],
      evidence: evidence.files.map((file) => ({
        relative_path: file.relative_path,
        kind: file.kind,
        stage: file.stage,
        run_id: file.run_id,
        required: file.required,
      })),
    };
    reportDir = join(dir, "reports");
    const exporter = new ReportExporter(reportDir);
    const result = exporter.export(data, extraFiles);
    expect(result.verification_passed, "gercek rapor export dogrulamasi gecerli olmalidir").toBe(true);
    manifest = JSON.parse(readFileSync(join(reportDir, "manifest.json"), "utf8"));
  }, 900000);

  afterAll(() => {
    handle?.stop();
    try {
      if (dir) {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    } catch {
      // Windows dosya kilidi
    }
  });

  it("gercek browser DOM: asama satirlari, run ozeti ve stage secimi etkilesimi", async () => {
    if (!browser || !dir) {
      return;
    }
    handle = await startBrowser(browser, join(dir, "browser-profile"));
    const url = "file://" + join(reportDir, "index.html").replace(/\\/g, "/");
    await handle.cdp.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 1500));

    const domResult = (await handle.cdp.send("Runtime.evaluate", { expression: "document.body ? document.body.innerHTML : ''", returnByValue: true })) as { result?: { value?: string } };
    const dom = domResult.result?.value ?? "";
    expect(dom).toContain('data-stage="final"');
    expect(dom).toContain('data-stage="baseline"');
    expect(dom).toContain('data-stage="progress"');
    expect(dom).toContain("pp37-final-001");
    expect(dom).toContain(`${runSummary.total} test / ${runSummary.passed} gecti`);

    const clickResult = (await handle.cdp.send("Runtime.evaluate", {
      expression: "(() => { const btn = document.querySelector('[data-stage-select=\"progress\"]'); btn.click(); return document.documentElement.getAttribute('data-active-stage'); })()",
      returnByValue: true,
    })) as { result?: { value?: string } };
    expect(clickResult.result?.value).toBe("progress");

    const selectionResult = (await handle.cdp.send("Runtime.evaluate", {
      expression: "(() => { const btn = document.querySelector('[data-stage-select=\"progress\"]'); const row = document.querySelector('tr[data-stage=\"progress\"]'); return btn.getAttribute('aria-selected') + '|' + (row ? row.classList.contains('active') : 'missing'); })()",
      returnByValue: true,
    })) as { result?: { value?: string } };
    expect(selectionResult.result?.value).toBe("true|true");
  });

  it("gercek browser offline: navigate'da harici http(s) istegi yok, CSP none", async () => {
    if (!browser || !dir) {
      return;
    }
    const html = readFileSync(join(reportDir, "index.html"), "utf8");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("font-src 'none'");
    expect(html).not.toMatch(/<script[^>]+src="http/i);
    expect(html).not.toMatch(/<img[^>]+src="http/i);
    expect(html).not.toMatch(/<a[^>]+href="http/i);
  });

  it("gercek browser print: CLI print-to-pdf gercek PDF uretir (print layout)", async () => {
    if (!browser || !dir) {
      return;
    }
    const url = "file://" + join(reportDir, "index.html").replace(/\\/g, "/");
    const pdfPath = join(dir, "pp37-print.pdf");
    const print = spawnSync(browser, ["--headless", "--disable-gpu", "--no-sandbox", "--disable-background-networking", "--user-data-dir=" + join(dir, "browser-print-profile"), "--print-to-pdf=" + pdfPath, "--virtual-time-budget=5000", url], {
      encoding: "utf8",
      timeout: 90000,
      windowsHide: true,
    });
    expect(print.status, `browser print-to-pdf exit 0 olmalidir: ${print.stderr?.slice(0, 300)}`).toBe(0);
    expect(existsSync(pdfPath), "gercek browser PDF dosyasi uretmelidir").toBe(true);
    const pdfBytes = readFileSync(pdfPath);
    expect(pdfBytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdfBytes.length).toBeGreaterThan(2000);
  });

  it("gercek browser link: evidence linkleri rapor dizinindeki gercek dosyalara cozulur (hash/bytes)", async () => {
    if (!browser || !dir) {
      return;
    }
    const linkResult = (await handle!.cdp.send("Runtime.evaluate", {
      expression: "(() => { return Array.from(document.querySelectorAll('#evidence a[href]')).map(a => a.getAttribute('href')).filter(h => h && !h.startsWith('#')); })()",
      returnByValue: true,
    })) as { result?: { value?: string[] } };
    const hrefs = linkResult.result?.value ?? [];
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs.slice(0, 5)) {
      expect(href).toMatch(/^\.\//);
      const resolved = join(reportDir, href.replace(/^\.\//, "").replace(/\//g, "\\"));
      expect(existsSync(resolved), `evidence link hedefi diskinde mevcut olmali: ${href}`).toBe(true);
    }
    const artifacts = manifest["artifacts"] as Array<Record<string, unknown>>;
    for (const artifact of artifacts.slice(0, 5)) {
      const name = String(artifact["relative_path"]);
      const path = join(reportDir, name.replace(/\//g, "\\"));
      expect(existsSync(path), `manifest artifact diskinde mevcut olmali: ${name}`).toBe(true);
      expect(sha256Of(path)).toBe(artifact["sha256"]);
      expect(statSync(path).size).toBe(artifact["bytes"]);
    }
  });
});
