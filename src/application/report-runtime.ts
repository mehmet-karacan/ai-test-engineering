import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ReportExporter } from "../reporting/report-generator.js";
import type { Services } from "./services.js";
import type { JobRow } from "../storage/job-repository.js";
import { projectReportStatusFacts, type ReportStatusFacts } from "../reporting/report-projection.js";

/** Serialize cached projection writes with job finalization across MCP processes. */
export function verifyCurrentReport(services: Services, jobId: string): { missing: string[]; hash_mismatch: string[]; job?: JobRow; facts?: ReportStatusFacts | null } {
  const root = join(services.config.storage.root, "jobs", jobId, "reports");
  if (!existsSync(join(root, "PUBLISHED"))) return { missing: ["PUBLISHED"], hash_mismatch: [] };
  try {
    return services.storage!.db.transaction(() => {
      const job = services.jobs!.getJob(jobId);
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
