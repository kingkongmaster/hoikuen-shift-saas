// Audit actual Nest metadata, including method-level guards; no DB or server.
require('reflect-metadata');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'../dist/presentation');let routes=0;
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.controller.js'))inspect(p);}}
function inspect(file){for(const controller of Object.values(require(file))){if(typeof controller!=='function'||!controller.prototype)continue;const prefix=Reflect.getMetadata('path',controller);if(prefix===undefined)continue;
 for(const name of Object.getOwnPropertyNames(controller.prototype)){const method=controller.prototype[name];if(typeof method!=='function'||Reflect.getMetadata('method',method)===undefined)continue;const suffix=Reflect.getMetadata('path',method);const route=prefix+'/'+suffix;
  if(['health','ready','readiness'].includes(prefix)||prefix==='auth'&&['login','logout','accept-invitation'].includes(suffix))continue;
  const guards=[...(Reflect.getMetadata('__guards__',controller)||[]),...(Reflect.getMetadata('__guards__',method)||[])].map(g=>g.name);
  assert.ok(guards.includes('JwtAuthGuard'),route+' must authenticate');
  if(!(prefix==='tenants'&&name==='create'))assert.ok(guards.includes('TenantAccessGuard'),route+' must check live membership');
  routes++;
 }
}}
walk(root);assert.ok(routes>70);console.log(`PRODUCT route guard metadata: PASS (${routes} authenticated routes; legacy create separately denied by HTTP test)`);
