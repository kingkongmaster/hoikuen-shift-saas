import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TRAINING_REVIEW_URL||'http://127.0.0.1:4176';const result=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch();const context=await browser.newContext();const page=await context.newPage();await context.route('**/api/**',r=>r.abort('blockedbyclient')); const requests=[],failures=[],responses=[];page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));page.on('response',r=>responses.push(r.url()));
 page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
 await page.goto(base+'/training/');await page.frameLocator('#practice').getByRole('heading',{name:'操作練習ガイド'}).waitFor();
 const inner=page.frames().find(f=>f.url()==='about:srcdoc');const before=requests.length;
 const probes=await inner.evaluate(async base=>{
  const out={violations:[]};document.addEventListener('securitypolicyviolation',e=>out.violations.push({directive:e.effectiveDirective,blocked:e.blockedURI}));
  try{await fetch(base+'/api/write-probe',{method:'POST',body:'anonymous-probe'});out.fetch=false;}catch{out.fetch=true;}
  out.xhr=await new Promise(resolve=>{const x=new XMLHttpRequest();x.open('POST',base+'/api/xhr-probe');x.onerror=()=>resolve(true);x.onload=()=>resolve(false);try{x.send('anonymous-probe');}catch{resolve(true);}});
  try{out.beacon=!navigator.sendBeacon(base+'/api/beacon-probe','anonymous-probe');}catch{out.beacon=true;}
  out.websocket=await new Promise(resolve=>{try{const s=new WebSocket(base.replace('http','ws')+'/api/ws-probe');s.onerror=()=>resolve(true);s.onopen=()=>{s.close();resolve(false);};}catch{resolve(true);}});
  const form=document.createElement('form');form.method='POST';form.action=base+'/api/form-probe';document.body.append(form);form.requestSubmit();form.remove();
  const img=document.createElement('img');img.src=base+'/api/image-probe';document.body.append(img);
  out.popup=window.open(base+'/api/popup-probe')===null;
  try{void parent.sessionStorage.getItem('enshift.accessToken');out.credential=false;}catch{out.credential=true;}
  await new Promise(resolve=>setTimeout(resolve,100));return out;
 },base);
 await page.waitForTimeout(150);const probeNetwork=requests.length-before;assert(!responses.some(u=>u.includes('/api/')),'No API received a request');for(const r of requests.slice(before)){assert(failures.some(f=>f.url===r.url&&/CSP|content.security/i.test(f.error)),JSON.stringify(failures));}
 assert(probes.violations.some(v=>v.blocked.includes('beacon-probe')&&v.directive==='connect-src'),'Beacon denied by CSP');assert(probes.violations.some(v=>v.directive==='form-action'),'Native form POST denied by CSP');
 for(const k of ['fetch','xhr','websocket','popup','credential'])assert.equal(probes[k],true,k);
 // Untrusted progress and foreign-window messages cannot overwrite business storage.
 await page.evaluate(()=>{localStorage.setItem('aen.training.progress.v2','{"course":"admin","index":99999}');window.dispatchEvent(new MessageEvent('message',{origin:'null',source:window,data:{type:'aen-training:progress',progress:{course:'admin',index:5}}}));});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aen.training.progress.v2')).index),99999);
 await page.reload();assert.equal(await page.frameLocator('#practice').getByRole('button',{name:/続きから再開/}).count(),0);
 // Denied storage remains usable and reports that resume is unavailable.
 const blocked=await context.newPage();await blocked.addInitScript(()=>{Storage.prototype.getItem=function(){throw new DOMException('denied','SecurityError')};Storage.prototype.setItem=function(){throw new DOMException('denied','SecurityError')};});
 await blocked.goto(base+'/training/');await blocked.locator('#storage-status').filter({hasText:'進捗を保存できません'}).waitFor();await blocked.frameLocator('#practice').getByRole('button',{name:/職員 かんたん操作/}).click();
 // Actual app Help entry, with the real app script and no logged-in session.
 const help=await context.newPage();await help.goto(base+'/#help');await help.getByRole('link',{name:/操作練習ガイド/}).click();await help.waitForURL(base+'/training/');await help.getByRole('link',{name:'練習を終了してAeN Shiftへ戻る'}).click();await help.waitForURL(base+'/');
 result.push({name,probes,browserAttemptsDuringProbes:probeNetwork,blockedRequests:failures,apiResponses:0,corruptProgress:'PASS',storageDenied:'PASS',helpEntryAndExit:'PASS'});await browser.close();
}
await writeFile('../../reports/training/isolation-results.json',JSON.stringify(result,null,2));console.log('PASS: CSP/header, XHR/fetch/beacon/WebSocket/form/image/popup, credential isolation, progress validation, storage denial, Help entry/exit');
