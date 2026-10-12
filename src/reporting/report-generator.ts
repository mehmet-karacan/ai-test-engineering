/**
 * Offline Report Generator: DB'den dogrulanmis JSON'u uretir ve HTML'e render eder.
 * Raporun resmi sonucu modele yazdirilmaz; dogrulanmis JSON'dan render edilir.
 * W06/F14: facts-only - model narrative hicbir yuzeye girmez; 'yorumlar AI tarafindan uretildi'
 * metni KALDIRILDI. Uretim kayitlari facts-only metadata ile (rol/provider/model kimligi) gosterilir.
 * Harici font/script/CDN yok; tum metinler escape edilir.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, lstatSync, renameSync, rmSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { AppError } from "../domain/errors.js";
import { sanitizeNarrativeFields } from "./report-data-contract.js";

export interface ReportTarget {
  target_id: string;
  selector: string;
  fqn: string;
  line: { covered: number; missed: number; total: number; bps: number; target_bps: number; met: boolean; validity: string } | null;
  branch: { covered: number; missed: number; total: number; bps: number; target_bps: number; met: boolean; validity: string } | null;
}

export interface ReportIteration {
  ordinal: number;
  strategy: string;
  decision: string;
  reason: string;
  coverage_before_bps: number | null;
  coverage_after_bps: number | null;
}

export interface ReportData {
  schema_version: 1;
  job_id: string;
  project_root: string;
  head_commit: string | null;
  snapshot_id: string | null;
  outcome: string;
  verification_scope: string;
  apply_state: string;
  targets: ReportTarget[];
  iterations: ReportIteration[];
  tests_added: number;
  tests_modified: number;
  run_summary: { total: number; passed: number; failed: number; skipped: number };
  gates: Array<{ name: string; status: "PASSED" | "FAILED" | "NOT_RUN"; detail: string }>;
  gaps: Array<{ gap_key: string; blocker: string; attempted: string[] }>;
  models: Array<{ role: string; provider: string; model: string | null }>;
  production_changed_files: number;
  generated_at: number;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\x1b\].*?\x07/g, "");
}

export function buildReport(data: ReportData): string {
  const title = escapeHtml(`AI Test Engineering Raporu - ${data.job_id.slice(0, 8)}`);
  const outcomeClass = data.outcome === "TARGET_REACHED" ? "ok" : data.outcome.startsWith("BLOCKED") ? "blocked" : "warn";
  const outcomeText = escapeHtml(outcomeTextFor(data.outcome));

  const targetRows = data.targets
    .map((t) => {
      const lineText = t.line ? `${t.line.covered}/${t.line.total} (${(t.line.bps / 100).toFixed(2)}%) hedef ${(t.line.target_bps / 100).toFixed(0)}% ${t.line.met ? "SAGLANDI" : "SAGLANAMADI"} [${t.line.validity}]` : "N/A";
      const branchText = t.branch ? `${t.branch.covered}/${t.branch.total} (${(t.branch.bps / 100).toFixed(2)}%) ${t.branch.met ? "SAGLANDI" : "SAGLANAMADI"} [${t.branch.validity}]` : "N/A";
      return `<tr><td>${escapeHtml(t.selector)}</td><td>${escapeHtml(t.fqn)}</td><td>${escapeHtml(lineText)}</td><td>${escapeHtml(branchText)}</td></tr>`;
    })
    .join("\n");

  const iterationRows = data.iterations
    .map((it) => {
      const before = it.coverage_before_bps !== null ? `${(it.coverage_before_bps / 100).toFixed(2)}%` : "-";
      const after = it.coverage_after_bps !== null ? `${(it.coverage_after_bps / 100).toFixed(2)}%` : "-";
      return `<tr><td>${it.ordinal}</td><td>${escapeHtml(it.strategy)}</td><td>${escapeHtml(it.decision)}</td><td>${escapeHtml(it.reason)}</td><td>${before}</td><td>${after}</td></tr>`;
    })
    .join("\n");

  const gateRows = data.gates
    .map((g) => `<tr><td>${escapeHtml(g.name)}</td><td class="${g.status === "PASSED" ? "ok" : g.status === "FAILED" ? "bad" : "muted"}">${g.status}</td><td>${escapeHtml(g.detail)}</td></tr>`)
    .join("\n");

  const gapRows = data.gaps
    .map((g) => `<tr><td>${escapeHtml(g.gap_key)}</td><td>${escapeHtml(g.blocker)}</td><td>${escapeHtml(g.attempted.join("; "))}</td></tr>`)
    .join("\n");

  const modelRows = data.models
    .map((m) => `<tr><td>${escapeHtml(m.role)}</td><td>${escapeHtml(m.provider)}</td><td>${escapeHtml(m.model ?? "unknown")}</td></tr>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
body { font-family: Segoe UI, Arial, sans-serif; background: #f1f5f9; color: #0f172a; margin: 0; padding: 2rem; }
h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
.card { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #e2e8f0; }
th { background: #f8fafc; }
.ok { color: #166534; font-weight: 600; } .bad { color: #b91c1c; font-weight: 600; }
.warn { color: #92400e; font-weight: 600; } .muted { color: #64748b; }
.badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
.badge.ok { background: #dcfce7; } .badge.warn { background: #fef3c7; } .badge.blocked { background: #fee2e2; }
</style>
</head>
<body>
<h1>AI Test Engineering Raporu</h1>
<div class="card">
<p><strong>Job:</strong> ${escapeHtml(data.job_id)}</p>
<p><strong>Proje:</strong> ${escapeHtml(data.project_root)}</p>
<p><strong>Snapshot:</strong> ${escapeHtml(data.snapshot_id ?? "unknown")} | <strong>HEAD:</strong> ${escapeHtml(data.head_commit ?? "unknown")}</p>
<p><strong>Rapor zamani:</strong> ${escapeHtml(new Date(data.generated_at).toISOString())}</p>
<p><strong>Karar:</strong> <span class="badge ${outcomeClass}">${outcomeText}</span></p>
<p><strong>Verification scope:</strong> ${escapeHtml(data.verification_scope)} | <strong>Apply durumu:</strong> ${escapeHtml(data.apply_state)}</p>
<p><strong>Production degisikligi:</strong> ${data.production_changed_files === 0 ? "0 (korundu)" : escapeHtml(String(data.production_changed_files)) + " dosya (INCELE!)"} </p>
</div>

<h2>Sinif bazli once/sonra</h2>
<div class="card"><table>
<tr><th>Hedef</th><th>FQCN</th><th>LINE</th><th>BRANCH</th></tr>
${targetRows}
</table></div>

<h2>Kalite/regresyon/guvenlik kapilari</h2>
<div class="card"><table>
<tr><th>Kapi</th><th>Sonuc</th><th>Detay</th></tr>
${gateRows}
</table></div>

<h2>Test degisiklikleri</h2>
<div class="card"><p>Eklenen test dosyasi: ${data.tests_added} | Degisen: ${data.tests_modified}</p>
<p>Run ozeti: ${data.run_summary.total} test, ${data.run_summary.passed} gecti, ${data.run_summary.failed} basarisiz, ${data.run_summary.skipped} atlandi</p></div>

<h2>Iterasyon zaman cizgisi</h2>
<div class="card"><table>
<tr><th>#</th><th>Strateji</th><th>Karar</th><th>Neden</th><th>Once</th><th>Sonra</th></tr>
${iterationRows}
</table></div>

<h2>Kalan gap'ler</h2>
<div class="card"><table>
<tr><th>Gap</th><th>Engel sinifi</th><th>Denenen yontemler</th></tr>
${gapRows}
</table></div>

<h2>Uretim kayitlari (facts-only)</h2>
<div class="card"><p>Olcumler arac tarafindan (Maven/JaCoCo); rapor motoru kayitlari gosterir, model narrative tasimaz.</p><table>
<tr><th>Rol</th><th>Provider</th><th>Model</th></tr>
${modelRows}
</table></div>

<h2>Ham kanitlar</h2>
<div class="card"><p>JaCoCo XML/HTML, test sonuclari, redakte log, changeset ve checkpoint manifest rapor dizininde.</p></div>
</body>
</html>
`;
}

function outcomeTextFor(outcome: string): string {
  switch (outcome) {
    case "TARGET_REACHED":
      return "HEDEF SAGLANDI";
    case "TARGET_ALREADY_MET":
      return "HEDEF ZATEN SAGLANIYORDU";
    case "TARGET_NOT_MET_PLATEAU":
      return "HEDEF SAGLANAMADI (plateau)";
    case "TARGET_NOT_MET_BUDGET":
      return "HEDEF SAGLANAMADI (butce)";
    case "BASELINE_FAILED":
      return "BASELINE BASARISIZ";
    case "INVALID_COVERAGE_EVIDENCE":
      return "GECERSIZ COVERAGE KANITI";
    default:
      return outcome;
  }
}

export interface ExportResult {
  report_dir: string;
  files: Array<{ name: string; sha256: string; bytes: number }>;
  verification_passed: boolean;
  missing_files: string[];
  /** W06/F13: kirpilan narrative alanlari (tam yol; sessiz kirpma yok) */
  sanitized_paths: string[];
  hash_mismatch: string[];
}

