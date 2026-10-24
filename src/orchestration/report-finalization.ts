import { AppError } from "../domain/errors.js";
import { verificationLevelForReport, type Outcome } from "../domain/job-state.js";
import { withJobRuntime, type ReportData, type ReportExporter, type ExportResult } from "../reporting/report-generator.js";
import type { Services } from "../application/services.js";

/** Publish from the actual terminal row; SQL failure revokes the file marker. */
export function publishFinalReport(input: {
  services: Services; jobId: string; exporter: ReportExporter; data: ReportData;
  outcome: Outcome; extraFiles: Record<string, string | Buffer>; assertLease: () => void;
}): ExportResult {
  const {storage,jobs}=input.services;
  if (!storage || !jobs) throw new AppError("INTERNAL_ERROR", "Report finalization requires storage");
  let attempted=false;
  try {
    return storage.db.transaction(()=>{
      input.assertLease();
      const current=jobs.getJob(input.jobId);
      if (current.lifecycle !== "RUNNING") throw new AppError("POLICY_VIOLATION", `Job ${current.lifecycle} olarak finalize edilemez`);
      const outcome=jobs.updateOutcome(current.id,input.outcome,current.row_version);
      const verification=jobs.updateVerificationLevel(current.id,verificationLevelForReport(input.outcome),outcome.row_version);
      const terminal=jobs.updateLifecycle(current.id,input.outcome==="FINAL_VERIFICATION_FAILED"?"FAILED":"COMPLETED",verification.row_version);
      attempted=true;
      const result=input.exporter.export(withJobRuntime(input.data,terminal),input.extraFiles);
      if (!result.verification_passed) throw new AppError("REPORT_EXPORT_FAILED","Rapor export dogrulamasi basarisiz",{
        missing_files:result.missing_files,hash_mismatch:result.hash_mismatch,
      });
      input.assertLease();
      jobs.appendEvent({job_id:current.id,event_type:"verification_completed",phase:"verification",origin:"JobDispatcher"});
      return result;
    }).immediate();
  } catch (error) {
    if (attempted) input.exporter.invalidatePublication();
    throw error;
  }
}
