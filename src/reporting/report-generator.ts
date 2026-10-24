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
import { buildReport07 } from "./report07-renderer.js";
import { projectReport07Facts, type Report07Facts } from "./report07-facts.js";
import type { JobRow } from "../storage/job-repository.js";
import type { AllowedTestRoot } from "../policies/policy-guard.js";

type ReportJobState = Pick<JobRow, "id" | "lifecycle" | "phase" | "outcome" | "verification_level" | "apply_state">;

export function withJobRuntime(data: ReportData, job: ReportJobState): ReportData {
  if (data.job_id !== job.id) throw new AppError("REPORT_EXPORT_FAILED", "Rapor ile is kimligi eslesmiyor");
  const runtime = { ...data.runtime };
  if (job.outcome === null) delete runtime.stop_code;
  else runtime.stop_code = job.outcome;
  return {
    ...data,
    outcome: job.outcome ?? "UNAVAILABLE",
    verification_scope: job.verification_level,
    apply_state: job.apply_state,
    runtime: { ...runtime, lifecycle: job.lifecycle, phase: job.phase,
      checkpoint_valid: data.runtime?.checkpoint_valid ?? null },
  };
}

export interface ReportTarget {
  module_path?: string;
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

export type ReportStageName = "baseline" | "progress" | "final";

export interface ReportStage {
  name: ReportStageName;
  status: "KNOWN" | "NOT_RUN" | "UNAVAILABLE" | "INVALID";
  run_id: string | null;
  run_summary: { total: number; passed: number; failed: number; skipped: number } | null;
}

export type ReportEvidenceKind =
  | "jacoco_xml"
  | "jacoco_asset"
  | "surefire_xml"
  | "failsafe_xml"
  | "run_log"
  | "checkpoint_manifest"
  | "patch"
  | "accepted_source"
  | "extra";

export interface ReportEvidence {
  module_path?: string;
  relative_path: string;
  kind: ReportEvidenceKind;
  stage?: ReportStageName | "checkpoint";
  run_id?: string | null;
  sha256?: string | null;
  bytes?: number | null;
  redacted?: boolean;
  required?: boolean;
}

export interface ReportData {
  report07?: Report07Facts;
  runtime?: { lifecycle:string; phase:string; stop_code?:string; checkpoint_valid:boolean|null };
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
  /** Module test roots used by the accepting patch policy; absent on legacy exports. */
  test_roots?: AllowedTestRoot[];
  run_summary: { total: number; passed: number; failed: number; skipped: number };
  gates: Array<{ name: string; status: "PASSED" | "FAILED" | "NOT_RUN"; detail: string }>;
  gaps: Array<{ gap_key: string; blocker: string; attempted: string[] }>;
  models: Array<{ role: string; provider: string; model: string | null }>;
  production_changed_files: number;
  generated_at: number;
  /** P07-B: final replay ve checkpoint kanitlari; yalniz kayitli artifact'ler listelenir. */
  evidence?: ReportEvidence[];
  /** P07-B: baseline/progress/final ayni facts-only raporda ayrik tutulur. */
  stages?: ReportStage[];
  final_run_id?: string | null;
  checkpoint_id?: string | null;
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

const REPORT_ARTIFACT_KINDS = new Set<string>([
  "report_html",
  "report_json",
  "summary_text",
  "jacoco_xml",
  "jacoco_asset",
  "surefire_xml",
  "failsafe_xml",
  "run_log",
  "checkpoint_manifest",
  "patch",
  "accepted_source",
  "extra",
]);

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

  invalidatePublication(): void {
    rmSync(join(this.reportRoot, "PUBLISHED"), { force: true });
  }