/**
 * W06/F15: canonical path containment - manifest dosya adi kok disina cikamaz;
 * traversal/symlink yolu reddedilir.
 */
function containedReportPath(reportRoot: string, name: string): string {
  const absPath = resolve(reportRoot, name);
  const rel = relative(reportRoot, absPath);
  if (rel.startsWith("..") || rel.length === 0 || (process.platform === "win32" && name.includes(":"))) {
    throw new AppError("POLICY_VIOLATION", `Rapor dosya yolu kok disina cikiyor: ${name}`, { reason_code: "PATH_ESCAPE" });
  }
  // Existing junction/symlink components are an escape even when the lexical
  // relative path stays below reportRoot.
  let cursor = resolve(reportRoot);
  for (const part of rel.split(/[\\/]/)) {
    cursor = join(cursor, part);
    try {
      if (lstatSync(cursor).isSymbolicLink()) {
        throw new AppError("POLICY_VIOLATION", `Rapor yolu symlink/junction iceriyor: ${name}`, { reason_code: "SYMLINK_ESCAPE" });
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      // Yol henuz yaratilmadiysa normaldir; write() daha sonra parent'i olusturur.
    }
  }
  return absPath;
}

export class ReportExporter {
  private readonly reportRoot: string;

  constructor(reportRoot: string) {
    this.reportRoot = reportRoot;
    mkdirSync(this.reportRoot, { recursive: true });
  }

  export(data: ReportData, extraFiles?: Record<string, string | Buffer>): ExportResult {
    const files: ExportResult["files"] = [];
    // W06/F13/N02: facts-only sanitization - model narrative alanlari report JSON'a giremez;
    // kirpilan yollar kayitli olur (sessiz kirpma yok).
    const sanitized = sanitizeNarrativeFields(data);
    if (!sanitized.clean) {
      process.stderr.write(`[aitest-report] narrative alanlari kirpildi: ${sanitized.removed_paths.join(", ")}\n`);
    }
    const reportJson = JSON.stringify(data, null, 2);
    this.write("report.json", reportJson, files);
    this.write("index.html", buildReport(data), files);
    this.write("summary.txt", buildSummary(data), files);

    const manifest: Record<string, unknown> = {
      schema_version: 1,
      generated_at: Date.now(),
      artifacts: files.map((f) => ({ relative_path: f.name, sha256: f.sha256, bytes: f.bytes, kind: f.name === "index.html" ? "report_html" : f.name === "report.json" ? "report_json" : "summary_text", sensitivity: "sensitive" })),
    };
    for (const [name, content] of Object.entries(extraFiles ?? {})) {
      if (["report.json", "index.html", "summary.txt", "manifest.json"].includes(name) || files.some((file) => file.name === name)) {
        throw new AppError("POLICY_VIOLATION", `Rapor extra dosyasi ayrilmis yolu ezemez: ${name}`, { reason_code: "REPORT_OVERWRITE" });
      }
      this.write(name, content, files);
      (manifest["artifacts"] as Array<Record<string, unknown>>).push({ relative_path: name, sha256: createHash("sha256").update(content).digest("hex"), bytes: Buffer.byteLength(content, "utf8"), kind: "extra", sensitivity: "sensitive" });
    }

    const manifestJson = JSON.stringify(manifest, null, 2);
    this.write("manifest.json", manifestJson, files);

    const verification = this.verifyExport();
    // W06/F15: verification_passed arttik missing VE hash_mismatch'e bakiyor:
    const verificationPassed = verification.missing.length === 0 && verification.hash_mismatch.length === 0;
    return {
      report_dir: this.reportRoot,
      files,
      verification_passed: verificationPassed,
      missing_files: verification.missing,
      sanitized_paths: sanitized.removed_paths,
      hash_mismatch: verification.hash_mismatch,
    };
  }

  private write(name: string, content: string | Buffer, files: ExportResult["files"]): void {
    const path = containedReportPath(this.reportRoot, name);
    // W07/N44: nested directory kontrollu olusturulur (asset alt dizinleri):
    mkdirSync(join(path, ".."), { recursive: true });
    const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
    try {
      writeFileSync(temporaryPath, content);
      renameSync(temporaryPath, path);
    } finally {
      if (existsSync(temporaryPath)) {
        rmSync(temporaryPath, { force: true });
      }
    }
    files.push({ name, sha256: createHash("sha256").update(content).digest("hex"), bytes: Buffer.isBuffer(content) ? content.byteLength : Buffer.byteLength(content, "utf8") });
  }

  /**
   * W06/F15/N45: parametresiz verify canonical manifest'i yukler ve dogrular;
   * bos listeyi dogrulamak yerine manifest artifacts'ini okur (corrupt manifest fail-closed).
   */
  verifyExport(expected?: ExportResult["files"]): { missing: string[]; hash_mismatch: string[] } {
    let files = expected;
    if (!files || files.length === 0) {
      // canonical manifest'ten yukle:
      const manifestPath = containedReportPath(this.reportRoot, "manifest.json");
      if (!existsSync(manifestPath)) {
        return { missing: ["manifest.json"], hash_mismatch: [] };
      }
      let manifest: Record<string, unknown>;
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
      } catch {
        // corrupt manifest fail-closed:
        return { missing: ["manifest.json (corrupt)"], hash_mismatch: [] };
      }
      const artifacts = manifest["artifacts"];
      if (!Array.isArray(artifacts)) {
        return { missing: ["manifest.json (artifacts eksik)"], hash_mismatch: [] };
      }
      if (artifacts.length === 0) {
        return { missing: ["manifest.json (artifacts bos)"], hash_mismatch: [] };
      }
      const names = new Set<string>();
      const structuralErrors: string[] = [];
      files = (artifacts as Array<Record<string, unknown>>).map((a) => {
        const name = typeof a["relative_path"] === "string" ? a["relative_path"] : "";
        const sha256 = typeof a["sha256"] === "string" ? a["sha256"] : "";
        const bytes = typeof a["bytes"] === "number" ? a["bytes"] : -1;
        if (name.length === 0) {
          structuralErrors.push("manifest.json (bos relative_path)");
        } else if (names.has(name)) {
          structuralErrors.push(`manifest.json (duplicate: ${name})`);
        } else {
          names.add(name);
        }
        if (name === "manifest.json") {
          structuralErrors.push("manifest.json (reserved path)");
        }
        if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isInteger(bytes) || bytes < 0) {
          structuralErrors.push(`manifest.json (invalid metadata: ${name || "unknown"})`);
        }
        return { name, sha256, bytes };
      });
      for (const required of ["report.json", "index.html", "summary.txt"]) {
        if (!names.has(required)) {
          structuralErrors.push(`manifest.json (zorunlu artifact eksik: ${required})`);
        }
      }
      if (structuralErrors.length > 0) {
        return { missing: structuralErrors, hash_mismatch: [] };
      }
    }
    const missing: string[] = [];
    const hashMismatch: string[] = [];
    for (const file of files) {
      let path: string;
      try {
        path = containedReportPath(this.reportRoot, file.name);
      } catch {
        hashMismatch.push(file.name);
        continue;
      }
      if (!existsSync(path)) {
        missing.push(file.name);
        continue;
      }
      const content = readFileSync(path);
      const hash = createHash("sha256").update(content).digest("hex");
      if (hash !== file.sha256 || content.byteLength !== file.bytes) {
        hashMismatch.push(file.name);
      }
    }
    return { missing, hash_mismatch: hashMismatch };
  }
}

