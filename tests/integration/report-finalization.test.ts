import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {mkdtempSync,rmSync,readFileSync,existsSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createDefaultServicesForTest} from "../../src/application/services.js";
import {ProjectRepository} from "../../src/storage/project-repository.js";
import {ReportExporter,type ReportData} from "../../src/reporting/report-generator.js";
import {publishFinalReport} from "../../src/orchestration/report-finalization.js";

describe("terminal report publication",()=>{
  let root:string;
  let services:ReturnType<typeof createDefaultServicesForTest>;
  let id:string;
  let exporter:ReportExporter;
  let reportRoot:string;
  let data:ReportData;
  beforeEach(()=>{
    root=mkdtempSync(join(tmpdir(),"aitest-final-report-"));
    services=createDefaultServicesForTest(join(root,"state.db"),join(root,"runtime"));
    const {location}=new ProjectRepository(services.storage!.db).ensureLocation(root,"fixture",null);
    id=services.jobs!.createJob({locationId:location.id,requestDigest:"final"}).id;
    services.jobs!.updateLifecycle(id,"RUNNING",0);
    reportRoot=join(root,"report");exporter=new ReportExporter(reportRoot);
    data={schema_version:1,job_id:id,project_root:root,head_commit:null,snapshot_id:null,outcome:"TARGET_REACHED",verification_scope:"AFFECTED_SCOPE",apply_state:"READY_FOR_REVIEW",runtime:{lifecycle:"RUNNING",phase:"reporting",checkpoint_valid:null},targets:[],iterations:[],tests_added:0,tests_modified:0,run_summary:{total:1,passed:1,failed:0,skipped:0},gates:[],gaps:[],models:[],production_changed_files:0,generated_at:42};
  });
  afterEach(()=>{vi.restoreAllMocks();services.storage!.close();rmSync(root,{recursive:true,force:true});});
  const publish=(outcome:"TARGET_REACHED"|"FINAL_VERIFICATION_FAILED"="TARGET_REACHED",assertLease=()=>{})=>publishFinalReport({services,jobId:id,exporter,data,outcome,extraFiles:{"evidence/raw.bin":Buffer.from([0,255])},assertLease});

  it.each(["TARGET_REACHED","FINAL_VERIFICATION_FAILED"] as const)("publishes %s using the actual terminal job state",outcome=>{
    const expected=outcome==="TARGET_REACHED"?"COMPLETED":"FAILED";
    const original=exporter.export.bind(exporter);
    vi.spyOn(exporter,"export").mockImplementation((report,extra)=>{
      expect(services.jobs!.getJob(id).lifecycle).toBe(expected);
      expect(report.runtime?.lifecycle).toBe(expected);
      expect(report.apply_state).toBe("NOT_REQUESTED");
      return original(report,extra);
    });
    expect(publish(outcome).verification_passed).toBe(true);
    const report=JSON.parse(readFileSync(join(reportRoot,"report.json"),"utf8"));
    const job=services.jobs!.getJob(id);
    expect(report.runtime).toMatchObject({lifecycle:job.lifecycle,phase:job.phase,stop_code:job.outcome});
    expect(report.verification_scope).toBe(job.verification_level);
    expect(exporter.verifyExport()).toEqual({missing:[],hash_mismatch:[]});
    expect(data.runtime?.lifecycle).toBe("RUNNING");
  });
  it("rolls back job and removes publication when SQL fails after successful export",()=>{
    const before=services.jobs!.getJob(id);const events=services.jobs!.listEvents(id);
    services.storage!.db.exec("CREATE TEMP TRIGGER reject_final_event BEFORE INSERT ON job_events WHEN NEW.event_type='verification_completed' BEGIN SELECT RAISE(ABORT,'fixture event failure'); END");
    expect(()=>publish()).toThrow("fixture event failure");
    expect(services.jobs!.getJob(id)).toEqual(before);
    expect(services.jobs!.listEvents(id)).toEqual(events);
    expect(existsSync(join(reportRoot,"PUBLISHED"))).toBe(false);
  });
  it("does not complete a job when export verification fails",()=>{
    const before=services.jobs!.getJob(id);
    const original=exporter.export.bind(exporter);
    vi.spyOn(exporter,"export").mockImplementation((report,extra)=>({...original(report,extra),verification_passed:false,missing_files:["fixture"]}));
    expect(()=>publish()).toThrow(/export/i);
    expect(services.jobs!.getJob(id)).toEqual(before);
    expect(existsSync(join(reportRoot,"PUBLISHED"))).toBe(false);
  });
  it.each(["PAUSED","CANCELLED"] as const)("never promotes a %s job",state=>{
    services.jobs!.updateLifecycle(id,state,services.jobs!.getJob(id).row_version);
    expect(()=>publish()).toThrow();
    expect(services.jobs!.getJob(id).lifecycle).toBe(state);
    expect(existsSync(join(reportRoot,"PUBLISHED"))).toBe(false);
  });
  it("rolls back and unpublishes if lease ownership is lost during export",()=>{
    const before=services.jobs!.getJob(id);let checks=0;
    expect(()=>publish("TARGET_REACHED",()=>{if(++checks===2)throw new Error("lease lost");})).toThrow("lease lost");
    expect(services.jobs!.getJob(id)).toEqual(before);
    expect(existsSync(join(reportRoot,"PUBLISHED"))).toBe(false);
  });
});
