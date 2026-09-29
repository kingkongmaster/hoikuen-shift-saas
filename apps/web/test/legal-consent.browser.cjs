const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {createRequire}=require('node:module');const req=createRequire(path.resolve(__dirname,'../../api/package.json'));const {PrismaClient}=req('@prisma/client');const safety=req('./test/helpers/isolated-database.cjs');safety.resolveIsolatedDatabaseUrl();const base=safety.resolveLocalApiBaseUrl();const origin=process.env.PROFILE_TEST_WEB_ORIGIN;assert.equal(new URL(origin).hostname,'127.0.0.1');const {webkit,chromium,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const fixture=JSON.parse(fs.readFileSync(process.env.PROFILE_TEST_FIXTURE,'utf8'));const p=new PrismaClient();const approved=process.env.LEGAL_TEST_APPROVED==='true';
async function main(){
 await p.user.update({where:{id:fixture.userId},data:{mustChangePassword:false}});
 for(const [engine,device] of [[webkit,devices['iPhone 13']],[chromium,devices['Pixel 7']]]){
  await p.tenant.update({where:{id:fixture.tenantId},data:{setupStatus:'IN_PROGRESS',setupCurrentStep:4,termsAcceptedAt:null,privacyAcceptedAt:null,termsVersion:null,privacyVersion:null}});
  const r=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fixture.email,password:'Synthetic-Initial-Aa7!'})});assert.equal(r.status,200);const token=(await r.json()).accessToken;
  const browser=await engine.launch({headless:true});const context=await browser.newContext({...device,viewport:{width:390,height:844},serviceWorkers:'block'});await context.addInitScript(t=>sessionStorage.setItem('enshift.accessToken',t),token);const page=await context.newPage();let consentWrites=0;page.on('request',r=>{if(r.method()==='PATCH'&&r.url().endsWith('/setup/consents'))consentWrites++;});
  try{
   await page.goto(origin);const checkbox=page.getByRole('checkbox',{name:'利用規約の全文を確認し、同意する',exact:true});await checkbox.waitFor();assert.equal(await checkbox.isChecked(),false);assert.equal(await checkbox.isDisabled(),!approved);
   for(const title of ['利用規約','プライバシーポリシー']){
    const opener=page.getByRole('button',{name:title+'全文を読む',exact:true});await opener.click();const dialog=page.getByRole('dialog',{name:title+'全文',exact:true});await dialog.waitFor();assert.ok(await dialog.locator('article section').count()>=12);
    const paragraph=dialog.locator('article section p').first();assert.ok(Number(await paragraph.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)))>=16);
    assert.equal(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('dialog')),true);
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await opener.evaluate(e=>e===document.activeElement),true);
    await opener.click();await dialog.getByRole('button',{name:'同意画面へ戻る'}).first().click();assert.equal(await opener.evaluate(e=>e===document.activeElement),true);
   }
   assert.equal(consentWrites,0,'reading never submits consent');
   const next=page.getByRole('button',{name:'保存して次へ',exact:true});assert.equal(await next.isDisabled(),true);
   if(approved){const privacy=page.getByRole('checkbox',{name:'プライバシーポリシーの全文を確認し、同意する',exact:true});await checkbox.focus();await page.keyboard.press('Space');assert.equal(await checkbox.isChecked(),true);assert.equal(await next.isDisabled(),true);await privacy.check();assert.equal(await next.isEnabled(),true);await checkbox.uncheck();assert.equal(await next.isDisabled(),true);await checkbox.check();await next.click();await page.getByRole('button',{name:'初期設定を完了',exact:true}).waitFor();assert.equal(consentWrites,1);}
   else {assert.ok(await page.getByRole('alert').count()>0);assert.equal(consentWrites,0);}
   await page.goto(origin+'/#terms');await page.getByRole('article',{name:'利用規約全文',exact:true}).waitFor();await page.getByRole('link',{name:'戻る',exact:true}).click();assert.equal(new URL(page.url()).hash,'');
   console.log(engine.name()+' LEGAL_390_PASS full text/back/focus/keyboard/checkbox '+(approved?'approved test fixture':'candidate blocked'));
  }finally{await context.close();await browser.close();}
 }
}
main().catch(e=>{console.error('LEGAL_BROWSER_HOLD',e.name,e.message,(e.stack||'').split('\n').filter(x=>x.includes('legal-consent.browser')).join('\n'));process.exitCode=1}).finally(()=>p.$disconnect());