  /** Reproject only an intact publication; never bless modified evidence. */
  synchronizeRuntime(job: ReportJobState): { missing: string[]; hash_mismatch: string[] } {
    const manifestPath = containedReportPath(this.reportRoot, "manifest.json");
    const before = existsSync(manifestPath) ? readFileSync(manifestPath) : null;
    const verified = this.verifyExport();
    if (verified.missing.length || verified.hash_mismatch.length) return verified;
    if (!before || !before.equals(readFileSync(manifestPath))) return {missing:[],hash_mismatch:["manifest.json"]};
    const manifest = JSON.parse(before.toString("utf8")) as {artifacts:Array<{relative_path:string;sha256:string;bytes:number}>};
    const artifactsByPath = new Map(manifest.artifacts.map(artifact => [artifact.relative_path, artifact]));
    const matches = (bytes: Buffer, name: string) => {
      const entry = artifactsByPath.get(name);
      return entry?.bytes === bytes.length && entry.sha256 === createHash("sha256").update(bytes).digest("hex");
    };
    const reportBytes = readFileSync(containedReportPath(this.reportRoot, "report.json"));
    if (!matches(reportBytes,"report.json")) return {missing:[],hash_mismatch:["report.json"]};
    const data = JSON.parse(reportBytes.toString("utf8")) as ReportData;
    const current = withJobRuntime(data, job);
    if (JSON.stringify(data.runtime) === JSON.stringify(current.runtime) && data.outcome === current.outcome
      && data.apply_state === current.apply_state && data.verification_scope === current.verification_scope) return verified;
    const core = new Set(["report.json", "index.html", "summary.txt", "manifest.json", "PUBLISHED"]);
    const extra: Record<string, Buffer> = {};
    for (const artifact of manifest.artifacts) {
      if (!core.has(artifact.relative_path)) {
        const bytes = readFileSync(containedReportPath(this.reportRoot, artifact.relative_path));
        if (!matches(bytes,artifact.relative_path)) return {missing:[],hash_mismatch:[artifact.relative_path]};
        extra[artifact.relative_path] = bytes;
      }
    }
    try {
      const result = this.export(current, extra);
      return { missing: result.missing_files, hash_mismatch: result.hash_mismatch };
    } catch (error) {
      this.invalidatePublication();
      throw error;
    }
  }

