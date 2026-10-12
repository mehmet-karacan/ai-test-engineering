/**
 * Report06 facts-only renderer.
 *
 * The approved reference file is intentionally never edited. Its inline style
 * and logo are loaded only after an exact byte/hash check; the report body is
 * rendered from the persisted ReportData so the reference's design fixture
 * cannot leak into a production report.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../domain/errors.js";
import type { ReportData, ReportEvidence, ReportStage } from "./report-generator.js";

const REFERENCE_BYTES = 257845;
const REFERENCE_SHA256 = "e3c8fd2da77000a0fd39ed88a00b3159e1100e4cf35146b0bbb83969eaef8c80";
const REFERENCE_NAME = "innova_test_raporu_tasarim_06.html";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function referencePath(): string {
  const candidates = [
    resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/reporting/reference", REFERENCE_NAME),
    resolve(process.cwd(), "docs/reporting/reference", REFERENCE_NAME),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    throw new AppError("STORAGE_ERROR", "Report06 referans sablonu bulunamadi", { reason_code: "REPORT06_REFERENCE_MISSING" });
  }
  return path;
}

function approvedReference(): { style: string; logo: string } {
  const path = referencePath();
  const bytes = readFileSync(path);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== REFERENCE_BYTES || hash !== REFERENCE_SHA256) {
    throw new AppError("STORAGE_ERROR", "Report06 referans sablonu degismis", {
      reason_code: "REPORT06_REFERENCE_HASH_MISMATCH",
      expected_bytes: REFERENCE_BYTES,
      actual_bytes: bytes.byteLength,
      expected_sha256: REFERENCE_SHA256,
      actual_sha256: hash,
    });
  }
  const source = bytes.toString("utf8");
  const style = source.match(/<style>([\s\S]*?)<\/style>/i)?.[1];
  const logo = source.match(/const LOGO\s*=\s*'([^']+)'/)?.[1];
  if (!style || !logo) {
    throw new AppError("STORAGE_ERROR", "Report06 referans sablonu eksik inline kaynak tasiyor", { reason_code: "REPORT06_REFERENCE_INVALID" });
  }
  return { style, logo };
}

function stateLabel(status: ReportStage["status"]): string {
  switch (status) {
    case "KNOWN":
      return "Kayitli";
    case "NOT_RUN":
      return "Calistirilmadi";
    case "INVALID":
      return "Gecersiz";
    default:
      return "Veri yok";
  }
}

function countText(summary: ReportStage["run_summary"]): string {
  if (!summary) {
    return "Veri yok";
  }
  return `${summary.total} test / ${summary.passed} gecti / ${summary.failed} basarisiz / ${summary.skipped} atlandi`;
}

function outcomeClass(outcome: string): string {
  if (outcome === "TARGET_REACHED" || outcome === "TARGET_ALREADY_MET") {
    return "good";
  }
  if (outcome.includes("FAILED") || outcome.includes("INVALID") || outcome.includes("BLOCKED")) {
    return "bad";
  }
  return "warn";
}

function evidenceHref(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes(":") || normalized.split("/").some((part) => part === ".." || part === "." || part.length === 0)) {
    return "#evidence";
  }
  return `./${normalized}`;
}

function evidenceRows(entries: ReportEvidence[]): string {
  if (entries.length === 0) {
    return `<tr><td colspan="5">Kanit export edilmedi.</td></tr>`;
  }
  return entries.map((entry) => {
    const exists = entry.sha256 !== null && entry.sha256 !== undefined && entry.bytes !== null && entry.bytes !== undefined;
    const status = exists ? "Kayitli" : "Eksik";
    const kind = entry.kind;
    const link = exists ? `<a href="${esc(evidenceHref(entry.relative_path))}">${esc(entry.relative_path)}</a>` : esc(entry.relative_path);
    return `<tr><td>${link}</td><td>${esc(kind)}</td><td>${esc(entry.run_id ?? "Veri yok")}</td><td>${exists ? String(entry.bytes) : "Veri yok"}</td><td><span class="pill ${exists ? "good" : "bad"}">${status}</span></td></tr>`;
  }).join("");
}

function stageRows(stages: ReportStage[]): string {
  return stages.map((stage) => `<tr data-stage="${esc(stage.name)}"><td>${esc(stage.name)}</td><td>${esc(stateLabel(stage.status))}</td><td>${esc(stage.run_id ?? "Veri yok")}</td><td>${esc(countText(stage.run_summary))}</td></tr>`).join("");
}

function targetRows(data: ReportData): string {
  if (data.targets.length === 0) {
    return `<tr><td colspan="4">Secili hedef kaydi yok.</td></tr>`;
  }
  return data.targets.map((target) => {
    const line = target.line ? `${target.line.covered}/${target.line.total} (${(target.line.bps / 100).toFixed(2)}%)` : "Veri yok";
    const branch = target.branch ? `${target.branch.covered}/${target.branch.total} (${(target.branch.bps / 100).toFixed(2)}%)` : "Veri yok";
    return `<tr><td>${esc(target.selector)}</td><td class="mono">${esc(target.fqn)}</td><td>${esc(line)}</td><td>${esc(branch)}</td></tr>`;
  }).join("");
}

function iterationRows(data: ReportData): string {
  if (data.iterations.length === 0) {
    return `<tr><td colspan="5">Iterasyon kaydi yok.</td></tr>`;
  }
  return data.iterations.map((iteration) => `<tr><td>${iteration.ordinal}</td><td>${esc(iteration.strategy)}</td><td>${esc(iteration.decision)}</td><td>${esc(iteration.reason)}</td><td>${iteration.coverage_after_bps === null ? "Veri yok" : `${(iteration.coverage_after_bps / 100).toFixed(2)}%`}</td></tr>`).join("");
}

function gateRows(data: ReportData): string {
  if (data.gates.length === 0) {
    return `<tr><td colspan="3">Kontrol kaydi yok.</td></tr>`;
  }
  return data.gates.map((gate) => `<tr><td>${esc(gate.name)}</td><td><span class="pill ${gate.status === "PASSED" ? "good" : gate.status === "FAILED" ? "bad" : "warn"}">${esc(gate.status)}</span></td><td>${esc(gate.detail)}</td></tr>`).join("");
}

function gapRows(data: ReportData): string {
  if (data.gaps.length === 0) {
    return `<tr><td colspan="3">Kayitli gap yok.</td></tr>`;
  }
  return data.gaps.map((gap) => `<tr><td>${esc(gap.gap_key)}</td><td>${esc(gap.blocker)}</td><td>${esc(gap.attempted.join("; "))}</td></tr>`).join("");
}

function modelRows(data: ReportData): string {
  if (data.models.length === 0) {
    return `<tr><td colspan="3">Model metadata kaydi yok.</td></tr>`;
  }
  return data.models.map((model) => `<tr><td>${esc(model.role)}</td><td>${esc(model.provider)}</td><td>${esc(model.model ?? "Veri yok")}</td></tr>`).join("");
}

function printRows(data: ReportData): string {
  return data.stages?.map((stage) => `<section class="print-class"><h3>${esc(stage.name)}</h3><p>${esc(stateLabel(stage.status))} · ${esc(countText(stage.run_summary))}</p></section>`).join("") ?? "";
}

/** Render a real ReportData snapshot using the approved Report06 visual language. */
export function buildReport06(data: ReportData): string {
  const reference = approvedReference();
  const stages = data.stages && data.stages.length > 0
    ? data.stages
    : [{ name: "final" as const, status: "KNOWN" as const, run_id: data.final_run_id ?? null, run_summary: data.run_summary }];
  const payload = JSON.stringify({
    schemaVersion: "report06-facts-only",
    reportRevision: 6,
    jobId: data.job_id,
    source: { projectRoot: data.project_root, headCommit: data.head_commit, snapshotId: data.snapshot_id },
    stages,
    runSummary: data.run_summary,
    targets: data.targets,
    evidence: data.evidence ?? [],
  }).replace(/</g, "\\u003c");
  const finalStatus = outcomeClass(data.outcome);
  const title = `Test ve Coverage Kayitlari - ${data.job_id}`;
  return `<!DOCTYPE html>
<html lang="tr" data-report-revision="06" data-report-template="report06">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="description" content="Test kosu, coverage sayaçlari ve sabit kontrol kayitlari.">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'">
<title>${esc(title)}</title>
<style>${reference.style}
.report06-stage-table,.report06-table{width:100%;border-collapse:collapse}.report06-stage-table th,.report06-stage-table td,.report06-table th,.report06-table td{padding:10px 14px;border-bottom:1px solid var(--line2);text-align:left;font-size:11px}.report06-stage-table th,.report06-table th{background:#f9fafc;color:var(--muted)}.report06-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.report06-card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:16px}.report06-card strong{font-size:24px}.report06-card span{display:block;color:var(--muted);font-size:10px;margin-top:4px}.report06-status{display:inline-flex;align-items:center;border-radius:5px;padding:3px 7px;font-size:10px;font-weight:600}.report06-status.good{background:var(--good-bg);color:var(--good)}.report06-status.warn{background:var(--warn-bg);color:var(--warn)}.report06-status.bad{background:var(--bad-bg);color:var(--bad)}.report06-stage-table tr[data-stage].active{background:#f1f5f8}.report06-evidence-note{font-size:10px;color:var(--muted);margin-top:10px}.print-view{display:none}@media print{body{background:#fff}.layout{padding:0}.report{box-shadow:none;border:0}.nav,.header-actions,.phase-switch,.previewbar{display:none!important}.content{padding:0;background:#fff}.print-view{display:block}.report06-screen{display:none!important}}
</style>
</head>
<body>
<a class="skip-link" href="#overview">Icerige gec</a>
<div class="layout">
  <div class="previewbar"><div class="preview-id">AI TEST ENGINEERING <span class="rev">REVIZYON 06</span></div><div>FACTS-ONLY · OFFLINE RAPOR</div></div>
  <div class="report">
    <header class="brandbar"><div class="brand"><img class="brand-logo" src="${reference.logo}" width="157" height="30" alt="Innova"><span class="brand-sep" aria-hidden="true"></span><div><div class="product">AI Test Engineering</div><div class="product-sub">TEST VE COVERAGE KAYITLARI</div></div></div><div class="header-actions"><button class="button dark" type="button" data-action="print">Yazdir</button><a class="button" href="#evidence">Kanita git</a></div></header>
    <section class="hero"><div class="eyebrow">GERCEK RAPOR <span class="pill ${finalStatus}">${esc(data.outcome)}</span></div><div class="hero-main"><div><h1>${esc(data.project_root)}</h1><p class="subtitle">Job <span class="mono">${esc(data.job_id)}</span> · snapshot <span class="mono">${esc(data.snapshot_id ?? "Veri yok")}</span></p></div><div class="phase-switch" role="tablist" aria-label="Rapor asamasi">${stages.map((stage) => `<button class="phase-button" type="button" data-stage-select="${esc(stage.name)}" aria-selected="${stage.name === "final" ? "true" : "false"}">${esc(stage.name)}</button>`).join("")}</div></div><div class="contextline"><span>HEAD <b class="mono">${esc(data.head_commit ?? "Veri yok")}</b></span><span>Run <b>${data.run_summary.total} test</b></span><span>Eklenen <b>${data.tests_added}</b></span><span>Degisen <b>${data.tests_modified}</b></span><span>Production <b>${data.production_changed_files}</b></span></div></section>
    <nav class="nav" aria-label="Rapor bolumleri"><a href="#overview" data-nav="overview">Genel bakis</a><a href="#classes" data-nav="classes">Hedefler</a><a href="#quality" data-nav="quality">Kontrol sonuclari</a><a href="#ai" data-nav="ai">Uretim kayitlari</a><a href="#evidence" data-nav="evidence">Kanitlar</a></nav>
    <main class="content report06-screen">
      <section class="section" id="overview"><div class="section-head"><div class="section-title"><span class="section-index">01</span><div><h2>Genel bakis</h2><p>Kayitli kosu sonucu ve asama mutabakati.</p></div></div><span class="report06-status ${finalStatus}">${esc(data.outcome)}</span></div><div class="report06-grid"><div class="report06-card"><strong>${data.run_summary.total}</strong><span>Toplam test</span></div><div class="report06-card"><strong>${data.run_summary.passed}</strong><span>Gecen test</span></div><div class="report06-card"><strong>${data.run_summary.failed}</strong><span>Basarisiz test</span></div><div class="report06-card"><strong>${data.run_summary.skipped}</strong><span>Atlanan test</span></div></div><div class="panel" style="margin-top:14px"><table class="report06-stage-table"><thead><tr><th>Asama</th><th>Durum</th><th>Run kimligi</th><th>Run ozeti</th></tr></thead><tbody>${stageRows(stages)}</tbody></table></div></section>
      <section class="section" id="classes"><div class="section-head"><div class="section-title"><span class="section-index">02</span><div><h2>Sinif ve test hedefleri</h2><p>Coverage sayaçlari kayitli JaCoCo kanitindan gelir; eksik veri sifir degildir.</p></div></div></div><div class="panel"><div class="table-scroll"><table class="report06-table"><thead><tr><th>Hedef</th><th>FQCN</th><th>LINE</th><th>BRANCH</th></tr></thead><tbody>${targetRows(data)}</tbody></table></div></div></section>
      <section class="section" id="quality"><div class="section-head"><div class="section-title"><span class="section-index">03</span><div><h2>Kontrol sonuclari</h2><p>Durumlar yalniz kayitli gate ve gap olgularindan gosterilir.</p></div></div></div><div class="panel"><table class="report06-table"><thead><tr><th>Kontrol</th><th>Durum</th><th>Detay</th></tr></thead><tbody>${gateRows(data)}</tbody></table><table class="report06-table"><thead><tr><th>Gap</th><th>Engel</th><th>Denenen</th></tr></thead><tbody>${gapRows(data)}</tbody></table></div></section>
      <section class="section" id="ai"><div class="section-head"><div class="section-title"><span class="section-index">04</span><div><h2>Uretim kayitlari</h2><p>Iterasyon, model ve run metadata'si; model degerlendirmesi degildir.</p></div></div></div><div class="panel"><table class="report06-table"><thead><tr><th>#</th><th>Strateji</th><th>Karar</th><th>Olgu kodu</th><th>Coverage sonrasi</th></tr></thead><tbody>${iterationRows(data)}</tbody></table><table class="report06-table"><thead><tr><th>Rol</th><th>Provider</th><th>Model</th></tr></thead><tbody>${modelRows(data)}</tbody></table></div></section>
      <section class="section" id="evidence"><div class="section-head"><div class="section-title"><span class="section-index">05</span><div><h2>Kanitlar</h2><p>Yalniz manifestte ve diskte gercekten bulunan veya eksikligi kayitli artifact'ler.</p></div></div></div><div class="panel"><div class="table-scroll"><table class="report06-table"><thead><tr><th>Dosya</th><th>Tur</th><th>Run</th><th>Bayt</th><th>Durum</th></tr></thead><tbody>${evidenceRows(data.evidence ?? [])}</tbody></table></div><p class="report06-evidence-note">Checkpoint <span class="mono">${esc(data.checkpoint_id ?? "Veri yok")}</span> · final run <span class="mono">${esc(data.final_run_id ?? "Veri yok")}</span></p></div></section>
    </main>
    <section id="print-view" class="print-view"><h1>${esc(title)}</h1><p>Job <span class="mono">${esc(data.job_id)}</span> · ${esc(data.outcome)}</p>${printRows(data)}<h2>Kanitlar</h2><table class="report06-table"><thead><tr><th>Dosya</th><th>Tur</th><th>Bayt</th></tr></thead><tbody>${(data.evidence ?? []).map((entry) => `<tr><td>${esc(entry.relative_path)}</td><td>${esc(entry.kind)}</td><td>${entry.bytes ?? "Veri yok"}</td></tr>`).join("")}</tbody></table></section>
  </div>
</div>
<script id="report-data" type="application/json">${payload}</script>
<script>(function(){const root=document.documentElement;document.addEventListener('click',function(event){const target=event.target instanceof Element?event.target.closest('[data-stage-select]'):null;if(target){const stage=target.getAttribute('data-stage-select');document.querySelectorAll('[data-stage-select]').forEach(function(button){button.setAttribute('aria-selected',button.getAttribute('data-stage-select')===stage?'true':'false');});document.querySelectorAll('tr[data-stage]').forEach(function(row){row.classList.toggle('active',row.getAttribute('data-stage')===stage);});root.setAttribute('data-active-stage',stage||'');}if(event.target instanceof Element&&event.target.closest('[data-action="print"]')){window.print();}});})();</script>
</body>
</html>`;
}
