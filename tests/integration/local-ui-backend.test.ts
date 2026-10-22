import { afterEach, describe, expect, it, vi } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUiBackend } from "../../src/ui/backend.js";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { JobDispatcher } from "../../src/orchestration/job-dispatcher.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { ReportExporter } from "../../src/reporting/report-generator.js";
import { report07Data } from "../fixtures/report07-data.js";

afterEach(() => vi.restoreAllMocks());
describe("local UI application adapter", () => {
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "local-ui-"));
    const services = createDefaultServicesForTest(join(root, "state.db"), root); services.config.storage.root = root;
    const project = join(root, "project"); cpSync("tests/fixtures/sample-maven-project", project, { recursive: true });
    const { location } = new ProjectRepository(services.storage!.db).ensureLocation(project, "fixture", null);
    const job = services.jobs!.createJob({ locationId: location.id, requestDigest: "fixture" });
    const backend = createUiBackend(services, { workerEnabled: false, model: null });
    return { root, services, backend, job, project, close() { services.storage!.close(); rmSync(root, { recursive: true, force: true }); } };
  }
  it("uses the real analysis service and refuses generation without a worker or scan", async () => {
    const f = fixture(); vi.spyOn(JobDispatcher.prototype, "dispatch").mockResolvedValue({} as never);
    try {
      const result = await f.backend.scan({ project_root: f.project, idempotency_key: "ui-scan-1" }) as { job_id: string };
      await new Promise<void>(r => setImmediate(r));
      expect(f.services.jobs!.getJob(result.job_id).lifecycle).toBe("RUNNING");
      expect((await f.backend.history(new URLSearchParams()))).toMatchObject({ jobs: expect.arrayContaining([expect.objectContaining({ id: result.job_id })]) });
      await expect(f.backend.start({})).rejects.toThrow(/üretimi kapalı/);
      expect(await f.backend.bootstrap()).toMatchObject({ worker_enabled: false, model: null });
    } finally { f.close(); }
  });
  it("serves only verified manifest bytes for the requested job and refuses unlisted/tampered files", async () => {
    const f = fixture();
    try {
      const data = report07Data(); data.job_id = f.job.id; const reportRoot = join(f.root, "jobs", f.job.id, "reports");
      new ReportExporter(reportRoot).export(data, { "evidence/changes.patch": "diff fixture", "evidence/stack.html": "<h1>trace</h1>" });
      expect((await f.backend.reportFile(f.job.id, "index.html")).bytes.toString()).toContain("AI Unit Test Engineering");
      expect((await f.backend.reportFile(f.job.id, "evidence/stack.html")).policy).toContain("sandbox");
      writeFileSync(join(reportRoot, "secret.txt"), "not in manifest");
      await expect(f.backend.reportFile(f.job.id, "secret.txt")).rejects.toThrow();
      for (const path of ["../state.db", "%2e%2e/state.db", "evidence/%252e%252e/state.db", "C:/file", "evidence\\stack.html"]) await expect(f.backend.reportFile(f.job.id, path)).rejects.toThrow();
      const original = readFileSync(join(reportRoot, "index.html")); writeFileSync(join(reportRoot, "index.html"), Buffer.concat([original, Buffer.from("tamper")]));
      await expect(f.backend.reportFile(f.job.id, "index.html")).rejects.toThrow(/doğrulan/);
    } finally { f.close(); }
  });
  it("keeps unknown counters unknown and excludes invalid coverage rows", async () => {
    const f = fixture();
    try {
      f.services.storage!.db.prepare("INSERT INTO coverage_snapshots(id,job_id,fqn,line_covered,line_missed,line_validity,branch_validity,before_after,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(),f.job.id,"example.Calc",0,0,"UNAVAILABLE","UNAVAILABLE","before",Date.now());
      const job = await f.backend.job(f.job.id, new URLSearchParams()) as { measurements: unknown[] };
      expect(job.measurements).toEqual([]);
    } finally { f.close(); }
  });
  it("supports stored canonical Windows roots under a nonempty allowlist", async () => {
    const f = fixture();
    try {
      f.services.config.allowed_project_roots = [f.project];
      expect(await f.backend.bootstrap()).toMatchObject({ projects: [expect.objectContaining({ project_root: expect.any(String) })] });
      expect(await f.backend.history(new URLSearchParams())).toMatchObject({ jobs: [expect.objectContaining({ id: f.job.id })] });
      expect(await f.backend.job(f.job.id, new URLSearchParams())).toMatchObject({ status: { job_id: f.job.id } });
    } finally { f.close(); }
  });
  it("projects actual baseline and final raw counters from a verified Report07 publication", async () => {
    const f = fixture();
    try {
      const data = report07Data(); data.job_id = f.job.id;
      data.stages = [{ name: "baseline", status: "KNOWN", run_id: "baseline-1", run_summary: { total: 1, passed: 1, failed: 0, skipped: 0 } }];
      const xml = '<report><package name="com/example"><class name="com/example/Calc"><counter type="LINE" covered="7" missed="3"/><counter type="BRANCH" covered="0" missed="0"/></class></package></report>';
      data.evidence = [{ relative_path: "evidence/baseline/jacoco.xml", module_path: "", kind: "jacoco_xml", stage: "baseline", run_id: "baseline-1", sha256: null, bytes: null }];
      new ReportExporter(join(f.root, "jobs", f.job.id, "reports")).export(data, { "evidence/baseline/jacoco.xml": xml });
      const value = await f.backend.job(f.job.id, new URLSearchParams()) as { measurements: { stage: string; line: { covered: number; missed: number; percent: number } }[] };
      expect(value.measurements).toMatchObject([{ stage: "before", line: { covered: 7, missed: 3, percent: 70 } }, { stage: "after", line: { covered: 9, missed: 1, percent: 90 } }]);
    } finally { f.close(); }
  });
});
