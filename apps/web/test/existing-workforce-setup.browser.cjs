// Isolated API/DB only. Production credentials and staff identities are never used.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const apiRequire = createRequire(path.resolve(__dirname, '../../api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client');
const safety = apiRequire('./test/helpers/isolated-database.cjs');
safety.resolveIsolatedDatabaseUrl();
const base = safety.resolveLocalApiBaseUrl();
const origin = process.env.PROFILE_TEST_WEB_ORIGIN;
assert.equal(new URL(origin).hostname, '127.0.0.1');
const { webkit, chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = JSON.parse(fs.readFileSync(process.env.PROFILE_TEST_FIXTURE, 'utf8'));
const p = new PrismaClient();
const tables=['staff','department','staffDepartmentAssignment','tenantShiftSetting','classStaffingRequirement','workPattern','staffWorkRule','staffWorkContract','tenantFeature','staffAttributeDefinition','staffAttributeAssignment','shiftStaffingRequirement','conditionalShiftStaffingRequirement','membership'];
const profileKeys=['name','displayName','contactEmail','postalCode','prefecture','city','addressLine','phone','contactName'];
async function protectedData(id) {
 const result={};for(const table of tables)result[table]=(await p[table].findMany({where:{tenantId:id}})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const tenant=await p.tenant.findUniqueOrThrow({where:{id}});result.profile=Object.fromEntries(profileKeys.map(k=>[k,tenant[k]]));return JSON.stringify(result);
}
async function login(identity) {
 const r=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:identity.email,password:'Synthetic-Initial-Aa7!'})});assert.equal(r.status,200);return (await r.json()).accessToken;
}
async function req(token,route,body) { const r=await fetch(base+route,{method:body?'PATCH':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}; }
async function open(context,identity) {const page=await context.newPage();const token=await login(identity);await page.addInitScript(t=>sessionStorage.setItem('enshift.accessToken',t),token);await page.goto(origin);return page;}
async function main(){
 await p.user.update({where:{id:fixture.userId},data:{mustChangePassword:false}});
 await p.tenant.update({where:{id:fixture.tenantId},data:{contactEmail:'office@example.invalid',setupStatus:'IN_PROGRESS',setupCurrentStep:2,setupCompletedAt:null}});
 const authBefore=await p.user.findUnique({where:{id:fixture.userId},select:{mustChangePassword:true,tokenVersion:true}});
 const original=await protectedData(fixture.tenantId);
 for(const [engine,device] of [[webkit,devices['iPhone 13']],[chromium,devices['Pixel 7']]]){
  const browser=await engine.launch();const context=await browser.newContext({...device,viewport:{width:390,height:844},serviceWorkers:'block'});
  try{
   await p.tenant.update({where:{id:fixture.tenantId},data:{setupCurrentStep:2}});
   const token=await login(fixture);const state=(await req(token,'/setup')).body;
   assert.equal(state.workforceSetupState,'COMPLETE');assert.equal(state.preserveWorkforceSetup,true);assert.ok(Object.values(state.workforceSetupEvidence).every(Boolean));
   // Stale clients cannot overwrite existing workforce through Setup APIs.
   assert.equal((await req(token,'/setup/work-settings',{maxConsecutiveWorkDays:4})).status,409);
   assert.equal((await req(token,'/setup/class-requirements',{requirements:[{classType:'AGE_0',weekdayRequired:0,saturdayRequired:0,isActive:true}]})).status,409);
   const page=await open(context,fixture);await page.getByRole('button',{name:'確認して次へ',exact:true}).waitFor();
   assert.equal(await page.getByText('設定済み',{exact:true}).count(),2);
   let profileWrites=0,workforceWrites=0;
   page.on('request',r=>{if(r.method()==='PATCH'){if(r.url().endsWith('/setup/tenant'))profileWrites++;if(/\/setup\/(work-settings|class-requirements)$/.test(r.url()))workforceWrites++;}});
   await page.getByRole('button',{name:'確認して次へ',exact:true}).click();await page.getByRole('heading',{name:'利用規約',exact:true}).waitFor();
   assert.equal(profileWrites,0);assert.equal(workforceWrites,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await protectedData(fixture.tenantId),original);await page.close();
   const normalized=await req(token,'/setup/progress',{currentStep:2});assert.equal(normalized.status,200);assert.equal(normalized.body.setupCurrentStep,4);
   // Partial managed setup: preserve data, expose no writable workforce screen.
   const assignment=await p.staffDepartmentAssignment.findFirstOrThrow({where:{tenantId:fixture.tenantId,isActive:true}});
   await p.staffDepartmentAssignment.update({where:{id:assignment.id},data:{isActive:false}});
   await p.tenant.update({where:{id:fixture.tenantId},data:{setupCurrentStep:2}});
   try{
    const partialBefore=await protectedData(fixture.tenantId);const partial=(await req(token,'/setup')).body;
    assert.equal(partial.workforceSetupState,'PARTIAL');assert.equal(partial.workforceSetupEvidence.departmentCoverage,false);
    for(const [route,data]of [['/setup/work-settings',{maxConsecutiveWorkDays:4}],['/setup/class-requirements',{requirements:[{classType:'AGE_0',weekdayRequired:0,saturdayRequired:0,isActive:true}]}],['/setup/progress',{currentStep:4}]])assert.equal((await req(token,route,data)).status,409);
    const tab=await open(context,fixture);await tab.getByRole('alert').waitFor();assert.equal(await tab.locator('input').count(),0);assert.equal(await tab.getByRole('button',{name:'保存して次へ',exact:true}).isDisabled(),true);await tab.close();
    assert.equal(await protectedData(fixture.tenantId),partialBefore);
   }finally{await p.staffDepartmentAssignment.update({where:{id:assignment.id},data:{isActive:true,updatedAt:assignment.updatedAt}})}
   // Production's old API omitted the contract. Never interpret omission as NEW.
   await p.tenant.update({where:{id:fixture.tenantId},data:{setupCurrentStep:2}});
   const legacy=await context.newPage();await legacy.addInitScript(t=>sessionStorage.setItem('enshift.accessToken',t),token);
   await legacy.route('**/api/setup',async route=>{const r=await route.fetch();const body=await r.json();delete body.workforceSetupState;delete body.workforceSetupEvidence;delete body.preserveWorkforceSetup;await route.fulfill({response:r,json:body})});
   await legacy.goto(origin);await legacy.getByRole('alert').waitFor();assert.equal(await legacy.locator('input').count(),0);assert.equal(await legacy.getByRole('button',{name:'保存して次へ',exact:true}).isDisabled(),true);await legacy.close();
   // New customer retains steps 1 -> 2 -> 3 -> 4, isolated from existing staff23.
   const tenant=await p.tenant.create({data:{name:'Anonymous New Nursery',setupStatus:'NOT_STARTED',setupCurrentStep:1}});
   const existing=await p.user.findUniqueOrThrow({where:{id:fixture.userId}});
   const user=await p.user.create({data:{email:'new-'+tenant.id+'@example.invalid',displayName:'Anonymous Admin',passwordHash:existing.passwordHash,mustChangePassword:false}});
   try{
    await p.membership.create({data:{tenantId:tenant.id,userId:user.id,role:'ADMIN'}});await p.tenantSubscription.create({data:{tenantId:tenant.id,plan:'PROFESSIONAL',status:'ACTIVE'}});
    const newToken=await login(user);assert.equal((await req(newToken,'/setup')).body.workforceSetupState,'NEW');
    const marker=await p.tenantFeature.create({data:{tenantId:tenant.id,featureCode:'TENANT_CUSTOM_RULES',enabled:true,source:'ANONYMOUS_TEST',configuration:{release1SourceProvenance:{matrixSourceId:'ANONYMOUS-SOURCE'}}}});
    assert.equal((await req(newToken,'/setup')).body.workforceSetupState,'PARTIAL');
    await p.tenantFeature.delete({where:{id:marker.id}});
    const tab=await open(context,user);await tab.getByLabel('メールアドレス',{exact:false}).fill('new-office@example.invalid');await tab.getByRole('button',{name:'保存して次へ',exact:true}).click();
    await tab.getByRole('heading',{name:'勤務設定',exact:true}).waitFor();await tab.getByRole('button',{name:'メッセージを閉じる',exact:true}).click();await tab.getByRole('button',{name:'保存して次へ',exact:true}).click();
    await tab.getByRole('heading',{name:'クラス設定',exact:true}).waitFor();await tab.getByRole('button',{name:'メッセージを閉じる',exact:true}).click();await tab.getByRole('button',{name:'保存して次へ',exact:true}).click();
    await tab.getByRole('heading',{name:'利用規約',exact:true}).waitFor();await tab.close();
    assert.equal(await protectedData(fixture.tenantId),original);
   }finally{await p.tenant.delete({where:{id:tenant.id}});await p.user.delete({where:{id:user.id}})}
   assert.deepEqual(await p.user.findUnique({where:{id:fixture.userId},select:{mustChangePassword:true,tokenVersion:true}}),authBefore);
   console.log(engine.name()+': PASS complete skips2/3, configured labels, partial/oldAPI fail-closed, new1-2-3-4, API protection, profile/workforce/auth unchanged, 390px');
  }finally{await context.close();await browser.close()}
 }
}
main().catch(e=>{console.error('WORKFORCE_BROWSER_HOLD',e.name,String(e.message).slice(0,500),(e.stack||'').split('\n').filter(x=>x.includes('existing-workforce-setup')).join('\n'));process.exitCode=1}).finally(()=>p.$disconnect());
