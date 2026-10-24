/** Freeze the existing baseline measurement before any candidate execution. */
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {collectFinalReplayEvidence,type FinalReplayEvidence} from './evidence-collector.js';
export function collectReport07BaselineEvidence(input:Parameters<typeof collectFinalReplayEvidence>[0]&{expected_reports:Array<{path:string;sha256:string|null}>}):FinalReplayEvidence {
  const collected=collectFinalReplayEvidence({...input,jacoco_xml_only:true}),result:FinalReplayEvidence={files:[],missing:[]};
  for(const file of collected.files.filter(f=>f.kind==='jacoco_xml')) {
    const modules=input.module_paths.filter(module=>file.relative_path===`evidence/final-replay/${module||'root'}/jacoco.xml`);
    const module=modules.length===1?modules[0]:undefined;
    const expected=module===undefined?undefined:input.expected_reports.find(r=>resolve(r.path).toLowerCase()===resolve(join(input.workspace,module,'target/site/jacoco/jacoco.xml')).toLowerCase());
    const destination=file.relative_path.replace('evidence/final-replay/','evidence/baseline/');
    if(module===undefined||!expected?.sha256||createHash('sha256').update(file.content).digest('hex')!==expected.sha256) {
      result.missing.push({relative_path:destination,kind:'jacoco_xml',reason:'BASELINE_JACOCO_HASH_MISMATCH',required:true});continue;
    }
    result.files.push({...file,relative_path:destination,module_path:module,stage:'baseline'});
  }
  result.missing.push(...collected.missing.filter(m=>m.kind==='jacoco_xml').map(m=>({...m,relative_path:m.relative_path.replace('evidence/final-replay/','evidence/baseline/')})));
  return result;
}
