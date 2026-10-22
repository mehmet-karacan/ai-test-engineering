/** Synthetic UI acceptance, no customer/model execution. Requires an explicit Playwright package directory. */
/* global document, window, innerWidth */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ReportExporter } from '../dist/reporting/report-generator.js';
import { INNOVA_LOGO_SHA256 } from '../dist/branding/innova.js';
const packages=process.env.AITEST_BROWSER_PACKAGES;
if(!packages)throw Error('NOT_RUN: AITEST_BROWSER_PACKAGES must identify the installed Playwright node_modules directory');
const {chromium}=createRequire(import.meta.url)(join(packages,'playwright'));
const output=process.env.AITEST_REPORT07_UI_OUTPUT?resolve(process.env.AITEST_REPORT07_UI_OUTPUT):mkdtempSync(join(tmpdir(),'report07-browser-'));
mkdirSync(output,{recursive:true});
const {report07Data,report07Evidence}=await import(pathToFileURL(resolve('tests/fixtures/report07-data.ts')).href);
const data=report07Data(),files=report07Evidence(data);
const testXml=Object.keys(files).find(path=>path.includes('TEST-'));
files[testXml]=files[testXml].replace('stack &lt;script&gt;alert(1)&lt;/script&gt;','stack line\n'.repeat(4000));
data.runtime={lifecycle:'COMPLETED',phase:'reporting',checkpoint_valid:null,stop_code:data.outcome};
// More than one page, long strings and deliberate XSS payloads are fixture inputs.
for(let i=1;i<8;i++)data.targets.push({...structuredClone(data.targets[0]),target_id:'t'+i,fqn:'com.example.'+'LongClassName'.repeat(5)+i,module_path:i%2?'module-a':'module-b'});
for(let i=2;i<=9;i++)data.iterations.push({...data.iterations[0],ordinal:i});
const reportDir=join(output,'report');
assert.equal(new ReportExporter(reportDir).export(data,files).verification_passed,true);
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1080}});
const errors=[],external=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
const url=pathToFileURL(join(reportDir,'index.html')).href;
try {
 await page.goto(url);await page.locator('[data-class="0"]').waitFor();
 const officialLogo=await page.locator('img.logo').evaluate(node=>({src:node.src,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}));
 assert.equal(createHash('sha256').update(Buffer.from(officialLogo.src.split(',')[1],'base64')).digest('hex'),INNOVA_LOGO_SHA256);
 assert.ok(officialLogo.height>=25&&Math.abs(officialLogo.width/officialLogo.height-825.84/157.13)<.01);
 assert.equal(await page.locator('#class-list [data-class]').count(),3);
 assert.equal(await page.locator('#detail-region [data-test-id]').count(),4);
 assert.equal(await page.locator('#history-region tbody tr').count(),3);
 await page.locator('[data-next="history"]').click();
 await page.locator('[data-stage-select="final"]').click();
 assert.equal(await page.locator('#history-region tr[data-stage="final"]').count(),1);
 assert.equal(await page.locator('#history-region tr[data-stage="final"]').evaluate(el=>el.classList.contains('active')),true);
 await page.screenshot({path:join(output,'desktop.png'),fullPage:true});
 await page.locator('[data-next="classes"]').click();assert.equal(await page.locator('#class-list [data-class="3"]').count(),1);
 await page.locator('#class-search').fill('Calc');assert.equal(await page.locator('#class-list [data-class]').count(),1);
 await page.locator('#class-search').fill('no-matching-class');assert.equal(await page.locator('#class-list [data-class]').count(),0);assert.match(await page.locator('#selected-detail').innerText(),/bulunamadı/);
 await page.locator('#class-search').fill('Calc');
 await page.locator('[data-tab="methods"]').click();assert.match(await page.locator('#detail-region').innerText(),/calculate/);
 await page.locator('[data-tab="methods"]').press('ArrowRight');assert.equal(await page.locator('[data-tab="quality"]').getAttribute('aria-selected'),'true');
 await page.locator('[data-tab="tests"]').click();
 await page.locator('[data-test-id]').nth(1).click();assert.equal(await page.locator('#test-dialog').evaluate(el=>el.open),true);
 assert.match(await page.locator('#dialog-trace').innerText(),/stack/);assert.match(await page.locator('#dialog-source').innerText(),/assertEquals/);
 assert.match(await page.locator('#dialog-trace-note').innerText(),/Önizleme sınırlandı/);
 await page.screenshot({path:join(output,'test-dialog.png')});await page.keyboard.press('Escape');
 assert.equal(await page.locator('#test-dialog').evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-test-id')),true);
 const download=page.waitForEvent('download');await page.locator('#export-btn').click();const artifact=await download;const downloaded=await artifact.path();assert.equal(readFileSync(downloaded,'utf8'),readFileSync(join(reportDir,'report.json'),'utf8'));
 await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.equal(await page.locator('#print-records [data-test-id]').count(),4);assert.match(await page.locator('#print-records').innerText(),/İterasyon 9/);
 await page.pdf({path:join(output,'report.pdf'),format:'A4',printBackground:true});assert.ok(statSync(join(output,'report.pdf')).size>2000);
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
 for(const width of [768,390]) {await page.setViewportSize({width,height:1000});await page.screenshot({path:join(output,width===390?'mobile.png':'tablet.png'),fullPage:true});const sizes=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(sizes.scroll<=sizes.width+1,JSON.stringify(sizes));}
 // No-JS summary and honest print scope remain present.
 const noJs=await browser.newContext({javaScriptEnabled:false});const staticPage=await noJs.newPage();await staticPage.goto(url);assert.match(await staticPage.locator('#overview').innerText(),/İterasyon sınırı/);assert.match(await staticPage.locator('#print-scope').textContent(),/JavaScript kapalıysa/);await noJs.close();
 // Large synthetic export: real XML counters and complete case inventory, bounded initial DOM.
 const large=report07Data();large.targets=Array.from({length:500},(_,i)=>({...structuredClone(large.targets[0]),target_id:'target'+i,fqn:'p.Class'+i}));
 large.iterations=Array.from({length:600},(_,i)=>({...large.iterations[0],ordinal:i+1}));
 large.run_summary={total:10000,passed:10000,failed:0,skipped:0};
 large.evidence=[{relative_path:'evidence/TEST-Large.xml',kind:'surefire_xml',run_id:'run-final',stage:'final'}];
 const cases=Array.from({length:10000},(_,i)=>`<testcase classname="p.LargeTest" name="case${i===0?'&lt;img src=x onerror=alert(1)&gt;':i}"/>`).join('');
 const largeDir=join(output,'large');new ReportExporter(largeDir).export(large,{'evidence/TEST-Large.xml':`<testsuite tests="10000" failures="0" errors="0" skipped="0">${cases}</testsuite>`});
 await page.setViewportSize({width:1440,height:1080});await page.goto(pathToFileURL(join(largeDir,'index.html')).href);
 assert.equal(await page.locator('#detail-region [data-test-id]').count(),4);assert.ok(await page.locator('*').count()<700);assert.ok(statSync(join(largeDir,'index.html')).size<8*1024*1024);
 await page.locator('[data-next="tests"]').click();assert.match(await page.locator('#detail-region').innerText(),/case4/);
 await page.locator('[data-class="1"]').click();assert.match(await page.locator('#detail-region').innerText(),/case/);assert.equal(await page.locator('#detail-region img').count(),0);
 await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));assert.equal(await page.locator('#print-records [data-test-id]').count(),10000);
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));assert.equal(await page.locator('#print-records tr').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 writeFileSync(join(output,'result.json'),JSON.stringify({fixture:true,browser:'Edge Chromium',desktop:true,tablet:true,mobile:true,search:true,tabs:true,dialog_escape_focus:true,export_byte_exact:true,print_all_records:10000,no_js:true,classes:500,tests:10000,iterations:600,initial_dom_nodes:await page.locator('*').count(),html_bytes:statSync(join(largeDir,'index.html')).size,errors,external},null,2));
 console.log(JSON.stringify({status:'PASS',output}));
} finally {await browser.close();if(!process.env.AITEST_REPORT07_UI_OUTPUT)rmSync(output,{recursive:true,force:true,maxRetries:3});}
