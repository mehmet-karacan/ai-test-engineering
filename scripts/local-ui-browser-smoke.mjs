/** Synthetic workflow acceptance: real browser + HTTP, no customer Maven/model calls. */
/* global document, innerWidth */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createLocalUiServer } from "../dist/ui/server.js";

const packages = process.env.AITEST_BROWSER_PACKAGES;
if (!packages) throw new Error("AITEST_BROWSER_PACKAGES must identify Playwright node_modules");
const { chromium } = createRequire(import.meta.url)(join(packages, "playwright"));
const output = process.env.AITEST_LOCAL_UI_OUTPUT ? resolve(process.env.AITEST_LOCAL_UI_OUTPUT) : mkdtempSync(join(tmpdir(), "local-ui-browser-"));
mkdirSync(output, { recursive: true });
const scanId = "11111111-1111-4111-8111-111111111111", testId = "22222222-2222-4222-8222-222222222222";
const root = "C:/fixtures/Orion", calls = [], errors = [], external = [];
let testPoll = 0, pendingScan = null, releaseScan = null;
const line = { covered: 35, missed: 65, percent: 35 }, branch = { covered: 2, missed: 8, percent: 20 };
const candidate = { fqn: "com.example.PaymentService", module_path: "payment", line, branch, suitable: true, reasons: [] };
const scan = { job_id: scanId, project_root: root, overall: { line, branch }, class_count: 42, recommendations: [candidate, { ...candidate, fqn: `com.example.${"LongClassName".repeat(35)}.<img src=x onerror=alert(1)>` }], unmeasured: { source_classes: 0, report_classes: 0 } };
const history = Array.from({ length: 12 }, (_, i) => ({ id: i === 0 ? testId : scanId, project_root: root, lifecycle: i === 0 ? "COMPLETED" : "WAITING_INPUT", created_at: Date.now() - i * 1000 }));
const backend = {
  bootstrap: async () => ({ projects: [{ project_root: root }], worker_enabled: true, model: "fixture/model" }),
  history: async q => { const offset = Number(q.get("offset") || 0); return { jobs: history.slice(offset, offset + 10), has_more: offset + 10 < history.length }; },
  scan: async input => { calls.push(["scan", input]); if (pendingScan) await pendingScan; return { job_id: scanId, project_root: root }; },
  start: async input => { calls.push(["start", input]); return { job_id: testId }; },
  job: async id => { const isTest = id === testId; if (isTest) testPoll++; const done = isTest && testPoll > 1;
    return { project_root: root, status: { lifecycle: isTest ? done ? "COMPLETED" : "RUNNING" : "WAITING_INPUT", phase: isTest ? "verification" : "analysis", outcome: isTest ? done ? "TARGET_REACHED" : null : "COVERAGE_ANALYZED", events: [{ sequence: 1, event_type: isTest ? "candidate_accepted" : "coverage_proposals_ready", phase: "analysis" }] },
      result: isTest ? { report_facts: done ? { run_summary: { total: 8, passed: 8, failed: 0, skipped: 0 } } : null, report_url: done ? `/reports/${testId}/index.html` : null, patch_url: done ? `/reports/${testId}/evidence/changes.patch` : null } : { coverage_scan: scan },
      measurements: done ? [{ fqn: candidate.fqn, stage: "before", line, branch }, { fqn: candidate.fqn, stage: "after", line: { covered: 90, missed: 10, percent: 90 }, branch: { covered: 8, missed: 2, percent: 80 } }] : [], measurements_truncated: false };
  },
  reportFile: async (_id, name) => ({ bytes: Buffer.from(name.endsWith("patch") ? "diff fixture" : "<!doctype html><html lang=tr><title>Rapor</title><body><h1>Doğrulanmış fixture raporu</h1></body></html>"), contentType: name.endsWith("patch") ? "text/plain" : "text/html" }),
};
const server = createLocalUiServer(backend); await new Promise(r => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1060 } }); const page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => { errors.push("unexpected dialog"); void d.dismiss(); });
  page.on("request", req => { if (!req.url().startsWith(url)) external.push(req.url()); });
  await page.goto(url); await page.locator("#history table").waitFor();
  await page.screenshot({ path: join(output, "empty-desktop.png"), fullPage: true });
  await page.locator("#project").fill(root); await page.locator("#analyze").click(); await page.locator('input[name="candidate"]').first().waitFor();
  assert.equal(calls.filter(c => c[0] === "start").length, 0);
  assert.equal(await page.locator("#candidates img").count(), 0);
  await page.screenshot({ path: join(output, "selection-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: join(output, "selection-mobile.png"), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1060 });
  await page.locator('input[name="candidate"]').first().focus(); await page.keyboard.press("Space"); assert.equal(await page.locator('input[name="candidate"]').first().isChecked(), true);
  await page.locator("#line").focus(); await page.keyboard.press("Tab"); assert.equal(await page.locator("#branch").evaluate(node => node === document.activeElement), true);
  await page.locator("#line").fill("80.01"); await page.locator("#branch").fill("70.01"); await page.locator("#start").click();
  await page.waitForFunction(() => document.querySelector("#live").textContent === "Tamamlandı");
  const start = calls.find(c => c[0] === "start")[1]; assert.equal(start.line_percent, 80.01); assert.equal(start.branch_percent, 70.01); assert.equal(start.selector, candidate.fqn); assert.equal(start.coverage_scan_id, scanId);
  assert.equal(await page.locator("#chart svg").count(), 1); assert.match(await page.locator("#test-summary").innerText(), /8\/8/);
  const reportTabPromise = context.waitForEvent("page"); await page.getByRole("link", { name: "Raporu aç", exact: true }).click(); const reportTab = await reportTabPromise; await reportTab.waitForLoadState(); assert.match(await reportTab.locator("h1").innerText(), /fixture/); await reportTab.close();
  await page.reload(); await page.waitForFunction(() => document.querySelector("#job-id").textContent.includes("22222222"));
  await page.locator("#history-next").click(); await page.waitForFunction(() => document.querySelector("#history-page").textContent === "Sayfa 2"); assert.equal(await page.locator("#history td button").count(), 2);
  await page.locator("#history-prev").click(); await page.waitForFunction(() => document.querySelector("#history-page").textContent === "Sayfa 1");
  await page.screenshot({ path: join(output, "result-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: join(output, "result-mobile.png"), fullPage: true });
  // Delayed old scan response must not overwrite a newly entered project.
  pendingScan = new Promise(r => { releaseScan = r; });
  await page.locator("#project").fill(root); await page.locator("#analyze").click(); await page.waitForFunction(() => document.querySelector("#analyze").disabled);
  await page.locator("#project").fill("C:/fixtures/NewProject"); releaseScan(); await page.waitForTimeout(250);
  assert.equal(await page.locator("#project").inputValue(), "C:/fixtures/NewProject"); assert.equal(await page.locator("#start-form").isHidden(), true);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  const result = { workflow: "PASS", refresh: "PASS", race: "PASS", desktop_mobile: "PASS", xss: "PASS", errors, external_requests: external, calls: calls.length };
  writeFileSync(join(output, "result.json"), JSON.stringify(result, null, 2)); process.stdout.write(JSON.stringify(result) + "\n");
} finally { await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