export function buildSummary(data: ReportData): string {
  const lines = [
    `Job: ${data.job_id}`,
    `Karar: ${outcomeTextFor(data.outcome)}`,
    `Verification: ${data.verification_scope}`,
    "",
    "Hedefler:",
    ...data.targets.map((t) => `  ${t.fqn}: LINE ${t.line ? `${t.line.covered}/${t.line.total} ${(t.line.bps / 100).toFixed(2)}%` : "N/A"} | BRANCH ${t.branch ? `${t.branch.covered}/${t.branch.total} ${(t.branch.bps / 100).toFixed(2)}%` : "N/A"}`),
    "",
    `Iterasyon: ${data.iterations.length} (kabul: ${data.iterations.filter((i) => i.decision === "adopted").length}, red: ${data.iterations.filter((i) => i.decision === "rejected").length})`,
    `Run: ${data.run_summary.total} test, ${data.run_summary.passed} gecti, ${data.run_summary.failed} basarisiz`,
    `Production degisikligi: ${data.production_changed_files}`,
  ];
  return lines.join("\n") + "\n";
}

export function assertReportConsistent(data: ReportData, reportDir: string): void {
  const reportJsonPath = join(reportDir, "report.json");
  if (!existsSync(reportJsonPath)) {
    throw new AppError("STORAGE_ERROR", "report.json uretilmemis");
  }
  const parsed = JSON.parse(readFileSync(reportJsonPath, "utf8")) as ReportData;
  if (parsed.job_id !== data.job_id) {
    throw new AppError("STORAGE_ERROR", "report.json job_id uyusmazligi");
  }
  if (parsed.outcome !== data.outcome) {
    throw new AppError("STORAGE_ERROR", "report.json outcome uyusmazligi");
  }
}
