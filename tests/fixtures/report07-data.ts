import { createHash } from "node:crypto";
import type { ReportData } from "../../src/reporting/report-generator.js";
export function report07Data(): ReportData {
  return { schema_version:1, job_id:"report07-fixture", project_root:"C:/work/Orion", head_commit:"abc123", snapshot_id:"snapshot1",
    outcome:"TARGET_NOT_MET_BUDGET", verification_scope:"AFFECTED_SCOPE", apply_state:"NOT_REQUESTED",
    targets:[{target_id:"t1",module_path:"",selector:"Calc",fqn:"com.example.Calc",line:{covered:9,missed:1,total:10,bps:9000,target_bps:9001,met:false,validity:"VALID"},branch:{covered:0,missed:0,total:0,bps:0,target_bps:8000,met:false,validity:"NOT_APPLICABLE"}}],
    iterations:[{ordinal:1,strategy:"worker_candidate",decision:"adopted",reason:"COVERAGE_IMPROVED",coverage_before_bps:7000,coverage_after_bps:9000}],
    tests_added:1,tests_modified:0,run_summary:{total:4,passed:1,failed:2,skipped:1},
    gates:[{name:"test_only_policy",status:"NOT_RUN",detail:"No final comparison"}],gaps:[],models:[],production_changed_files:0,generated_at:1792450000000,
    final_run_id:"run-final",checkpoint_id:null,stages:[{name:"final",status:"KNOWN",run_id:"run-final",run_summary:{total:4,passed:1,failed:2,skipped:1}}] };
}
export function report07Evidence(data: ReportData) {
  const files: Record<string,string>={
    "evidence/final/TEST-CalcTest.xml":`<testsuite tests="4" failures="1" errors="1" skipped="1"><testcase classname="com.example.CalcTest" name="ok" time="0.01"/><testcase classname="com.example.CalcTest" name="bad"><failure message="expected 2">stack &lt;script&gt;alert(1)&lt;/script&gt;</failure></testcase><testcase classname="com.example.CalcTest" name="broken"><error message="boom">trace</error></testcase><testcase classname="com.example.CalcTest" name="ignored"><skipped/></testcase></testsuite>`,
    "evidence/final/jacoco.xml":`<report name="fixture"><package name="com/example"><class name="com/example/Calc" sourcefilename="Calc.java"><method name="calculate" desc="(I)I"><counter type="LINE" missed="1" covered="9"/><counter type="BRANCH" missed="0" covered="0"/></method><counter type="LINE" missed="1" covered="9"/><counter type="BRANCH" missed="0" covered="0"/></class></package></report>`,
    "evidence/accepted/src/test/java/com/example/CalcTest.java":"package com.example; public class CalcTest { @Test void ok(){ assertEquals(2, 1+1); } }",
  };
  data.evidence=Object.entries(files).map(([relative_path,content])=>({relative_path,module_path:'',kind:relative_path.endsWith('.java')?'accepted_source':relative_path.includes('TEST-')?'surefire_xml':'jacoco_xml',stage:'final',run_id:relative_path.endsWith('.java')?null:'run-final',sha256:createHash('sha256').update(content).digest('hex'),bytes:Buffer.byteLength(content)}));
  return files;
}
