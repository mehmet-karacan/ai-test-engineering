import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync,readFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { report07Data,report07Evidence } from "../fixtures/report07-data.js";
import { projectReport07Facts,coverageFact,safeEvidenceHref,reportState,aggregateCoverage } from "../../src/reporting/report07-facts.js";
import { buildReport07 } from "../../src/reporting/report07-renderer.js";
import { ReportExporter } from "../../src/reporting/report-generator.js";
describe('Report07 exact facts and unknown semantics',()=>{
  it('does not round a threshold into success, or turn zero branches into 100%',()=>{
    const data=report07Data();expect(coverageFact(data.targets[0]!.line).met).toBe(false);
    expect(coverageFact(data.targets[0]!.branch).status).toBe('NOT_APPLICABLE');
    expect(coverageFact(null).status).toBe('UNAVAILABLE');
    expect(coverageFact({...data.targets[0]!.line!,total:11}).status).toBe('INVALID');
    expect(coverageFact({...data.targets[0]!.line!,bps:9999}).status).toBe('INVALID');
    expect(coverageFact({...data.targets[0]!.line!,validity:'OK'}).status).toBe('KNOWN');
    expect(coverageFact({...data.targets[0]!.branch!,validity:'UNAVAILABLE'}).status).toBe('UNAVAILABLE');
  });
  it('separates failure/error/skipped from verified matching-run XML; maps only exact test source class',()=>{
    const data=report07Data();const files=report07Evidence(data);const facts=projectReport07Facts(data,files);
    expect(facts.test_run).toEqual({status:'KNOWN',total:4,passed:1,failures:1,errors:1,skipped:1});
    expect(facts.tests.map(t=>t.status)).toEqual(['PASSED','FAILED','ERROR','SKIPPED']);
    expect(facts.tests[0]!.source_path).toContain('CalcTest.java');
    expect(facts.methods[0]).toMatchObject({fqn:'com.example.Calc',name:'calculate',line:{covered:9,total:10}});
    expect(facts.tests[0]).not.toHaveProperty('target_fqn');
    expect(facts.resume.status).toBe('UNAVAILABLE');
  });
  it('rejects partial, corrupt, foreign-run and byte-tampered evidence without synthesizing a passing run',()=>{
    for(const variant of ['partial','corrupt','foreign','tampered']){
      const data=report07Data();const files=report07Evidence(data);const key=Object.keys(files)[0]!;
      if(variant==='partial')data.run_summary.total=5;
      if(variant==='corrupt') { files[key]='<testsuite>'; data.evidence![0]!.sha256=createHash('sha256').update(files[key]!).digest('hex');data.evidence![0]!.bytes=files[key]!.length; }
      if(variant==='foreign') data.evidence![0]!.run_id='other-run';
      if(variant==='tampered')files[key]+='changed';
      expect(projectReport07Facts(data,files).test_run.status).not.toBe('KNOWN');
    }
  });
  it.each([['TARGET_REACHED','Hedefe ulaşıldı'],['TARGET_NOT_MET_BUDGET','İterasyon sınırı'],['TARGET_NOT_MET_PLATEAU','İlerleme durdu'],['INTERRUPTED','Kesildi'],['BASELINE_FAILED','Başlangıç koşusu başarısız'],['BLOCKED_ENVIRONMENT','Engellendi']])('maps %s from recorded codes', (code,label)=>{ expect(reportState({...report07Data(),outcome:code}).stop).toBe(label); });
  it('contains paths including encoded traversal, URL, fragment and drive forms',()=>{
    for(const path of ['../secret','%2e%2e/secret','C:/secret','//host/a','a#x','a?x','a\\b','a/%252e%252e/b','https://x'])expect(safeEvidenceHref(path)).toBeNull();
    expect(safeEvidenceHref('evidence/final/TEST-A.xml')).toBe('./evidence/final/TEST-A.xml');
  });
  it('weights aggregate counters and refuses overflow or unknown applicability',()=>{
    const first=report07Data().targets[0]!;
    const second={...first,line:{covered:0,missed:90,total:90,bps:0,target_bps:8000,met:false,validity:'OK'}};
    expect(aggregateCoverage([first,second],'line')).toMatchObject({covered:9,total:100,bps:900,met:false});
    expect(coverageFact({...first.branch!,validity:'UNKNOWN'}).status).toBe('INVALID');
    const huge={...first,line:{covered:Number.MAX_SAFE_INTEGER,missed:0,total:Number.MAX_SAFE_INTEGER,bps:10000,target_bps:8000,met:true,validity:'OK'}};
    expect(aggregateCoverage([huge,huge],'line').status).toBe('INVALID');
  });
  it('binds test source by module and FQN, refusing a foreign module source',()=>{
    const data=report07Data(),files=report07Evidence(data);
    data.evidence![0]!.module_path='b';data.evidence![2]!.module_path='a';
    expect(projectReport07Facts(data,files).tests[0]!.source_path).toBeNull();
  });
  it('projects measured baseline counters and an actual percentage point delta',()=>{
    const data=report07Data(),files=report07Evidence(data);
    const path='evidence/baseline/root/jacoco.xml';files[path]=files['evidence/final/jacoco.xml']!.replaceAll('missed="1" covered="9"','missed="3" covered="7"');
    data.stages!.unshift({name:'baseline',status:'KNOWN',run_id:'baseline-run',run_summary:{total:2,passed:2,failed:0,skipped:0}});
    data.evidence!.push({relative_path:path,kind:'jacoco_xml',module_path:'',stage:'baseline',run_id:'baseline-run',sha256:createHash('sha256').update(files[path]!).digest('hex'),bytes:Buffer.byteLength(files[path]!)});
    const facts=projectReport07Facts(data,files);data.report07=facts;
    expect(facts.coverage_history[0]).toMatchObject({stage:'baseline',line:{covered:7,total:10,bps:7000}});
    expect(buildReport07(data)).toContain('+20 puan');
  });
});
describe('Report07 production surfaces',()=>{
  it('uses the approved branding/layout and real project, without demo data or narrative',()=>{
    const data=report07Data();const files=report07Evidence(data);data.report07=projectReport07Facts(data,files);
    const html=buildReport07(data);
    for(const text of ['AI Unit Test Engineering','UNIT TEST &amp; COVERAGE REPORTING','Orion','01. Genel Durum','02. Sınıf ve Test İncelemesi','03. Kalite ve Güvence Kontrolleri','04. Çalışma Geçmişi','05. Kanıt ve Teknik Kayıtlar','İterasyon sınırı','Doğrulanmadı'])expect(html).toContain(text);
    expect(html).not.toMatch(/HakedisHesaplamaService|UT-SKY-001|preview-data|Revizyon|Prototype|[\u2013\u2014]/);
    expect(html).toContain("connect-src 'none'");expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('id="print-view"');expect(html).toContain('href="./report.json"');
  });
  it('exports the new production renderer and verified details while retaining legacy summary semantics',()=>{
    const root=mkdtempSync(join(tmpdir(),'report07-'));
    try{const data=report07Data();const files=report07Evidence(data);const result=new ReportExporter(root).export(data,files);expect(result.verification_passed).toBe(true);
      const json=JSON.parse(readFileSync(join(root,'report.json'),'utf8'));
      expect(json.run_summary.failed).toBe(2);expect(json.report07.test_run.errors).toBe(1);
      expect(readFileSync(join(root,'index.html'),'utf8')).toContain('data-report-template="report07"');
    }finally{rmSync(root,{recursive:true,force:true});}
  });
  it('does not leak forbidden narrative through a direct renderer or its JSON export payload',()=>{
    const data=report07Data();Object.assign(data,{model_review:'forbidden-model-opinion'});
    expect(buildReport07(data)).not.toContain('forbidden-model-opinion');
    expect((data as unknown as {model_review:string}).model_review).toBe('forbidden-model-opinion');
  });
});
