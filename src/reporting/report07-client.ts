/// <reference lib="dom" />
/** Offline presentation only. These functions also render the first page on the server. */
import type { CoverageFact, Report07Facts } from "./report07-facts.js";
export interface Report07View {
  targets:Array<{fqn:string;module:string;line:CoverageFact;branch:CoverageFact}>;
  facts:Report07Facts;
  history:Array<{name:string;status:string;code:string;run:string;coverage:string;stage?:string}>;
  collections:Record<string,{headings:string[];rows:string[][]}>;
}
export function esc07(value:unknown):string { return String(value??'Veri yok').replace(/[\u2013\u2014]/g,'-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
export function state07(value:string):string { return ({KNOWN:'Kayıtlı',UNAVAILABLE:'Veri yok',INVALID:'Geçersiz',NOT_APPLICABLE:'Uygulanamaz',NOT_RUN:'Çalıştırılmadı',PASSED:'Geçti',FAILED:'Başarısız',ERROR:'Hata',SKIPPED:'Atlandı',adopted:'Kabul edildi',rejected:'Reddedildi'} as Record<string,string>)[value]??value; }
export function percent07(value:CoverageFact):string { return value.status==='KNOWN'&&value.total?`%${(100*value.covered!/value.total).toLocaleString('tr-TR',{maximumFractionDigits:2})}`:state07(value.status); }
export function counter07(value:CoverageFact):string { return value.total===null?state07(value.status):`${value.covered} / ${value.total}`; }
export function table07(headings:string[],rows:string[][]):string { return `<div class="table-wrap bounded"><table><thead><tr>${headings.map(h=>`<th scope="col">${esc07(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headings.length}">Veri yok</td></tr>`}</tbody></table></div>`; }
export function pager07(name:string,page:number,total:number,size:number):string {
  const pages=Math.max(1,Math.ceil(total/size));
  const label=({classes:'sınıflar',tests:'testler',methods:'metotlar',history:'geçmiş',controls:'kontroller',evidence:'kanıtlar',models:'model kayıtları',diagnostics:'veri kayıtları'} as Record<string,string>)[name]??'kayıtlar';
  return `<div class="pager"><span class="page-desc" aria-live="polite">${total?`${page*size+1} ile ${Math.min(total,(page+1)*size)} / ${total} kayıt`:'0 kayıt'}</span><div class="pagerctrl"><button type="button" class="pagebutton" data-prev="${name}" aria-label="Önceki sayfa: ${label}" ${page===0?'disabled':''}>‹</button><span>${page+1} / ${pages}</span><button type="button" class="pagebutton" data-next="${name}" aria-label="Sonraki sayfa: ${label}" ${page+1>=pages?'disabled':''}>›</button></div></div>`;
}
export function classes07(view:Report07View,query:string,page:number,selected:number|null):string {
  const matches=view.targets.map((t,i)=>({t,i})).filter(({t})=>(t.fqn+' '+t.module).toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
  return `<div class="classlist">${matches.slice(page*3,page*3+3).map(({t,i})=>`<button type="button" class="classitem ${i===selected?'active':''}" data-class="${i}" aria-pressed="${i===selected}"><span class="classitem-head"><strong>${esc07(t.fqn.split('.').pop())}</strong><span aria-hidden="true">›</span></span><span class="classitem-module">${esc07(t.module||'Kök modül')}</span><span class="classitem-stats"><span>Satır ${esc07(percent07(t.line))}</span><span>Dal ${esc07(percent07(t.branch))}</span></span><span class="classitem-foot">${esc07(t.fqn)}</span></button>`).join('')||'<div class="empty">Aramayla eşleşen sınıf bulunamadı.</div>'}</div>${pager07('classes',page,matches.length,3)}`;
}
export function tests07(view:Report07View,page:number,all=false):string {
  const tests=all?view.facts.tests:view.facts.tests.slice(page*4,page*4+4);
  return table07(['Test kaydı','Sonuç','Süre'],tests.map(t=>[
    `<button type="button" class="test-open" data-test-id="${esc07(t.id)}">${esc07(t.name)}</button><span class="secondline">${esc07(t.class_name)}</span>`,
    `<span class="tag ${t.status==='PASSED'?'good':t.status==='SKIPPED'?'neutral':'warn'}">${state07(t.status)}</span>`,t.duration_seconds===null?'Veri yok':esc07(t.duration_seconds+' sn'),
  ]))+(all?'':pager07('tests',page,view.facts.tests.length,4));
}
export function details07(view:Report07View,index:number|null,tab:string,testPage:number,methodPage:number):string {
  const target=index===null?undefined:view.targets[index];if(!target)return '<div class="empty">İncelenecek sınıf bulunamadı.</div>';
  let content='';
  if(tab==='tests')content=`<h3>Unit test kayıtları</h3><p class="table-note">Bu sınıf ile testler arasındaki kesin ilişki kaydedilmedi. Aşağıdaki kayıtlar son koşunun genel test sonuçlarıdır. Test başına kapsam verisi yok.</p>${tests07(view,testPage)}`;
  if(tab==='methods') {
    const methods=view.facts.methods.filter(m=>m.fqn===target.fqn&&m.module_path===target.module);
    content=table07(['Metot','Satır','Dal'],methods.slice(methodPage*8,methodPage*8+8).map(m=>[esc07(m.name+(m.descriptor??'')),esc07(percent07(m.line)+' ('+counter07(m.line)+')'),esc07(percent07(m.branch)+' ('+counter07(m.branch)+')')]))+pager07('methods',methodPage,methods.length,8);
  }
  if(tab==='quality')content=table07(['Kontrol','Sonuç','Sayaç'],[['Satır eşiği',target.line.met===null?state07(target.line.status):target.line.met?'Sağlandı':'Hedef altı',counter07(target.line)],['Dal eşiği',target.branch.met===null?state07(target.branch.status):target.branch.met?'Sağlandı':'Hedef altı',counter07(target.branch)]].map(r=>r.map(esc07)));
  if(tab==='source') {
    const sources=view.facts.sources.filter(s=>s.class_name===target.fqn&&s.module_path===target.module);
    content=sources.length?sources.map(s=>`<h3>${esc07(s.path)}</h3><pre class="code-block">${esc07(s.preview)}</pre><p class="table-note">${s.truncated?'Önizleme sınırlandı. Tam içerik kanıt dosyasındadır.':'Doğrulanmış kaynak dosyası.'}</p>`).join(''):'<div class="empty">Bu uygulama sınıfının kaynak dosyası export paketinde yok. Metot sayaçları ve koşu kanıtları Kanıtlar bölümündedir.</div>';
  }
  const tabs=[['tests','Unit test kayıtları'],['methods','Metot kapsamı'],['quality','Kontroller'],['source','Kaynak ve kanıt']];
  return `<div class="selection-title">Seçili uygulama sınıfı</div><h3 class="selected-class">${esc07(target.fqn.split('.').pop())}</h3><p class="selected-path">${esc07(target.fqn)} / ${esc07(target.module||'Kök modül')}</p><div class="triple"><div class="triple-item"><span>Satır</span><strong>${esc07(percent07(target.line))}</strong></div><div class="triple-item"><span>Dal</span><strong>${esc07(percent07(target.branch))}</strong></div><div class="triple-item"><span>Eksik dal</span><strong>${target.branch.status==='KNOWN'?target.branch.missed:esc07(state07(target.branch.status))}</strong></div></div><div class="detail-tabs" role="tablist" aria-label="Geliştirici inceleme sekmeleri">${tabs.map(([key,label])=>`<button id="tab-${key}" type="button" role="tab" data-tab="${key}" aria-selected="${key===tab}" aria-controls="detail-region" tabindex="${key===tab?'0':'-1'}" class="${key===tab?'active':''}">${label}</button>`).join('')}</div><div id="detail-region" class="detail-surface" role="tabpanel" aria-labelledby="tab-${esc07(tab)}">${content}</div>`;
}
export function history07(view:Report07View,page:number,all=false,active:string|null=null):string {
  const rows=all?view.history:view.history.slice(page*3,page*3+3);
  return `<div class="table-wrap bounded"><table><thead><tr><th scope="col">Aşama</th><th scope="col">Durum</th><th scope="col">Ölçüm</th><th scope="col">Koşu</th></tr></thead><tbody>${rows.map(r=>`<tr ${r.stage?`data-stage="${esc07(r.stage)}" class="${r.stage===active?'active':''}"`:''}><td>${esc07(r.name)}<span class="secondline">${esc07(r.code)}</span></td><td>${esc07(r.status)}</td><td>${esc07(r.coverage)}</td><td class="mono">${esc07(r.run)}</td></tr>`).join('')||'<tr><td colspan="4">Çalışma kaydı yok</td></tr>'}</tbody></table></div>${all?'':pager07('history',page,view.history.length,3)}`;
}
export function collection07(view:Report07View,name:string,page:number,all=false):string {
  const collection=view.collections[name];if(!collection)return '';
  const rows=all?collection.rows:collection.rows.slice(page*8,page*8+8);
  return table07(collection.headings,rows)+(all?'':pager07(name,page,collection.rows.length,8));
}
export function runReport07():void {
  const view=JSON.parse(document.getElementById('report-data')!.textContent!) as Report07View;
  const byId=(id:string)=>document.getElementById(id)!;
  const pages:Record<string,number>={classes:0,tests:0,methods:0,history:0,controls:0,evidence:0,models:0,diagnostics:0};
  let query='',selected:number|null=view.targets.length?0:null,tab='tests';
  let activeStage='final';
  let lastFocus:HTMLElement|null=null;
  const dialog=byId('test-dialog') as HTMLDialogElement;
  const draw=()=>{
    byId('class-list').innerHTML=classes07(view,query,pages.classes!,selected);
    byId('selected-detail').innerHTML=details07(view,selected,tab,pages.tests!,pages.methods!);
    byId('history-region').innerHTML=history07(view,pages.history!,false,activeStage);
    document.documentElement.setAttribute('data-active-stage',activeStage);
    document.querySelectorAll('[data-stage-select]').forEach(element=>element.setAttribute('aria-selected',String(element.getAttribute('data-stage-select')===activeStage)));
    for(const name of Object.keys(view.collections))byId(name+'-region').innerHTML=collection07(view,name,pages[name]??0);
  };
  const close=()=>{dialog.close();lastFocus?.focus();};
  byId('export-btn').addEventListener('click',event=>{
    event.preventDefault();
    const content=JSON.parse(byId('report-export').textContent!) as string;
    const url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='report.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  byId('class-search').addEventListener('input',event=>{
    query=(event.target as HTMLInputElement).value;pages.classes=0;pages.tests=0;pages.methods=0;
    const first=view.targets.findIndex(t=>(t.fqn+' '+t.module).toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));selected=first<0?null:first;draw();
  });
  document.addEventListener('click',event=>{
    const button=(event.target as Element).closest('button');if(!button)return;
    const cls=button.getAttribute('data-class'),next=button.getAttribute('data-next'),prev=button.getAttribute('data-prev'),newTab=button.getAttribute('data-tab'),testId=button.getAttribute('data-test-id'),stage=button.getAttribute('data-stage-select');
    if(cls!==null){selected=Number(cls);pages.tests=0;pages.methods=0;draw();}
    if(next||prev){const key=(next??prev)!;pages[key]=Math.max(0,(pages[key]??0)+(next?1:-1));draw();const replacement=document.querySelector<HTMLButtonElement>(`button[data-${next?'next':'prev'}="${key}"]`);replacement?.focus();}
    if(newTab){tab=newTab;pages.methods=0;draw();byId('tab-'+tab).focus();}
    if(stage){activeStage=stage;const index=view.history.findIndex(record=>record.stage===stage);if(index>=0)pages.history=Math.floor(index/3);draw();}
    if(testId){const test=view.facts.tests.find(t=>t.id===testId);if(!test)return;lastFocus=button;
      byId('dialog-title').textContent=test.name;byId('dialog-meta').textContent=test.class_name+' / '+state07(test.status)+' / '+(test.duration_seconds===null?'Süre verisi yok':test.duration_seconds+' sn');
      byId('dialog-trace').textContent=[test.message,test.trace].filter(Boolean).join('\n')||(test.details_truncated?'Önizleme kapasitesi doldu. Tam hata kaydı XML kanıtındadır.':'Hata kaydı yok');
      byId('dialog-trace-note').textContent=test.details_truncated?'Önizleme sınırlandı. Tam mesaj ve çağrı izi bağlı XML kanıt dosyasındadır.':'Kayıtlı hata önizlemesi.';
      const source=view.facts.sources.find(s=>s.path===test.source_path);
      byId('dialog-source').textContent=source?.preview??'Kaynak verisi yok';
      byId('dialog-source-note').textContent=source?'Tam test sınıfı dosyası gösterilir; test metodu veya @DisplayName için ayrı bir kaynak eşlemesi kaydedilmedi.'+(source.truncated?' Önizleme sınırlandı.':''):'Doğrulanmış test kaynağı bulunamadı.';
      const evidence=view.collections.evidence?.rows.find(r=>r[0]?.includes(esc07(test.evidence_path)));
      const sourceEvidence=source?view.collections.evidence?.rows.find(r=>r[0]?.includes(esc07(source.path))):undefined;
      byId('dialog-evidence').innerHTML=[evidence?.[0],sourceEvidence?.[0]].filter(Boolean).join('<br>')||'Kanıt bağlantısı yok';dialog.showModal();byId('dialog-close').focus();
    }
    if(button.id==='dialog-close'||button.id==='dialog-done')close();
    if(button.id==='print-btn')window.print();
  });
  document.addEventListener('keydown',event=>{
    const element=event.target as HTMLElement;if(element.getAttribute('role')!=='tab')return;
    const tabs=Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));const index=tabs.indexOf(element as HTMLButtonElement);
    const target=event.key==='ArrowRight'?tabs[(index+1)%tabs.length]:event.key==='ArrowLeft'?tabs[(index+tabs.length-1)%tabs.length]:event.key==='Home'?tabs[0]:event.key==='End'?tabs[tabs.length-1]:null;
    if(target){event.preventDefault();target.click();}
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  window.addEventListener('beforeprint',()=>{
    byId('print-scope').textContent='Yazdırma kapsamı: tüm sınıflar, test kayıtları, metot sayaçları, kontroller, çalışma geçmişi ve kanıt listesi. Kaynak kodu ve hata metinlerinin tamamı JSON ile kanıt dosyalarındadır.';
    byId('print-records').innerHTML='<h2>Sınıflar</h2>'+table07(['Sınıf','Modül','Satır','Dal'],view.targets.map(t=>[esc07(t.fqn),esc07(t.module||'Kök modül'),esc07(percent07(t.line)+' ('+counter07(t.line)+')'),esc07(percent07(t.branch)+' ('+counter07(t.branch)+')')]))+'<h2>Test kayıtları</h2>'+tests07(view,0,true)+'<h2>Metot sayaçları</h2>'+table07(['Sınıf','Metot','Satır','Dal'],view.facts.methods.map(m=>[esc07(m.fqn),esc07(m.name+(m.descriptor??'')),esc07(counter07(m.line)),esc07(counter07(m.branch))]))+'<h2>Çalışma geçmişi</h2>'+history07(view,0,true)+Object.keys(view.collections).map(name=>'<h2>'+esc07(view.collections[name]!.headings.join(' / '))+'</h2>'+collection07(view,name,0,true)).join('');
  });
  window.addEventListener('afterprint',()=>{byId('print-records').replaceChildren();});
}
export function report07Script():string {
  return [esc07,state07,percent07,counter07,table07,pager07,classes07,tests07,details07,history07,collection07,runReport07].map(fn=>fn.toString()).join('\n')+'\nrunReport07();';
}
