import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const handlers={},puts=[],deleted=[];let skipped=0,claimed=0,fail=false;const entries=new Map([['/offline.html',{offline:true}]]);
const context={URL,self:{location:{origin:'https://pwa.example.invalid'},addEventListener:(k,f)=>handlers[k]=f,skipWaiting:()=>skipped++,clients:{claim:()=>claimed++}},caches:{open:async()=>({addAll:async a=>a.forEach(k=>entries.set(k,{shell:true})),put:async(k,v)=>puts.push(k)}),keys:async()=>['enshift-shell-v12-print-calendar','enshift-shell-v13-staff-pwa','unrelated-cache'],delete:async k=>deleted.push(k),match:async k=>entries.get(typeof k==='string'?k:new URL(k.url).pathname)},fetch:async()=>{if(fail)throw Error('offline');return{ok:true,type:'basic',clone(){return this}}}};
vm.runInNewContext(code,context);
let wait=[];const waitUntil=p=>wait.push(p);handlers.install({waitUntil});await Promise.all(wait);assert.equal(skipped,0);
handlers.activate({waitUntil});await Promise.all(wait);assert.deepEqual(deleted,['enshift-shell-v12-print-calendar']);assert.equal(claimed,1);
async function request(path,options={}){let responded=false,response;wait=[];handlers.fetch({request:{url:'https://pwa.example.invalid'+path,method:'GET',mode:'cors',headers:{has:()=>false},...options},waitUntil,respondWith:p=>{responded=true;response=p}});let result=await response;await Promise.all(wait);return{responded,result};}
for(const path of ['/api/staff','/api','/api/me/calendar','/roster.csv','/private.json','/assets/app.js?token=synthetic'])assert.equal((await request(path)).responded,false);
assert.equal((await request('/assets/app.js',{headers:{has:()=>true}})).responded,false);
assert.equal((await request('/assets/app.js')).responded,true);assert.equal(puts.length,1);
fail=true;assert.equal((await request('/',{mode:'navigate'})).result.shell,true); // explicit offline shell
handlers.message({data:{type:'ACTIVATE_UPDATE'}});assert.equal(skipped,1);
const manifest=JSON.parse(fs.readFileSync(new URL('../public/manifest.json',import.meta.url)));for(const[k,v]of Object.entries({name:'AeN Shift',short_name:'AeN Shift',start_url:'/',scope:'/',display:'standalone'}))assert.equal(manifest[k],v);
assert(manifest.icons.some(i=>i.purpose==='maskable'));assert(manifest.icons.some(i=>i.sizes==='192x192'));assert(manifest.icons.some(i=>i.sizes==='512x512'));
console.log('PWA_SHELL_PASS: API/private/query/authenticated requests uncached, offline shell, scoped cache cleanup, explicit update, manifest');
