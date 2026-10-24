import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ReportExporter, withJobRuntime, type ReportData } from "../reporting/report-generator.js";
import type { Services } from "./services.js";
import type { JobRow } from "../storage/job-repository.js";
import { projectReportStatusFacts, type ReportStatusFacts } from "../reporting/report-projection.js";

export interface PreparedReportVerification {
  jobId: string;
  manifest: Buffer;
  publication: Buffer;
  data: ReportData;
}

/** Expensive byte verification has no SQLite writer lock; no verification cache. */
export function prepareReportVerification(services: Services, jobId: string): PreparedReportVerification | undefined {
  const root = join(services.config.storage.root, "jobs", jobId, "reports");
  if (!existsSync(join(root, "PUBLISHED"))) return undefined;
  try {
    const manifest = readFileSync(join(root, "manifest.json"));
    const publication = readFileSync(join(root, "PUBLISHED"));
    const verified = new ReportExporter(root).verifyExport();
    if (verified.missing.length || verified.hash_mismatch.length) return undefined;
    const bytes = readFileSync(join(root, "report.json"));
    const artifacts = (JSON.parse(manifest.toString("utf8")) as {artifacts: Array<{relative_path:string;sha256:string;bytes:number}>}).artifacts;
    const report = artifacts.find(entry => entry.relative_path === "report.json");
    if (!report || report.bytes !== bytes.length || report.sha256 !== createHash("sha256").update(bytes).digest("hex")) return undefined;
    if (!manifest.equals(readFileSync(join(root, "manifest.json"))) || !publication.equals(readFileSync(join(root, "PUBLISHED")))) return undefined;
    const data = JSON.parse(bytes.toString("utf8")) as ReportData;
    if (data.job_id !== jobId) return undefined;
    return { jobId, manifest, publication, data };
  } catch { return undefined; }
}

/** Serialize projection writes and final response assembly with job finalization. */
export function verifyCurrentReport(services: Services, jobId: string, prepared?: PreparedReportVerification): { missing: string[]; hash_mismatch: string[]; job?: JobRow; facts?: ReportStatusFacts | null } {
  const root = join(services.config.storage.root, "jobs", jobId, "reports");
  if (!existsSync(join(root, "PUBLISHED"))) return { missing: ["PUBLISHED"], hash_mismatch: [] };
  try {
    return services.storage!.db.transaction(() => {
      const job = services.jobs!.getJob(jobId);
      // The enclosing response transaction now excludes heavy evidence I/O. A
      // concurrent publisher or state change invalidates this proof; refresh
      // remains on the original serialized, fully revalidated path.
      if (prepared?.jobId === jobId
        && prepared.manifest.equals(readFileSync(join(root, "manifest.json")))
        && prepared.publication.equals(readFileSync(join(root, "PUBLISHED")))) {
        const current = withJobRuntime(prepared.data, job);
        if (JSON.stringify(prepared.data.runtime) === JSON.stringify(current.runtime)
          && prepared.data.outcome === current.outcome && prepared.data.apply_state === current.apply_state
          && prepared.data.verification_scope === current.verification_scope) {
          return { missing: [], hash_mismatch: [], job, facts: projectReportStatusFacts(prepared.data, jobId) };
        }
      }
      const verified = new ReportExporter(root).synchronizeRuntime(job);
      const facts = verified.missing.length === 0 && verified.hash_mismatch.length === 0
        ? projectReportStatusFacts(JSON.parse(readFileSync(join(root, "report.json"), "utf8")), jobId) : null;
      return { ...verified, job, facts };
    }).immediate();
  } catch {
    process.stderr.write(`[aitest-report] job ${jobId} runtime projeksiyonu yenilenemedi\n`);
    return { missing: ["report runtime synchronization failed"], hash_mismatch: [] };
  }
}