  export(data: ReportData, extraFiles?: Record<string, string | Buffer>): ExportResult {
    const files: ExportResult["files"] = [];
    // Yeni export baslamadan once eski yayin marker'i gecersizlesir; herhangi
    // bir ara hata eski raporu yeni rapor gibi gostermemelidir.
    this.invalidatePublication();
    // Exporter, HTML/JSON/manifest'in ayni normalize edilmis facts snapshot'ini
    // kullanmasini saglar; caller'in reportData nesnesi yerinde degistirilmez.
    const reportData = structuredClone(data) as ReportData;
    const evidenceDefinitions = new Map((reportData.evidence ?? []).map((entry) => [entry.relative_path, entry]));
    const extraEntries: ReportEvidence[] = [];
    for (const [name, content] of Object.entries(extraFiles ?? {})) {
      if (["report.json", "index.html", "summary.txt", "manifest.json", "PUBLISHED"].includes(name) || files.some((file) => file.name === name)) {
        throw new AppError("POLICY_VIOLATION", `Rapor extra dosyasi ayrilmis yolu ezemez: ${name}`, { reason_code: "REPORT_OVERWRITE" });
      }
      const definition = evidenceDefinitions.get(name);
      const bytes = Buffer.isBuffer(content) ? content.byteLength : Buffer.byteLength(content, "utf8");
      extraEntries.push({
        relative_path: name,
        kind: definition?.kind ?? "extra",
        ...(definition?.stage !== undefined ? { stage: definition.stage } : {}),
        ...(definition?.run_id !== undefined ? { run_id: definition.run_id } : {}),
        ...(definition?.module_path !== undefined ? { module_path: definition.module_path } : {}),
        sha256: createHash("sha256").update(content).digest("hex"),
        bytes,
        ...(definition?.redacted !== undefined ? { redacted: definition.redacted } : {}),
        ...(definition?.required !== undefined ? { required: definition.required } : {}),
      });
    }
    const extraByPath = new Map(extraEntries.map(entry => [entry.relative_path, entry]));
    const missingDefinitions = (reportData.evidence ?? [])
      .filter((entry) => entry.required === true && !extraByPath.has(entry.relative_path))
      .map((entry) => ({ ...entry, sha256: null, bytes: null }));
    reportData.evidence = [...extraEntries, ...missingDefinitions].sort((a, b) => a.relative_path.localeCompare(b.relative_path));
    // W06/F13/N02: facts-only sanitization - model narrative alanlari report JSON'a giremez;
    // kirpilan yollar kayitli olur (sessiz kirpma yok).
    const sanitized = sanitizeNarrativeFields(reportData);
    if (!sanitized.clean) {
      process.stderr.write(`[aitest-report] narrative alanlari kirpildi: ${sanitized.removed_paths.join(", ")}\n`);
    }
    reportData.report07 = projectReport07Facts(reportData, extraFiles);
    const reportJson = JSON.stringify(reportData, null, 2);
    this.write("report.json", reportJson, files);
    this.write("index.html", buildReport07(reportData), files);
    this.write("summary.txt", buildSummary(reportData), files);

    const manifest: Record<string, unknown> = {
      schema_version: 2,
      generated_at: Date.now(),
      job_id: reportData.job_id,
      head_commit: reportData.head_commit,
      snapshot_id: reportData.snapshot_id,
      checkpoint_id: reportData.checkpoint_id ?? null,
      run_ids: [...new Set((reportData.evidence ?? []).map((entry) => entry.run_id).filter((runId): runId is string => typeof runId === "string"))].sort(),
      artifacts: files.map((f) => ({ relative_path: f.name, sha256: f.sha256, bytes: f.bytes, kind: f.name === "index.html" ? "report_html" : f.name === "report.json" ? "report_json" : "summary_text", sensitivity: "sensitive", run_id: null })),
    };
    for (const [name, content] of Object.entries(extraFiles ?? {})) {
      this.write(name, content, files);
      const evidence = extraByPath.get(name);
      (manifest["artifacts"] as Array<Record<string, unknown>>).push({
        relative_path: name,
        sha256: evidence?.sha256 ?? createHash("sha256").update(content).digest("hex"),
        bytes: evidence?.bytes ?? (Buffer.isBuffer(content) ? content.byteLength : Buffer.byteLength(content, "utf8")),
        kind: evidence?.kind ?? "extra",
        sensitivity: "sensitive",
        run_id: evidence?.run_id ?? null,
        stage: evidence?.stage ?? null,
        redacted: evidence?.redacted ?? false,
      });
    }

    const manifestJson = JSON.stringify(manifest, null, 2);
    this.write("manifest.json", manifestJson, files);

    const verification = this.verifyExport(undefined, false);
    // W06/F15: verification_passed arttik missing VE hash_mismatch'e bakiyor:
    const verificationPassed = verification.missing.length === 0 && verification.hash_mismatch.length === 0;
    if (verificationPassed) {
      this.write("PUBLISHED", `job_id=${reportData.job_id}\nmanifest=manifest.json\n`, files);
    }
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
  verifyExport(expected?: ExportResult["files"], requirePublished = true): { missing: string[]; hash_mismatch: string[] } {
    // Kimlik ve evidence kontrolleri caller'in verdigi dosya listesine
    // birakilamaz; aksi halde expected yolu manifest kapilarini atlar.
    let files: ExportResult["files"];
    const expectedPublished = expected?.find((file) => file.name === "PUBLISHED");
    {
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
      const manifestJobId = typeof manifest["job_id"] === "string" ? manifest["job_id"] : null;
      const manifestSchema = typeof manifest["schema_version"] === "number" ? manifest["schema_version"] : null;
      if (manifestSchema !== 2) {
        structuralErrors.push("manifest.json (schema_version uyumsuz)");
      }
      let reportJson: Record<string, unknown> | null = null;
      const reportJsonPath = containedReportPath(this.reportRoot, "report.json");
      if (existsSync(reportJsonPath)) {
        try {
          reportJson = JSON.parse(readFileSync(reportJsonPath, "utf8")) as Record<string, unknown>;
        } catch {
          structuralErrors.push("report.json (corrupt)");
        }
      }
      if (!reportJson) {
        structuralErrors.push("report.json (identity okunamadi)");
      } else {
        if (manifestJobId === null || manifestJobId !== reportJson["job_id"]) {
          structuralErrors.push("manifest.json (job_id uyusmazligi)");
        }
        for (const key of ["head_commit", "snapshot_id", "checkpoint_id"] as const) {
          if ((manifest[key] ?? null) !== (reportJson[key] ?? null)) {
            structuralErrors.push(`manifest.json (${key} uyusmazligi)`);
          }
        }
        const manifestRunIds = Array.isArray(manifest["run_ids"]) ? [...new Set(manifest["run_ids"].filter((value): value is string => typeof value === "string"))].sort() : [];
        const reportRunIds = Array.isArray(reportJson["evidence"])
          ? [...new Set((reportJson["evidence"] as Array<Record<string, unknown>>).map((entry) => entry["run_id"]).filter((value): value is string => typeof value === "string"))].sort()
          : [];
        if (JSON.stringify(manifestRunIds) !== JSON.stringify(reportRunIds)) {
          structuralErrors.push("manifest.json (run_ids uyusmazligi)");
        }
      }
      const evidenceByPath = new Map<string, Record<string, unknown>>();
      if (reportJson && Array.isArray(reportJson["evidence"])) {
        for (const evidence of reportJson["evidence"] as Array<Record<string, unknown>>) {
          const path = typeof evidence["relative_path"] === "string" ? evidence["relative_path"] : "";
          if (path.length === 0 || evidenceByPath.has(path)) {
            structuralErrors.push(`report.json (evidence duplicate/empty: ${path || "unknown"})`);
          } else {
            evidenceByPath.set(path, evidence);
          }
        }
      }
      files = (artifacts as Array<Record<string, unknown>>).map((a) => {
        const name = typeof a["relative_path"] === "string" ? a["relative_path"] : "";
        const sha256 = typeof a["sha256"] === "string" ? a["sha256"] : "";
        const bytes = typeof a["bytes"] === "number" ? a["bytes"] : -1;
        const kind = typeof a["kind"] === "string" ? a["kind"] : "";
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
        if (name === "PUBLISHED") {
          structuralErrors.push("manifest.json (reserved path: PUBLISHED)");
        }
        if (!REPORT_ARTIFACT_KINDS.has(kind)) {
          structuralErrors.push(`manifest.json (invalid kind: ${name || "unknown"})`);
        }
        if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isInteger(bytes) || bytes < 0) {
          structuralErrors.push(`manifest.json (invalid metadata: ${name || "unknown"})`);
        }
        const evidence = evidenceByPath.get(name);
        if (evidence) {
          if (evidence["sha256"] !== sha256 || evidence["bytes"] !== bytes) {
            structuralErrors.push(`manifest.json (evidence metadata uyumsuz: ${name})`);
          }
          if (typeof evidence["kind"] === "string" && evidence["kind"] !== kind) {
            structuralErrors.push(`manifest.json (evidence kind uyumsuz: ${name})`);
          }
          if ((evidence["run_id"] ?? null) !== (a["run_id"] ?? null)) {
            structuralErrors.push(`manifest.json (evidence run_id uyumsuz: ${name})`);
          }
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
      for (const [path, evidence] of evidenceByPath) {
        const required = evidence["required"] === true;
        if (required && !names.has(path)) {
          structuralErrors.push(`evidence eksik: ${path}`);
        }
        if (required && (evidence["sha256"] === null || evidence["bytes"] === null)) {
          structuralErrors.push(`evidence eksik: ${path}`);
        }
      }
      if (structuralErrors.length > 0) {
        return { missing: structuralErrors, hash_mismatch: [] };
      }
      if (expectedPublished) {
        files.push(expectedPublished);
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
    // A report is authoritative only after its canonical manifest has been
    // checked and a publication marker has been atomically written.
    if (requirePublished && !existsSync(join(this.reportRoot, "PUBLISHED"))) {
      missing.push("PUBLISHED");
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
    `Run: ${data.run_summary.total} test, ${data.run_summary.passed} gecti, ${data.run_summary.failed} basarisiz, ${data.run_summary.skipped} atlandi`,
    `Test eklenen: ${data.tests_added}`,
    `Test degisen: ${data.tests_modified}`,
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
