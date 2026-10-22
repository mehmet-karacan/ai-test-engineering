import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { handleTestStart, handleTestStatus, requireServices, type Services } from "../application/services.js";
import { handleProjectCoverage } from "../application/project-coverage.js";
import { handleTestResult } from "../application/job-tools.js";
import { CoverageGoalSchema, ProjectCoverageInputSchema } from "../domain/tool-schemas.js";
import { readProjectCoverageResult } from "../storage/project-coverage-result.js";
import { ProjectRepository } from "../storage/project-repository.js";
import { ReportExporter, type ReportData } from "../reporting/report-generator.js";
import { readWorkerProfileFromOpencodeConfig } from "../workers/opencode/profile-reader.js";
import type { UiBackend } from "./server.js";

const startSchema = z.object({ coverage_scan_id: z.string().uuid(), selector: z.string().min(1).max(512),
  line_percent: CoverageGoalSchema.shape.percent, branch_percent: CoverageGoalSchema.shape.branch_percent,
  model_profile: z.string().min(1).max(128).optional(), idempotency_key: z.string().min(8).max(128) }).strict();
const uuid = z.string().uuid();
function inside(root: string, path: string) { const rel = relative(root, path); if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("Dosya rapor alanının dışında"); }

export function createUiBackend(services: Services, options?: { workerEnabled: boolean; model: string | null }): UiBackend {
  const { storage, jobs } = requireServices(services);
  const workerEnabled = options?.workerEnabled ?? process.env["AITEST_WORKER_ENABLED"] === "1";
  const nativeRoot = (root: string) => process.platform === "win32" ? resolve(root).toLowerCase() : resolve(root);
  const storedRoot = (root: string) => nativeRoot(root).replace(/\\/g, "/").replace(/\/+$/, "");
  const allowed = (root: string) => !services.config.allowed_project_roots.length || services.config.allowed_project_roots.some(value => storedRoot(root) === storedRoot(value) || storedRoot(root).startsWith(storedRoot(value) + "/"));
  const uiServices = () => ({ ...services, config: { ...services.config, allowed_project_roots: services.config.allowed_project_roots.map(nativeRoot) } });
  function jobRoot(id: string) { uuid.parse(id); const job = jobs.getJob(id); const location = new ProjectRepository(storage.db).getLocation(job.location_id); if (!allowed(location.canonical_root)) throw new Error("Yetkili proje alanının dışında"); return nativeRoot(location.canonical_root); }
  function report(id: string) {
    jobRoot(id); const root = join(services.config.storage.root, "jobs", id, "reports");
    if (!existsSync(join(root, "PUBLISHED"))) throw new Error("Rapor henüz doğrulanıp yayımlanmadı");
    inside(realpathSync(services.config.storage.root), realpathSync(root));
    const check = new ReportExporter(root).verifyExport();
    if (check.missing.length || check.hash_mismatch.length) throw new Error("Rapor dosyaları doğrulanamadı");
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as { job_id: string; artifacts: { relative_path: string; sha256: string; bytes: number }[] };
    if (manifest.job_id !== id) throw new Error("Rapor iş kimliği doğrulanamadı");
    return { root, manifest };
  }
  function selectedFiles(id: string) {
    try { const { manifest } = report(id); const patch = manifest.artifacts.find(a => a.relative_path.endsWith(".patch")); return { report_url: `/reports/${id}/index.html`, patch_url: patch ? `/reports/${id}/${patch.relative_path.split("/").map(encodeURIComponent).join("/")}` : null }; }
    catch { return { report_url: null, patch_url: null }; }
  }
  return {
    async bootstrap() {
      let model = options?.model ?? null;
      if (!options) { try { const p = readWorkerProfileFromOpencodeConfig(); model = `${p.provider_id}/${p.model_id}`; } catch { /* explicit UI input remains possible */ } }
      const projects = storage.db.prepare<[], { project_root: string }>("SELECT DISTINCT canonical_root AS project_root FROM project_locations ORDER BY last_seen_at DESC LIMIT 100").all().filter(p => allowed(p.project_root));
      return { projects, worker_enabled: workerEnabled, model };
    },
    async history(query) {
      const offset = z.coerce.number().int().min(0).max(1000000).parse(query.get("offset") ?? 0);
      const limit = z.coerce.number().int().min(1).max(20).parse(query.get("limit") ?? 10);
      const roots = services.config.allowed_project_roots.map(storedRoot);
      const where = roots.length ? roots.map(() => "(l.canonical_root=? OR substr(l.canonical_root,1,length(?))=?)").join(" OR ") : "1=1";
      const bindings = roots.flatMap(root => [root, root + "/", root + "/"]);
      const rows = storage.db.prepare<unknown[], { id: string; project_root: string; lifecycle: string; created_at: number }>(`SELECT j.id, l.canonical_root AS project_root, j.lifecycle, j.created_at FROM test_jobs j JOIN project_locations l ON l.id=j.location_id WHERE ${where} ORDER BY j.created_at DESC,j.id DESC LIMIT ? OFFSET ?`).all(...bindings, limit + 1, offset);
      return { jobs: rows.slice(0, limit), has_more: rows.length > limit };
    },
    async scan(input) { const parsed = ProjectCoverageInputSchema.parse(input); return handleProjectCoverage({ ...parsed, project_root: nativeRoot(parsed.project_root) }, uiServices()); },
    async start(input) {
      if (!workerEnabled) throw new Error("Test üretimi kapalı. Ekranı AITEST_WORKER_ENABLED=1 ile başlatın.");
      const parsed = startSchema.parse(input); jobRoot(parsed.coverage_scan_id);
      const scan = readProjectCoverageResult(services, parsed.coverage_scan_id);
      if (!scan) throw new Error("Önce genel kapsam analizini tamamlayın");
      return handleTestStart({ project_root: nativeRoot(scan.project_root), coverage_scan_id: scan.job_id,
        targets: [{ selector: parsed.selector, kind: "class" }], mode: "TEST_ONLY",
        coverage: { percent: parsed.line_percent, ...(parsed.branch_percent === undefined ? {} : { branch_percent: parsed.branch_percent }), metrics: parsed.branch_percent === undefined ? ["LINE"] : ["LINE", "BRANCH"] },
        ...(parsed.model_profile ? { model_profile: parsed.model_profile } : {}), idempotency_key: parsed.idempotency_key }, uiServices());
    },
    async job(id) {
      const projectRoot = jobRoot(id);
      const status = await handleTestStatus({ job_id: id }, services);
      // Recent events are bounded, including when reopening an old job after refresh.
      status.events = storage.db.prepare<[string], { sequence: number; event_type: string; phase: string | null }>("SELECT sequence,event_type,phase FROM job_events WHERE job_id=? ORDER BY sequence DESC LIMIT 50").all(id).reverse();
      const result = await handleTestResult({ job_id: id }, services);
      type Row = { fqn: string; line_covered: number; line_missed: number; branch_covered: number | null; branch_missed: number | null; branch_validity: string | null; before_after: string; created_at: number };
      const rows = storage.db.prepare<[string], Row>("SELECT fqn,line_covered,line_missed,branch_covered,branch_missed,branch_validity,before_after,created_at FROM coverage_snapshots WHERE job_id=? AND line_validity='OK' ORDER BY created_at DESC,id DESC LIMIT 201").all(id);
      const counter = (covered: number | null, missed: number | null, valid: boolean) => ({ covered, missed, percent: valid && covered !== null && missed !== null && covered + missed > 0 ? covered / (covered + missed) * 100 : null });
      let measurements = rows.slice(0, 200).reverse().map(row => ({ fqn: row.fqn, stage: row.before_after, created_at: row.created_at,
        line: counter(row.line_covered, row.line_missed, true), branch: counter(["OK", "NOT_APPLICABLE"].includes(row.branch_validity ?? "") ? row.branch_covered : null, ["OK", "NOT_APPLICABLE"].includes(row.branch_validity ?? "") ? row.branch_missed : null, row.branch_validity === "OK") }));
      // Existing runtime only persists final class snapshots. Once published,
      // use the verified Report07 baseline/final counters, never metricless bps.
      try {
        const { root } = report(id); const data = JSON.parse(readFileSync(join(root, "report.json"), "utf8")) as ReportData;
        if (data.targets.length === 1 && data.report07?.coverage_history.length) {
          measurements = data.report07.coverage_history.map(point => ({ fqn: data.targets[0]!.fqn, stage: point.stage === "baseline" ? "before" : "after", created_at: data.generated_at,
            line: counter(point.line.covered, point.line.missed, point.line.status === "KNOWN"), branch: counter(point.branch.covered, point.branch.missed, point.branch.status === "KNOWN") }));
        }
      } catch { /* No published measurement history yet; keep only actual DB rows. */ }
      return { status, result: { ...result, ...selectedFiles(id) }, project_root: projectRoot, measurements, measurements_truncated: rows.length > 200 };
    },
    async reportFile(id, encodedName) {
      const name = decodeURIComponent(encodedName);
      if (!name || /[%\\:]/.test(name) || [...name].some(char => char.charCodeAt(0) < 32) || name.split("/").some(segment => !segment || segment === "." || segment === "..")) throw new Error("Geçersiz rapor dosyası");
      const { root, manifest } = report(id); const file = manifest.artifacts.find(a => a.relative_path === name);
      if (!file) throw new Error("Dosya doğrulanmış rapor listesinde yok");
      const path = resolve(root, name); inside(realpathSync(root), realpathSync(path));
      const bytes = readFileSync(path);
      if (bytes.length !== file.bytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("Dosya içeriği doğrulanamadı");
      if (name === "index.html") {
        const hashes = [...bytes.toString("utf8").matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => `'sha256-${createHash("sha256").update(match[1]!).digest("base64")}'`).join(" ");
        return { bytes, contentType: "text/html; charset=utf-8", policy: `default-src 'none'; script-src ${hashes || "'none'"}; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` };
      }
      return { bytes, contentType: name.endsWith(".html") ? "text/html; charset=utf-8" : name.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", policy: "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:" };
    },
  };
}
