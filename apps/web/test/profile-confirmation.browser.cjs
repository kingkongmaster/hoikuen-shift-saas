// Run against an isolated API/DB and built Web only; never Production.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const apiRequire = createRequire(path.resolve(__dirname, '../../api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client');
const safety = apiRequire('./test/helpers/isolated-database.cjs');
safety.resolveIsolatedDatabaseUrl();
const base = safety.resolveLocalApiBaseUrl();
const origin = process.env.PROFILE_TEST_WEB_ORIGIN;
assert.equal(new URL(origin).hostname, '127.0.0.1');
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = JSON.parse(fs.readFileSync(process.env.PROFILE_TEST_FIXTURE, 'utf8'));
const p = new PrismaClient();
const synthetic = 'Synthetic-Initial-Aa7!';
const keys = ['name','displayName','contactEmail','postalCode','prefecture','city','addressLine','phone','contactName'];
const profile = { name:'Anonymous Nursery',displayName:'Anonymous Nursery',contactEmail:'office@example.invalid',postalCode:'000-0000',prefecture:'Test Prefecture',city:'Test City',addressLine:'Test Block 1',phone:'000-000-0000',contactName:'Anonymous Director' };
async function snapshot() {
 const result = {};
 for(const table of ['staff','department','staffDepartmentAssignment','tenantShiftSetting','classStaffingRequirement','workPattern','staffWorkRule','staffWorkContract','staffAttributeDefinition','staffAttributeAssignment','shiftStaffingRequirement','conditionalShiftStaffingRequirement','membership'])
  result[table] = (await p[table].findMany({where:{tenantId:fixture.tenantId}})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return JSON.stringify(result);
}
async function tenantProfile() { const t=await p.tenant.findUniqueOrThrow({where:{id:fixture.tenantId}});return Object.fromEntries(keys.map(k=>[k,t[k]])); }
async function session(page, identity = fixture) {
 const r=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:identity.email,password:synthetic})}); assert.equal(r.status,200);
 const s=await r.json();assert.equal(s.role,'ADMIN');assert.equal(s.tenant.id,identity.tenantId);
 await page.addInitScript(token=>sessionStorage.setItem('enshift.accessToken',token),s.accessToken);
 await page.goto(origin);return s;
}
async function mobileLayout(page) { assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390px no horizontal overflow'); }
async function main(){
 const mapping=await import(pathToFileURL(path.resolve(__dirname,'../src/features/setup/profile-mapping.js')));
 // Preserve nullable/whitespace fields when unchanged, including required-field-only edits.
 assert.equal(mapping.profilePatch({...profile,phone:null},mapping.profileDraft({...profile,phone:null})),null);
 assert.equal(mapping.profilePatch(profile,{...mapping.profileDraft(profile),contactEmail:'changed@example.invalid'}).prefecture,undefined);
 const protectedBefore=await snapshot();
 for(const [engine,device] of [[webkit,devices['iPhone 13']],[chromium,devices['Pixel 7']]]) {
  const browser=await engine.launch();
  const context=await browser.newContext({...device,viewport:{width:390,height:844},serviceWorkers:'block'});
  try {
   await p.user.update({where:{id:fixture.userId},data:{mustChangePassword:true,tokenVersion:{increment:1}}});
   const page=await context.newPage();await session(page);
   await page.getByRole('heading',{name:'本人用パスワードへ変更'}).waitFor();
   const labels=['現在の仮パスワード','新しいパスワード','新しいパスワード（確認）'];
   for(const label of labels)await page.getByLabel(label,{exact:true}).fill(synthetic);
   let writes=0;page.on('request',r=>{if(r.method()!=='GET')writes++});
   for(const mask of [1,0,2,0,4,0,7,0]) {
    for(let i=0;i<3;i++)await page.getByRole('checkbox',{name:labels[i]+'を表示',exact:true}).setChecked(Boolean(mask&(1<<i)));
    for(let i=0;i<3;i++){
     const input=page.getByLabel(labels[i],{exact:true});
     assert.equal(await input.getAttribute('type'),mask&(1<<i)?'text':'password');
     assert.equal(await input.evaluate(e=>e.type),mask&(1<<i)?'text':'password');
     assert.equal(await input.evaluate(e=>getComputedStyle(e).webkitTextSecurity),mask&(1<<i)?'none':'disc');
    }
   }
   assert.equal(writes,0,'visibility is client-only');await mobileLayout(page);
   for(const label of labels) assert.ok(await page.getByRole('checkbox',{name:label+'を表示',exact:true}).evaluate(e=>e.labels[0].getBoundingClientRect().height)>=44, '44px touch label');
   assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>/password/i.test(k))||Object.keys(sessionStorage).some(k=>/password/i.test(k))),false);
   await page.close();
   await p.user.update({where:{id:fixture.userId},data:{mustChangePassword:false,tokenVersion:{increment:1}}});
   const authBefore=await p.user.findUnique({where:{id:fixture.userId},select:{mustChangePassword:true,tokenVersion:true}});
   for(const scenario of ['unchanged','contact','new']) {
    const data=scenario==='new'?{...profile,contactEmail:null,prefecture:null,city:null,addressLine:null,postalCode:null,phone:null,contactName:null}:profile;
    await p.tenant.update({where:{id:fixture.tenantId},data:{...data,setupStatus:'NOT_STARTED',setupCurrentStep:1,setupCompletedAt:null}});
    const before=await tenantProfile();const tab=await context.newPage();await session(tab);
    await tab.getByLabel('園名',{exact:false}).first().waitFor();
    const patches=[];tab.on('request',r=>{if(r.url().endsWith('/setup/tenant')&&r.method()==='PATCH')patches.push(JSON.parse(r.postData()))});
    if(scenario!=='new')await tab.getByText('園情報をご確認ください。変更がなければ、そのまま次へ進めます。').waitFor();
    if(scenario==='contact')await tab.getByLabel('メールアドレス',{exact:false}).fill('updated@example.invalid');
    if(scenario==='new'){
     await tab.getByLabel('メールアドレス',{exact:false}).fill(profile.contactEmail);
     for(const [label,k]of [['都道府県','prefecture'],['市区町村','city'],['町名・番地・建物名','addressLine']])await tab.getByLabel(label,{exact:true}).fill(profile[k]);
    }
    await mobileLayout(tab);
    await tab.getByRole('button',{name:scenario==='unchanged'?'確認して次へ':'保存して次へ',exact:true}).click();
    await tab.getByRole('heading',{name:'勤務設定をご確認ください',exact:true}).waitFor();
    const after=await tenantProfile();
    if(scenario==='unchanged'){assert.equal(patches.length,0);assert.deepEqual(after,before)}
    else {
     assert.equal(patches.length,1);
     if(scenario==='contact'){
      assert.deepEqual(after,{...before,contactEmail:'updated@example.invalid'});
      for(const k of ['prefecture','city','addressLine'])assert.equal(Object.hasOwn(patches[0],k),false);
     }else for(const k of ['prefecture','city','addressLine'])assert.equal(after[k],profile[k]);
    }
    assert.equal(await snapshot(),protectedBefore,'Staff23/rules/patterns/provenance/membership unchanged');
    assert.deepEqual(await p.user.findUnique({where:{id:fixture.userId},select:{mustChangePassword:true,tokenVersion:true}}),authBefore);
    await tab.close();
   }
   // A genuinely new customer keeps the ordinary workforce setup steps.
   const newTenant=await p.tenant.create({data:{name:'Anonymous New Nursery',setupStatus:'NOT_STARTED',setupCurrentStep:1}});
   const existingUser=await p.user.findUniqueOrThrow({where:{id:fixture.userId}});
   const newUser=await p.user.create({data:{email:'new-'+newTenant.id+'@example.invalid',displayName:'Anonymous New Admin',passwordHash:existingUser.passwordHash,mustChangePassword:false}});
   try {
    await p.membership.create({data:{tenantId:newTenant.id,userId:newUser.id,role:'ADMIN'}});
    await p.tenantSubscription.create({data:{tenantId:newTenant.id,plan:'PROFESSIONAL',status:'ACTIVE'}});
    const tab=await context.newPage();await session(tab,{email:newUser.email,tenantId:newTenant.id});
    await tab.getByText('園の基本情報を入力してください。').waitFor();
    await tab.getByLabel('メールアドレス',{exact:false}).fill('new-contact@example.invalid');
    for(const [label,k] of [['都道府県','prefecture'],['市区町村','city'],['町名・番地・建物名','addressLine']])await tab.getByLabel(label,{exact:true}).fill(profile[k]);
    await tab.getByRole('button',{name:'保存して次へ',exact:true}).click();
    await tab.getByRole('heading',{name:'勤務設定',exact:true}).waitFor();
    const saved=await p.tenant.findUniqueOrThrow({where:{id:newTenant.id}});
    for(const k of ['prefecture','city','addressLine'])assert.equal(saved[k],profile[k]);
    assert.equal(await snapshot(),protectedBefore);
    assert.equal(await p.staff.count({where:{tenantId:newTenant.id}}),0);
    await tab.close();
   } finally {await p.tenant.delete({where:{id:newTenant.id}});await p.user.delete({where:{id:newUser.id}})}
   console.log(engine.name()+': PASS toggles independent/all ON-OFF, masking, client-only, 390px, structured profile A/B/C, protected data');
  } finally {await context.close();await browser.close()}
 }
}
main().catch(e=>{console.error('PROFILE_BROWSER_HOLD',e.name, String(e.message).replace(/Synthetic[^\s]*/g,'[synthetic]').slice(0,250));process.exitCode=1}).finally(()=>p.$disconnect());
