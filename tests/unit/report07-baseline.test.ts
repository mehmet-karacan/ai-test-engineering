import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectReport07BaselineEvidence} from '../../src/reporting/report07-evidence.js';
it('freezes baseline XML only when its bytes match persisted run provenance',()=>{
  const root=mkdtempSync(join(tmpdir(),'report07-baseline-'));
  try{const path=join(root,'target/site/jacoco/jacoco.xml');mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,'<report/>');
    const input={workspace:root,module_paths:[''],run_id:'run-baseline',job_id:'job',stdout_log_path:join(root,'stdout.log'),stderr_log_path:join(root,'stderr.log'),expected_reports:[{path,sha256:createHash('sha256').update('<report/>').digest('hex')}]};
    expect(collectReport07BaselineEvidence(input).files[0]).toMatchObject({relative_path:'evidence/baseline/root/jacoco.xml',stage:'baseline',run_id:'run-baseline',module_path:''});
    input.expected_reports[0]!.sha256='0'.repeat(64);const bad=collectReport07BaselineEvidence(input);expect(bad.files).toHaveLength(0);expect(bad.missing[0]!.reason).toBe('BASELINE_JACOCO_HASH_MISMATCH');
  }finally{rmSync(root,{recursive:true,force:true});}
});
