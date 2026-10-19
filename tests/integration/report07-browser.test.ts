import { describe,expect,it } from 'vitest';
import { spawnSync } from 'node:child_process';
// Explicit optional tooling; the acceptance run supplies the installed package directory.
describe.skipIf(!process.env.AITEST_BROWSER_PACKAGES)('Report07 real Chromium UI acceptance',()=>{
  it('validates interaction, responsive layout, print, export, XSS and 500/10000 pagination',()=>{
    const result=spawnSync(process.execPath,['scripts/report07-browser-smoke.mjs'],{cwd:process.cwd(),encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,AITEST_REPORT07_UI_OUTPUT:''}});
    expect(result.status,result.stderr+'\n'+result.stdout).toBe(0);
    expect(result.stdout).toContain('"status":"PASS"');
  },125000);
});
