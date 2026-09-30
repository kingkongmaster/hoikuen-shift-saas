const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const apiRequire=createRequire(path.resolve(__dirname,'../../api/package.json'));
const {PrismaClient}=apiRequire('@prisma/client');
const safety=apiRequire('./test/helpers/isolated-database.cjs');safety.resolveIsolatedDatabaseUrl();const base=safety.resolveLocalApiBaseUrl();
const origin=process.env.PROFILE_TEST_WEB_ORIGIN;assert.equal(new URL(origin).hostname,'127.0.0.1');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fixture=JSON.parse(fs.readFileSync(process.env.PROFILE_TEST_FIXTURE));const p=new PrismaClient();
const root=path.resolve(__dirname,'..'),html=path.join(root,'.post-setup-review.html'),tsx=path.join(root,'.post-setup-review.tsx');
async function req(session,route,body,method=body?'PATCH':'GET') {const r=await fetch(base+route,{method,headers:{'content-type':'application/json',authorization:'Bearer '+session.accessToken},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
async function login(){const r=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fixture.email,password:'Synthetic-Initial-Aa7!'})});assert.equal(r.status,200);return r.json();}
async function digest(){const rows=await p.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename`);const out={};for(const {tablename:t} of rows){assert.match(t,/^[A-Za-z_]+$/);out[t]=await p.$queryRawUnsafe(`SELECT md5(coalesce(json_agg(x ORDER BY x::text),'[]')::text) AS hash FROM (SELECT row_to_json(r) x FROM "${t}" r) q`);}return JSON.stringify(out);}
(async()=>{
 await p.user.update({where:{id:fixture.userId},data:{mustChangePassword:false}});
 await p.tenant.update({where:{id:fixture.tenantId},data:{contactEmail:'office@example.invalid',setupStatus:'IN_PROGRESS',setupCurrentStep:2,setupCompletedAt:null,termsVersion:null,privacyVersion:null,termsAcceptedAt:null,privacyAcceptedAt:null}});
 const admin=await login();let s=(await req(admin,'/setup')).body;
 for(const [confirmedSection,currentStep] of [['WORK_SETTINGS',3],['STAFF_CLASSES',4]])assert.equal((await req(admin,'/setup/progress',{confirmedSection,currentStep,reviewDigest:s.workforceReview.digest})).status,200);
 assert.equal((await req(admin,'/setup/consents',{acceptTerms:true,acceptPrivacy:true,termsVersion:s.currentTermsVersion,privacyVersion:s.currentPrivacyVersion,termsHash:s.legalRelease.termsHash,privacyHash:s.legalRelease.privacyHash})).status,200);
 assert.equal((await req(admin,'/setup/complete',{},'POST')).status,201);
 const before=await digest();
 assert.ok(!fs.existsSync(html)&&!fs.existsSync(tsx));
 fs.writeFileSync(html,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/.post-setup-review.tsx"></script></body></html>');
 fs.writeFileSync(tsx,`import React from 'react';import{createRoot}from'react-dom/client';import{Dashboard}from'./src/features/dashboard/Dashboard';import{RegisteredSetupReview}from'./src/features/setup/RegisteredSetupReview';import'./src/styles.css';const session=(window as any).__session;createRoot(document.getElementById('root')!).render(location.search.includes('direct')?<RegisteredSetupReview session={session} onBack={()=>{}}/>:<Dashboard session={session} onLogout={()=>{}}/>);`);
 for(const engine of [webkit,chromium]){
  const browser=await engine.launch();try{
   const page=await browser.newPage({viewport:{width:390,height:844}});await page.addInitScript(s=>window.__session=s,admin);let writes=0;page.on('request',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.method()))writes++;});
   await page.goto(origin+'/.post-setup-review.html');await page.getByText('その他のメニュー',{exact:true}).click();await page.getByRole('button',{name:'園設定',exact:true}).click();await page.getByRole('button',{name:'登録内容を確認する',exact:true}).click();
   const review=page.getByRole('region',{name:'登録内容の確認',exact:true});await review.getByRole('heading',{name:'勤務設定をご確認ください',exact:true}).waitFor();
   await review.getByRole('heading',{name:'職員・クラス設定をご確認ください',exact:true}).waitFor();await review.getByRole('heading',{name:'子育て支援職員',exact:true}).waitFor();
   const text=await review.innerText();for(const x of ['子育て支援：2名','保育：18名','給食：3名','クラス別人数設定なし','園全体：最低5名','⑦：2名','⑧：1名','⑨：2名','固定勤務'])assert.ok(text.includes(x),x);
   assert.deepEqual(await review.locator('dl dd').allTextContents(),['23名','20名','3名','3名']);for(let i=0;i<6;i++)assert.ok(text.includes(i+'歳：平日'+(i<4?2:1)+'名'));
   assert.ok(!text.includes('土曜0名'));assert.equal(await review.locator('input,select,textarea').count(),0);assert.equal(await review.getByRole('button').count(),1);assert.equal(await review.getByRole('button',{name:/確認しました|保存|完了/}).count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const names=await p.staff.findMany({where:{tenantId:fixture.tenantId},select:{displayName:true}});for(const n of names)assert.ok(!text.includes(n.displayName));
   await review.getByRole('button',{name:'園設定へ戻る'}).click();await page.getByRole('button',{name:'登録内容を確認する',exact:true}).waitFor();await page.getByRole('button',{name:'ホームへ戻る'}).click();await page.getByRole('heading',{name:'よく使うメニュー'}).waitFor();assert.equal(writes,0);assert.equal(await digest(),before);
   const denied=await browser.newPage({viewport:{width:390,height:844}});await denied.addInitScript(s=>window.__session={...s,role:'STAFF'},admin);let setupRequests=0;denied.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/setup'))setupRequests++;});await denied.goto(origin+'/.post-setup-review.html?direct');await denied.getByRole('alert').filter({hasText:'管理者のみ'}).waitFor();assert.equal(setupRequests,0);
   await denied.goto(origin+'/.post-setup-review.html');await denied.getByText('その他のメニュー',{exact:true}).click();assert.equal(await denied.getByRole('button',{name:'園設定',exact:true}).count(),0);
   await page.route('**/api/setup',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));await page.goto(origin+'/.post-setup-review.html?direct');await page.getByRole('alert').waitFor();await page.unroute('**/api/setup');await page.getByRole('button',{name:'再読込'}).click();await page.getByRole('heading',{name:'勤務設定をご確認ください',exact:true}).waitFor();assert.equal(writes,0);
   for(const workforceSetupState of ['NEW','PARTIAL']){const value=(await req(admin,'/setup')).body;await page.route('**/api/setup',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...value,workforceSetupState,setupStatus:'IN_PROGRESS',setupCompletedAt:null})}));await page.reload();await page.getByRole('status').filter({hasText:'完了していません'}).waitFor();assert.equal(await page.getByRole('heading',{name:'勤務設定をご確認ください',exact:true}).count(),0);await page.unroute('**/api/setup');}
   assert.equal(await digest(),before);console.log(engine.name()+' POST_SETUP_REVIEW_PASS 390px ADMIN, staff UI denied, settings/back/home, read-only content, retry, NEW/PARTIAL withheld, all tables unchanged');
  }finally{await browser.close();}
 }
 const membership=await p.membership.findFirstOrThrow({where:{tenantId:fixture.tenantId,userId:fixture.userId}});
 await p.membership.update({where:{tenantId_userId:{tenantId:membership.tenantId,userId:membership.userId}},data:{role:'STAFF'}});const staff=await login();const deniedBefore=await digest();assert.equal((await req(staff,'/setup')).status,403);assert.equal(await digest(),deniedBefore);
 await p.membership.update({where:{tenantId_userId:{tenantId:membership.tenantId,userId:membership.userId}},data:{role:'ADMIN'}});console.log('POST_SETUP_API_STAFF_403_PASS; no production access');
})().catch(e=>{console.error(e.name,e.message);process.exitCode=1;}).finally(async()=>{for(const f of [html,tsx])if(fs.existsSync(f))fs.unlinkSync(f);await p.$disconnect();});
