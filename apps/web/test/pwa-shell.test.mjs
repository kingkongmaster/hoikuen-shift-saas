import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const handlers={}, puts=[], deleted=[], opened=[], fetched=[];
let skipped=0, claimed=0, fail=false;
const entries=new Map();
const response={ok:true,type:'basic',clone(){return this;}};
const context={URL,self:{location:{origin:'https://pwa.example.invalid'},addEventListener:(k,f)=>handlers[k]=f,skipWaiting:()=>skipped++,clients:{claim:()=>claimed++}},caches:{
 open:async name=>{opened.push(name);return{addAll:async paths=>paths.forEach(p=>entries.set(p,{shell:p})),put:async(k,v)=>puts.push(k)};},
 keys:async()=>['enshift-shell-retired',opened[0],'unrelated-cache'],delete:async k=>deleted.push(k),match:async k=>entries.get(typeof k==='string'?k:new URL(k.url).pathname)
},fetch:async r=>{fetched.push(r.url);if(fail)throw Error('offline');return response;}};
vm.runInNewContext(code,context);
let wait=[];const waitUntil=p=>wait.push(p);
handlers.install({waitUntil});await Promise.all(wait);
assert.match(opened[0],/^enshift-shell-.+/);assert.equal(skipped,0,'install must not force reload unsaved input');
for(const asset of ['/','/offline.html','/manifest.json'])assert(entries.has(asset));
wait=[];handlers.activate({waitUntil});await Promise.all(wait);
assert.deepEqual(deleted,['enshift-shell-retired'],'remove retired application cache, preserve current and unrelated caches');assert.equal(claimed,1);
async function request(path,options={}){
 let responded=false,response;wait=[];
 handlers.fetch({request:{url:new URL(path,'https://pwa.example.invalid').href,method:'GET',mode:'cors',headers:{has:()=>false},...options},waitUntil,respondWith:p=>{responded=true;response=p;}});
 const result=await response;await Promise.all(wait);return{responded,result};
}
for(const path of ['/api/staff','/api','/api/me/calendar','/roster.csv','/private.json','/assets/app.js?token=synthetic','https://other.example.invalid/assets/app.js'])assert.equal((await request(path)).responded,false,path);
for(const path of ['/api','/api/staff','/assets/app.js?token=synthetic','https://other.example.invalid/'])assert.equal((await request(path,{mode:'navigate'})).responded,false,'private navigation '+path);
for(const method of ['POST','PATCH','PUT','DELETE'])assert.equal((await request('/assets/app.js',{method})).responded,false,method);
assert.equal((await request('/assets/app.js',{headers:{has:name=>name==='Authorization'}})).responded,false);
assert.equal(puts.length,0);assert.equal(fetched.length,0,'private/bypassed requests never reach worker fetch or cache');
assert.equal((await request('/assets/app.js')).result,response);assert.equal(puts.length,1);
entries.set('/assets/cached.js',{cached:true});assert.equal((await request('/assets/cached.js')).result.cached,true);assert.equal(puts.length,1);
assert.equal((await request('/',{mode:'navigate'})).result,response,'online navigation must use network rather than stale shell');
fail=true;assert.equal((await request('/',{mode:'navigate'})).result.shell,'/offline.html','offline navigation uses dedicated fallback');
handlers.message({data:{type:'UNKNOWN'}});assert.equal(skipped,0);
handlers.message({data:{type:'ACTIVATE_UPDATE'}});assert.equal(skipped,1);
const manifest=JSON.parse(fs.readFileSync(new URL('../public/manifest.json',import.meta.url)));
for(const[k,v]of Object.entries({name:'AeN Shift',short_name:'AeN Shift',start_url:'/',scope:'/',display:'standalone'}))assert.equal(manifest[k],v);
for(const size of ['192x192','512x512'])assert(manifest.icons.some(i=>i.sizes===size&&i.type==='image/png'&&i.purpose==='any'));
const maskable=manifest.icons.find(i=>i.purpose==='maskable');assert(maskable);assert.equal(maskable.type,'image/svg+xml');assert.equal(maskable.sizes,'any');
for(const icon of manifest.icons){assert.match(icon.src,/^\/icons\/[a-z0-9-]+\.(png|svg)$/);assert(entries.has(icon.src),'manifest asset included in shell');const bytes=fs.readFileSync(new URL('../public'+icon.src,import.meta.url));if(icon.type==='image/png'){assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),Number(icon.sizes.split('x')[0]));assert.equal(bytes.readUInt32BE(20),Number(icon.sizes.split('x')[1]));}else{assert.match(bytes.toString(),/<svg[^>]+viewBox="0 0 512 512"/);assert.doesNotMatch(bytes.toString(),/https?:\/\/(?!www.w3.org)/,'maskable must not require external assets');}}
console.log('PWA_SHELL_PASS: real worker lifecycle/cache isolation/offline navigation, manifest assets and dimensions');
