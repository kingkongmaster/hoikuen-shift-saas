const {createHash}=require('node:crypto');
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
 const tenant=await p.tenant.findUniqueOrThrow({where:{id}});result.profile=Object.fromEntries(profileKeys.map(k=>[k,tenant[k]]));return createHash('sha256').update(JSON.stringify(result)).digest('hex');
}
async function login(identity) {
 const r=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:identity.email,password:'Synthetic-Initial-Aa7!'})});assert.equal(r.status,200);return (await r.json()).accessToken;
}
async function req(token,route,body) { const r=await fetch(base+route,{method:body?'PATCH':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}; }
async function open(context,identity) {const page=await context.newPage();const token=await login(identity);await page.addInitScript(t=>sessionStorage.setItem('enshift.accessToken',t),token);await page.goto(origin);return page;}

async function main(){
 await p.user.update({where:{id:fixture.userId},data:{mustChangePassword:false}});
 await p.auditLog.deleteMany({where:{tenantId:fixture.tenantId,action:'SETUP_STEP_UPDATED',detail:{path:['confirmedSection'],string_contains:''}}});
 await p.tenant.update({where:{id:fixture.tenantId},data:{setupCurrentStep:2}});
 const token=await login(fixture),state=(await req(token,'/setup')).body,original=await protectedData(fixture.tenantId);
 assert.equal(state.workforceSetupState,'COMPLETE');
 for(const [engine,device] of [[webkit,devices['iPhone 13']],[chromium,devices['Pixel 7']]]){
 const b=await engine.launch(),c=await b.newContext({...device,viewport:{width:390,height:844},serviceWorkers:'block'});
 try{const page=await c.newPage();let writes=0;page.on('request',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.method()))writes++;});await page.addInitScript(t=>sessionStorage.setItem('enshift.accessToken',t),token);await page.goto(origin);await page.getByRole('heading',{name:'勤務設定をご確認ください',exact:true}).waitFor();const list=page.getByRole('list',{name:'勤務パターン一覧',exact:true});const cards=list.locator(':scope > li');assert.equal(await cards.count(),state.workforceReview.patterns.length);
 const names=await cards.locator('strong').allTextContents();assert.deepEqual(names.slice(0,11),['普通出','普通出（土曜）','①','②','③','④','⑤','⑥','⑦','⑧','⑨']);
 for(const pattern of state.workforceReview.patterns){if(names.filter(n=>n===pattern.name).length!==1)continue;const card=cards.filter({has:page.locator('strong',{hasText:pattern.name})}).filter({hasText:pattern.startTime??'非勤務'});assert.ok(await card.count()>0);}
 const early=cards.filter({has:page.getByText('①',{exact:true})});assert.ok((await early.innerText()).includes('月〜金'));const sat=cards.filter({has:page.getByText('⑦',{exact:true})});assert.ok((await sat.innerText()).includes('土曜日'));
 assert.ok((await cards.filter({has:page.getByText('普通出',{exact:true})}).innerText()).includes('曜日設定なし'));
 assert.equal(await page.locator('input').count(),0);assert.equal(await page.locator('table').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 for(const title of ['固定勤務','曜日条件','期間条件','配置上の重要ルール'])await page.locator('summary').filter({hasText:title}).waitFor();
 assert.equal(writes,0);assert.equal(await protectedData(fixture.tenantId),original);
 await list.scrollIntoViewIfNeeded();
 if(process.env.REVIEW_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.REVIEW_SCREENSHOT_DIR,engine.name()+'-review.png'),fullPage:false});
 console.log(engine.name()+' WORK_PATTERN_UI_PASS order, DB times, registered weekdays, unspecified preserved, readOnly,390px,workforce digest unchanged');
 }finally{await c.close();await b.close();}
 }
}
main().catch(e=>{console.error('WORK_PATTERN_UI_HOLD',e.name,e.message);process.exitCode=1}).finally(()=>p.$disconnect());
