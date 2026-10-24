import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDefaultServicesForTest, handleTestStatus } from "../../src/application/services.js";
import { handleTestResult } from "../../src/application/job-tools.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { ReportExporter, type ReportData } from "../../src/reporting/report-generator.js";
import { CheckpointStore } from "../../src/orchestration/checkpoint-store.js";
import { Storage } from "../../src/storage/storage.js";

describe("published report runtime agrees with the authoritative job", () => {
  let root: string;
  let services: ReturnType<typeof createDefaultServicesForTest>;
  let jobId: string;
  let reportRoot: string;
  let exporter: ReportExporter;
  const binary = Buffer.from([0, 128, 255, 13, 10, 0]);
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aitest-runtime-sync-"));
    services = createDefaultServicesForTest(join(root, "state.db"), join(root, "runtime"));
    services.config.storage.root = join(root, "runtime");
    const {location} = new ProjectRepository(services.storage!.db).ensureLocation(root, "fixture", null);
    jobId = services.jobs!.createJob({locationId:location.id,requestDigest:"report-runtime"}).id;
    services.jobs!.updateLifecycle(jobId,"RUNNING",0);
    services.jobs!.updatePhase(jobId,"verification",1);
    reportRoot=join(services.config.storage.root,"jobs",jobId,"reports");
    exporter=new ReportExporter(reportRoot);
    const report:ReportData={schema_version:1,job_id:jobId,project_root:root,head_commit:"fixture",snapshot_id:"snapshot",outcome:"TARGET_REACHED",verification_scope:"AFFECTED_SCOPE",apply_state:"READY_FOR_REVIEW",runtime:{lifecycle:"RUNNING",phase:"verification",stop_code:"TARGET_REACHED",checkpoint_valid:true},targets:[],iterations:[],tests_added:2,tests_modified:0,run_summary:{total:7,passed:7,failed:0,skipped:0},gates:[{name:"test_only_policy",status:"PASSED",detail:"verified fixture"}],gaps:[],models:[],production_changed_files:0,generated_at:42};
    expect(exporter.export(report,{"evidence/bytes.bin":binary}).verification_passed).toBe(true);
  });
  afterEach(()=>{vi.restoreAllMocks();services.storage!.close();rmSync(root,{recursive:true,force:true});});
  function finish(lifecycle:"COMPLETED"|"FAILED"="COMPLETED") {
    services.jobs!.updateOutcome(jobId,lifecycle==="COMPLETED"?"TARGET_REACHED":"FINAL_VERIFICATION_FAILED",services.jobs!.getJob(jobId).row_version);
    services.jobs!.updateVerificationLevel(jobId,lifecycle==="COMPLETED"?"AFFECTED_SCOPE":"UNVERIFIED",services.jobs!.getJob(jobId).row_version);
    services.jobs!.updateLifecycle(jobId,lifecycle,services.jobs!.getJob(jobId).row_version);
  }
  const read=()=>JSON.parse(readFileSync(join(reportRoot,"report.json"),"utf8")) as ReportData;

  it.each(["status","result"])("refreshes an older successful report through %s without changing evidence",async tool=>{
    finish();
    const before=read();
    const result=tool==="status"?await handleTestStatus({job_id:jobId},services):await handleTestResult({job_id:jobId},services);
    const report=read();
    expect(result.lifecycle).toBe("COMPLETED");
    expect(report.runtime).toMatchObject({lifecycle:"COMPLETED",phase:"verification",stop_code:"TARGET_REACHED",checkpoint_valid:true});
    expect(report.apply_state).toBe("NOT_REQUESTED");
    expect(report.run_summary).toEqual(before.run_summary);
    expect(report.evidence).toEqual(before.evidence);
    expect(report.generated_at).toBe(42);
    expect(readFileSync(join(reportRoot,"evidence/bytes.bin"))).toEqual(binary);
    expect(readFileSync(join(reportRoot,"index.html"),"utf8")).toContain('class="meta-value">Tamamland\u0131</strong>');
    expect(exporter.verifyExport()).toEqual({missing:[],hash_mismatch:[]});
    const stable=readFileSync(join(reportRoot,"manifest.json"));
    await handleTestResult({job_id:jobId},services);
    expect(readFileSync(join(reportRoot,"manifest.json"))).toEqual(stable);
  });
  it("updates a failed job without promoting its verification or apply state",async()=>{
    finish("FAILED");await handleTestResult({job_id:jobId},services);
    expect(read()).toMatchObject({outcome:"FINAL_VERIFICATION_FAILED",verification_scope:"UNVERIFIED",apply_state:"NOT_REQUESTED",runtime:{lifecycle:"FAILED",stop_code:"FINAL_VERIFICATION_FAILED"}});
  });
  it("refreshes an actual apply state change while preserving the original counters",async()=>{
    finish();services.storage!.db.prepare("UPDATE test_jobs SET apply_state='APPLIED' WHERE id=?").run(jobId);
    await handleTestResult({job_id:jobId},services);
    expect(read().apply_state).toBe("APPLIED");
    expect(read().run_summary.total).toBe(7);
  });
  it.each(["corrupt","unpublished"])("never repairs %s evidence into a trusted publication",async kind=>{
    finish();
    if(kind==="corrupt")writeFileSync(join(reportRoot,"evidence/bytes.bin"),"tampered");
    else rmSync(join(reportRoot,"PUBLISHED"));
    const before=readFileSync(join(reportRoot,"report.json"));
    const result=await handleTestResult({job_id:jobId},services);
    expect(result.report_path).toBeNull();expect(result.report_facts).toBeNull();
    expect(readFileSync(join(reportRoot,"report.json"))).toEqual(before);
    expect(existsSync(join(reportRoot,"PUBLISHED"))).toBe(kind==="corrupt");
  });
  it.each(["status","result"])("keeps %s and report consistent when finalization wins the projection lock",async tool=>{
    const original=services.jobs!.getJob.bind(services.jobs!);let reads=0;
    vi.spyOn(services.jobs!,"getJob").mockImplementation(id=>{
      if(++reads===2)services.storage!.db.prepare("UPDATE test_jobs SET lifecycle='COMPLETED',outcome='TARGET_REACHED',verification_level='AFFECTED_SCOPE',row_version=row_version+1 WHERE id=?").run(id);
      return original(id);
    });
    const result=tool==="status"?await handleTestStatus({job_id:jobId},services):await handleTestResult({job_id:jobId},services);
    expect(read().runtime?.lifecycle).toBe("COMPLETED");
    expect(result.lifecycle).toBe("COMPLETED");
    expect(result.outcome).toBe(read().outcome);
  });
  it("revokes publication but preserves the completed job when cache writing fails",async()=>{
    finish();const before=services.jobs!.getJob(jobId);
    vi.spyOn(ReportExporter.prototype,"export").mockImplementation(()=>{throw new Error("fixture disk failure");});
    const result=await handleTestResult({job_id:jobId},services);
    expect(result.lifecycle).toBe("COMPLETED");expect(result.report_path).toBeNull();
    expect(result.report_facts).toBeNull();expect(existsSync(join(reportRoot,"PUBLISHED"))).toBe(false);
    expect(services.jobs!.getJob(jobId)).toEqual(before);
  });
  it.each(["status","result"])("does not advertise revoked publication after %s synchronization",async tool=>{
    const revoke=()=>{
      exporter.export({...read(),runtime:{lifecycle:"COMPLETED",phase:"verification",checkpoint_valid:null}});
      exporter.invalidatePublication();
    };
    if(tool==="result")vi.spyOn(CheckpointStore.prototype,"bestCheckpoint").mockImplementation(()=>{revoke();return null;});
    else {
      const original=services.jobs!.listEvents.bind(services.jobs!);
      vi.spyOn(services.jobs!,"listEvents").mockImplementation((...args)=>{revoke();return original(...args);});
    }
    const result=tool==="status"?await handleTestStatus({job_id:jobId},services):await handleTestResult({job_id:jobId},services);
    expect(existsSync(join(reportRoot,"PUBLISHED"))).toBe(false);
    expect(result.report_facts).toBeNull();
    if("report_path" in result)expect(result.report_path).toBeNull();
  });
  it("holds the job projection lock until the response is assembled",async()=>{
    finish();const second=new Storage({dbPath:join(root,"state.db")});
    second.db.pragma("busy_timeout = 1");
    try {
      vi.spyOn(CheckpointStore.prototype,"bestCheckpoint").mockImplementation(()=>{
        expect(()=>second.db.prepare("UPDATE test_jobs SET apply_state='APPLIED' WHERE id=?").run(jobId)).toThrow(/locked|busy/i);
        return null;
      });
      const result=await handleTestResult({job_id:jobId},services);
      expect(result.apply_state).toBe("NOT_REQUESTED");
      expect(second.db.prepare("UPDATE test_jobs SET apply_state='APPLIED' WHERE id=?").run(jobId).changes).toBe(1);
    } finally {second.close();}
  });
  it("does not re-bless evidence changed after its initial verification",async()=>{
    finish();const original=ReportExporter.prototype.verifyExport;let altered=false;
    vi.spyOn(ReportExporter.prototype,"verifyExport").mockImplementation(function(this:ReportExporter,...args){
      const result=original.apply(this,args);
      if(!altered){altered=true;writeFileSync(join(reportRoot,"evidence/bytes.bin"),"changed during refresh");}
      return result;
    });
    const before=readFileSync(join(reportRoot,"manifest.json"));
    const result=await handleTestResult({job_id:jobId},services);
    expect(result.report_path).toBeNull();expect(result.report_facts).toBeNull();
    expect(readFileSync(join(reportRoot,"manifest.json"))).toEqual(before);
  });
});
