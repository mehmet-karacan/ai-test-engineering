/** Report07 projections from the export's verified byte snapshot. No model narrative. */
import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { ReportData, ReportTarget } from "./report-generator.js";
import { isTestSourcePath } from "./report-projection.js";

export type FactStatus = "KNOWN" | "UNAVAILABLE" | "INVALID" | "NOT_APPLICABLE" | "NOT_RUN";
export interface CoverageFact { status: FactStatus; covered: number | null; missed: number | null; total: number | null; bps: number | null; target_bps: number | null; met: boolean | null }
export interface TestRecord { id:string; module_path:string|null; class_name:string; name:string; status:"PASSED"|"FAILED"|"ERROR"|"SKIPPED"; duration_seconds:number|null; message:string|null; trace:string|null; evidence_path:string; source_path:string|null }
export interface MethodRecord { fqn:string; module_path:string|null; name:string; descriptor:string|null; line:CoverageFact; branch:CoverageFact; evidence_path:string }
export interface Report07Facts {
  schema_version:1;
  test_run:{status:FactStatus; total:number|null; passed:number|null; failures:number|null; errors:number|null; skipped:number|null};
  tests:TestRecord[]; methods:MethodRecord[];
  sources:Array<{path:string; module_path:string|null; class_name:string|null; preview:string; truncated:boolean}>;
  coverage_history:Array<{stage:'baseline'|'final';run_id:string;line:CoverageFact;branch:CoverageFact}>;
  verified_artifacts:string[];
  changes:{status:FactStatus;added:number|null;modified:number|null};
  diagnostics:string[];
  resume:{status:"UNAVAILABLE"; checkpoint_valid:boolean|null};
}
const integer=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
export function coverageFact(value: ReportTarget["line"]):CoverageFact {
  const empty={covered:null,missed:null,total:null,bps:null,target_bps:null,met:null};
  if(!value)return {status:"UNAVAILABLE",...empty};
  if(value.validity==='UNAVAILABLE')return {status:'UNAVAILABLE',...empty};
  if(value.validity==='INVALID_COVERAGE_EVIDENCE')return {status:'INVALID',...empty};
  if(!['OK','VALID','KNOWN','NOT_APPLICABLE'].includes(value.validity))return {status:'INVALID',...empty};
  if(![value.covered,value.missed,value.total,value.bps,value.target_bps].every(integer)||value.total!==value.covered+value.missed||value.bps>10000||value.target_bps>10000)return {status:"INVALID",...empty};
  if(value.total===0)return {status:"NOT_APPLICABLE",...empty,covered:0,missed:0,total:0,target_bps:value.target_bps};
  if(value.validity==='NOT_APPLICABLE'||value.bps!==Number(BigInt(value.covered)*10000n/BigInt(value.total)))return {status:"INVALID",...empty};
  return {status:"KNOWN",covered:value.covered,missed:value.missed,total:value.total,bps:value.bps,target_bps:value.target_bps,met:BigInt(value.covered)*10000n>=BigInt(value.total)*BigInt(value.target_bps)};
}
export function aggregateCoverage(targets:ReportTarget[],kind:'line'|'branch'):CoverageFact {
  const values=targets.map(t=>coverageFact(t[kind]));
  if(!values.length||values.some(v=>v.status==='UNAVAILABLE'))return coverageFact(null);
  if(values.some(v=>v.status==='INVALID'))return {...coverageFact(null),status:'INVALID'};
  const covered=values.reduce((s,v)=>s+(v.covered??0),0),missed=values.reduce((s,v)=>s+(v.missed??0),0),total=covered+missed;
  if(![covered,missed,total].every(integer))return {...coverageFact(null),status:'INVALID'};
  // Overall threshold is per class, never an arithmetic average of percentages.
  return {status:total===0?'NOT_APPLICABLE':'KNOWN',covered,missed,total,bps:total?Number(BigInt(covered)*10000n/BigInt(total)):null,target_bps:null,met:values.some(v=>v.met===false)?false:total?true:null};
}
export function safeEvidenceHref(path:string):string|null {
  // Percent escapes are rejected rather than decoded twice by a browser/file server.
  if(!path||/[\\:%?#]/u.test(path)||[...path].some(c=>c.charCodeAt(0)<=32)||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'||p.endsWith('.')))return null;
  return './'+path.split('/').map(encodeURIComponent).join('/');
}
const stops:Record<string,string>={TARGET_REACHED:'Hedefe ulaşıldı',TARGET_ALREADY_MET:'Hedef zaten sağlanıyordu',TARGET_NOT_MET_BUDGET:'İterasyon sınırı',TARGET_NOT_MET_PLATEAU:'İlerleme durdu',INTERRUPTED:'Kesildi',PAUSED:'Duraklatıldı',CANCELLED:'İptal edildi',BASELINE_FAILED:'Başlangıç koşusu başarısız',FINAL_VERIFICATION_FAILED:'Son doğrulama başarısız',INVALID_COVERAGE_EVIDENCE:'Kapsam kanıtı geçersiz',SOURCE_CHANGED:'Kaynak değişti',QUALITY_REVIEW_REQUIRED:'Kalite incelemesi gerekiyor',COVERAGE_ANALYZED:'Sınıf seçimi bekleniyor'};
export function reportState(data:ReportData) {
  const code=data.runtime?.stop_code??data.outcome;
  const stop=stops[code]??(/BLOCKED/.test(code)?'Engellendi':/FAILED|INVALID|POLICY/.test(code)?'Başarısız':'Veri yok');
  const lifecycle=data.runtime?.lifecycle;
  const labels:Record<string,string>={QUEUED:'Sırada',RUNNING:'Çalışıyor',WAITING_INPUT:'Seçim bekleniyor',PAUSED:'Duraklatıldı',INTERRUPTED:'Kesildi',COMPLETED:'Tamamlandı',FAILED:'Başarısız',CANCELLED:'İptal edildi'};
  const accepted=data.iterations.filter(i=>/^adopted|accepted$/i.test(i.decision)&&i.coverage_after_bps!==null).map(i=>i.ordinal);
  return {stop,code,lifecycle:lifecycle?labels[lifecycle]??'Veri yok':'Veri yok',last_verified_iteration:accepted.length?Math.max(...accepted):null};
}
type XmlNode=Record<string,unknown>;
const arr=(v:unknown):XmlNode[]=>v===undefined?[]:Array.isArray(v)?v as XmlNode[]:[v as XmlNode];
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false,processEntities:true,trimValues:false});
function xml(bytes:Buffer):XmlNode {
  const text=bytes.toString('utf8');
  if(bytes.length>16*1024*1024||XMLValidator.validate(text)!==true||/<!ENTITY/i.test(text))throw Error('INVALID_XML');
  return parser.parse(text) as XmlNode;
}
function numberAttribute(node:XmlNode,name:string):number {
  const value=String(node['@_'+name]??'');if(!/^\d+$/.test(value)||!integer(Number(value)))throw Error('INVALID_COUNTER');return Number(value);
}
function textNode(value:unknown):string|null {
  if(typeof value==='string')return value;
  if(value&&typeof value==='object')return String((value as XmlNode)['#text']??'');
  return null;
}
function metric(node:XmlNode,kind:string):CoverageFact {
  const counters=arr(node.counter).filter(c=>c['@_type']===kind);
  if(counters.length!==1)return {...coverageFact(null),status:counters.length?'INVALID':'UNAVAILABLE'};
  const covered=numberAttribute(counters[0]!,'covered'),missed=numberAttribute(counters[0]!,'missed'),total=covered+missed;
  return coverageFact({covered,missed,total,bps:total?Math.floor(covered*10000/total):0,target_bps:0,met:false,validity:'VALID'});
}
function evidenceModule(entry:NonNullable<ReportData['evidence']>[number],data:ReportData):string|null {
  if(entry.module_path!==undefined)return entry.module_path;
  const match=entry.relative_path.match(/^evidence\/(?:final-replay|baseline)\/(.+)\/(?:jacoco\.xml|surefire\/|failsafe\/)/);
  if(match){if(match[1]==='root')return data.targets.some(t=>t.module_path==='root')?null:'';return match[1]!;}
  const accepted=entry.relative_path.match(/^evidence\/accepted\/(?:(.+)\/)?src\/(?:test|it|integration-test)\//);
  return accepted?accepted[1]??'':null;
}
function asTargetMetric(fact:CoverageFact,targetBps:number):ReportTarget['line'] {
  if(fact.status!=='KNOWN'&&fact.status!=='NOT_APPLICABLE')return null;
  return {covered:fact.covered!,missed:fact.missed!,total:fact.total!,bps:fact.bps??0,target_bps:targetBps,met:false,validity:fact.status==='KNOWN'?'OK':'NOT_APPLICABLE'};
}
/** Extra files and evidence metadata must describe exactly the same content/run. */
export function projectReport07Facts(data:ReportData,extraFiles:Record<string,string|Buffer>={}):Report07Facts {
  const facts:Report07Facts={schema_version:1,test_run:{status:'UNAVAILABLE',total:null,passed:null,failures:null,errors:null,skipped:null},tests:[],methods:[],sources:[],coverage_history:[],verified_artifacts:[],changes:{status:'UNAVAILABLE',added:null,modified:null},diagnostics:[],resume:{status:'UNAVAILABLE',checkpoint_valid:data.runtime?.checkpoint_valid??null}};
  const records:Array<{entry:NonNullable<ReportData['evidence']>[number];bytes:Buffer}>=[];
  for(const entry of data.evidence??[]) {
    const content=extraFiles[entry.relative_path];const bytes=content===undefined?null:Buffer.isBuffer(content)?content:Buffer.from(content);
    if(!safeEvidenceHref(entry.relative_path)||!bytes||entry.bytes!==bytes.length||entry.sha256!==createHash('sha256').update(bytes).digest('hex')){facts.diagnostics.push('UNVERIFIED_ARTIFACT:'+entry.relative_path);continue;}
    records.push({entry,bytes});
    facts.verified_artifacts.push(entry.relative_path);
  }
  const patches=records.filter(r=>r.entry.kind==='patch'&&r.entry.relative_path.endsWith('.json'));
  for(const {bytes} of patches)try {
    const patch=JSON.parse(bytes.toString('utf8')) as {job_id:string;checkpoint_id:string|null;files:Array<{path:string;action:string}>};
    if(patch.job_id!==data.job_id||patch.checkpoint_id!==data.checkpoint_id||!Array.isArray(patch.files))throw Error('PATCH_IDENTITY');
    let added=0,modified=0;
    for(const file of patch.files) {
      if(!safeEvidenceHref(file.path)||!['create','modify','delete'].includes(file.action))throw Error('PATCH_PATH');
      if(isTestSourcePath(file.path)){if(file.action==='create')added++;else modified++;}
    }
    if(added!==data.tests_added||modified!==data.tests_modified)throw Error('PATCH_COUNTERS');
    facts.changes={status:'KNOWN',added,modified};
  }catch{facts.changes={status:'INVALID',added:null,modified:null};facts.diagnostics.push('INVALID_ACCEPTED_PATCH');}
  if(!patches.length&&data.tests_added===0&&data.tests_modified===0&&data.gates.some(g=>g.name==='test_only_policy'&&g.status==='PASSED'))facts.changes={status:'KNOWN',added:0,modified:0};
  let sourceBudget=1024*1024;
  for(const {entry,bytes} of records.filter(r=>r.entry.kind==='accepted_source'&&/\.java$/i.test(r.entry.relative_path))) {
    const source=bytes.toString('utf8');
    // Comments, literals and Java unicode preprocessing cannot establish identity.
    const declarations=source.replace(/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,' ');
    const pkg=declarations.match(/\bpackage\s+([\w.]+)\s*;/)?.[1],name=declarations.match(/\b(?:class|interface|enum|record)\s+(\w+)/)?.[1];
    const identity=name&&!/\\u[0-9a-f]{4}/i.test(source)&&(entry.relative_path.endsWith('/'+name+'.java'))?(pkg?pkg+'.':'')+name:null;
    const limit=Math.min(32000,Math.max(0,sourceBudget));sourceBudget-=Math.min(source.length,limit);
    facts.sources.push({path:entry.relative_path,module_path:evidenceModule(entry,data),class_name:identity,preview:source.slice(0,limit),truncated:source.length>limit});
  }
  const runRecords=records.filter(r=>['surefire_xml','failsafe_xml'].includes(r.entry.kind)&&!!data.final_run_id&&r.entry.run_id===data.final_run_id);
  let invalid=false;const totals={total:0,passed:0,failures:0,errors:0,skipped:0};
  for(const {entry,bytes} of runRecords) {
    try {
      const root=xml(bytes),suites=arr(root.testsuite??(root.testsuites as XmlNode|undefined)?.testsuite);
      if(!suites.length)throw Error('NO_TEST_SUITE');
      for(const suite of suites) {
        const total=numberAttribute(suite,'tests'),failures=numberAttribute(suite,'failures'),errors=numberAttribute(suite,'errors'),skipped=numberAttribute(suite,'skipped');
        const cases=arr(suite.testcase);
        const actual={failures:0,errors:0,skipped:0};const parsed:TestRecord[]=[];
        for(const tc of cases) {
          const failed=tc.failure!==undefined,errored=tc.error!==undefined,skip=tc.skipped!==undefined;
          if(Number(failed)+Number(errored)+Number(skip)>1)throw Error('CONFLICTING_TEST_RESULT');
          if(failed)actual.failures++;if(errored)actual.errors++;if(skip)actual.skipped++;
          const className=String(tc['@_classname']??suite['@_name']??''),name=String(tc['@_name']??'');
          if(!className||!name)throw Error('MISSING_TEST_IDENTITY');
          const detail=arr(tc.failure??tc.error??tc.skipped)[0];
          const duration=tc['@_time']===undefined?null:Number(tc['@_time']);
          const modulePath=evidenceModule(entry,data);
          const sources=facts.sources.filter(s=>modulePath!==null&&s.module_path===modulePath&&s.class_name===className);
          parsed.push({id:entry.relative_path+':'+(facts.tests.length+parsed.length),module_path:modulePath,class_name:className,name,status:errored?'ERROR':failed?'FAILED':skip?'SKIPPED':'PASSED',duration_seconds:duration!==null&&Number.isFinite(duration)&&duration>=0?duration:null,
            message:detail?.['@_message']===undefined?null:String(detail['@_message']).slice(0,4000),trace:textNode(tc.failure??tc.error)?.slice(0,16000)??null,evidence_path:entry.relative_path,source_path:sources.length===1?sources[0]!.path:null});
        }
        if(total!==cases.length||failures!==actual.failures||errors!==actual.errors||skipped!==actual.skipped||total<failures+errors+skipped)throw Error('TEST_SUITE_COUNTER_MISMATCH');
        facts.tests.push(...parsed);totals.total+=total;totals.failures+=failures;totals.errors+=errors;totals.skipped+=skipped;totals.passed+=total-failures-errors-skipped;
      }
    }catch {invalid=true;facts.diagnostics.push('INVALID_TEST_REPORT:'+entry.relative_path);}
  }
  const expected=data.run_summary;
  const matching=runRecords.length>0&&Object.values(expected).every(integer)&&totals.total===expected.total&&totals.passed===expected.passed&&totals.failures+totals.errors===expected.failed&&totals.skipped===expected.skipped&&totals.total===totals.passed+totals.failures+totals.errors+totals.skipped;
  const missingRequired=(data.evidence??[]).some(e=>e.required&&['surefire_xml','failsafe_xml'].includes(e.kind)&&!runRecords.some(r=>r.entry.relative_path===e.relative_path));
  if(!invalid&&matching&&!missingRequired)facts.test_run={status:'KNOWN',...totals};
  else if(runRecords.length||missingRequired){facts.test_run.status='INVALID';facts.diagnostics.push('TEST_RUN_RECONCILIATION_FAILED');}
  // Partial files remain individually inspectable; they never establish a passing aggregate.
  const seen=new Set<string>(),ambiguous=new Set<string>();
  for(const {entry,bytes} of records.filter(r=>r.entry.kind==='jacoco_xml'&&!!data.final_run_id&&r.entry.run_id===data.final_run_id)) {
    try {
      const root=xml(bytes);if(!root.report)throw Error('NO_JACOCO_REPORT');
      for(const pkg of arr((root.report as XmlNode).package))for(const cls of arr(pkg.class)) {
        const fqn=String(cls['@_name']??'').replace(/\//g,'.'),modulePath=evidenceModule(entry,data);
        const candidates=data.targets.filter(t=>t.fqn===fqn&&(t.module_path===undefined||t.module_path===modulePath));const target=candidates.length===1?candidates[0]:undefined;if(!target)continue;
        const key=String(modulePath)+'\0'+fqn;
        if(seen.has(key)){ambiguous.add(key);continue;}seen.add(key);
        const line=metric(cls,'LINE'),branch=metric(cls,'BRANCH');
        for(const [kind,value] of [['line',line],['branch',branch]] as const) {const declared=coverageFact(target[kind]);if(value.covered!==declared.covered||value.missed!==declared.missed)throw Error('TARGET_COUNTER_MISMATCH');}
        for(const method of arr(cls.method))facts.methods.push({fqn,module_path:modulePath,name:String(method['@_name']??''),descriptor:method['@_desc']===undefined?null:String(method['@_desc']),line:metric(method,'LINE'),branch:metric(method,'BRANCH'),evidence_path:entry.relative_path});
      }
    }catch {facts.diagnostics.push('INVALID_JACOCO_DETAILS:'+entry.relative_path);}
  }
  if(ambiguous.size){facts.methods=facts.methods.filter(m=>!ambiguous.has(String(m.module_path)+'\0'+m.fqn));facts.diagnostics.push('AMBIGUOUS_METHOD_CLASS_IDENTITY');}
  const baselineRun=data.stages?.find(s=>s.name==='baseline'&&s.status==='KNOWN')?.run_id;
  if(baselineRun) {
    const baselineTargets=data.targets.map(target=>({...target,line:null as ReportTarget['line'],branch:null as ReportTarget['branch']}));
    const baselineSeen=new Set<number>();let baselineInvalid=false;
    for(const {entry,bytes} of records.filter(r=>r.entry.kind==='jacoco_xml'&&r.entry.stage==='baseline'&&r.entry.run_id===baselineRun))try {
      const root=xml(bytes);if(!root.report)throw Error('INVALID_BASELINE_XML');
      const modulePath=evidenceModule(entry,data);
      for(const pkg of arr((root.report as XmlNode).package))for(const cls of arr(pkg.class)) {
        const fqn=String(cls['@_name']??'').replace(/\//g,'.');
        const matches=baselineTargets.map((t,i)=>({t,i})).filter(({t})=>t.fqn===fqn&&(t.module_path===undefined||t.module_path===modulePath));
        if(matches.length!==1)continue;const {t,i}=matches[0]!;if(baselineSeen.has(i))throw Error('DUPLICATE_BASELINE_CLASS');baselineSeen.add(i);
        t.line=asTargetMetric(metric(cls,'LINE'),data.targets[i]!.line?.target_bps??0);t.branch=asTargetMetric(metric(cls,'BRANCH'),data.targets[i]!.branch?.target_bps??0);
      }
    }catch{baselineInvalid=true;facts.diagnostics.push('INVALID_BASELINE_COVERAGE:'+entry.relative_path);}
    if(!baselineInvalid&&baselineSeen.size===data.targets.length&&data.targets.length)facts.coverage_history.push({stage:'baseline',run_id:baselineRun,line:aggregateCoverage(baselineTargets,'line'),branch:aggregateCoverage(baselineTargets,'branch')});
  }
  if(data.final_run_id)facts.coverage_history.push({stage:'final',run_id:data.final_run_id,line:aggregateCoverage(data.targets,'line'),branch:aggregateCoverage(data.targets,'branch')});
  return facts;
}
