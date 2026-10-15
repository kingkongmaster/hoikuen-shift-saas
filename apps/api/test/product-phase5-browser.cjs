const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async({origin,operatorLogin,password,tenants,update,paid,db,call})=>{
 const express=require('express'),web=express();
 web.use('/api',express.raw({type:()=>true}),async(req,res)=>{const r=await fetch(origin+'/api'+req.url,{method:req.method,headers:{'content-type':'application/json',...(req.headers.authorization?{authorization:req.headers.authorization}:{})},...(!['GET','HEAD'].includes(req.method)?{body:req.body}:{})});res.status(r.status).type(r.headers.get('content-type')||'application/json').send(Buffer.from(await r.arrayBuffer()));});
 web.use(express.static(path.resolve(__dirname,'../../web/dist')));const server=web.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),out=path.resolve('output/product-phase5');await fs.mkdir(out,{recursive:true});
 const a=tenants[0];
 try{for(const [name,engine,width] of [['pc-chromium',chromium,1280],['mobile-chromium',chromium,390],['mobile-webkit',webkit,390]]){
  const browser=await engine.launch(),context=await browser.newContext({viewport:{width,height:900}}),errors=[],external=[];
  await context.route('**/*',r=>{if(!r.request().url().startsWith(base+'/')){external.push(r.request().url());return r.abort();}return r.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const button=n=>page.getByRole('button',{name:n,exact:true});
  async function login(id,hash=''){await page.goto(base+'/'+hash);await page.getByLabel('ログインID',{exact:true}).fill(id);await page.getByLabel('パスワード',{exact:true}).fill(password);await button('ログイン').click();}
  async function fit(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' overflow');}
  async function contract(){await button('最初のシフト作成へ').click();await page.locator('summary').filter({hasText:'その他のメニュー'}).click();await button('契約情報').click();await page.getByRole('heading',{name:'利用可能な機能',exact:true}).waitFor();}
  try{
   // Verify active plan UI against the actual API catalog, not a mock.
   for(const plan of (name==='pc-chromium'?['TRIAL','STANDARD','PROFESSIONAL','STANDARD']:['STANDARD','PROFESSIONAL'])){
    if(plan==='TRIAL')await db.tenantSubscription.update({where:{tenantId:a.id},data:{plan:'TRIAL',status:'TRIAL',cancelledAt:null,trialStartedAt:new Date(Date.now()-1000),trialEndsAt:new Date(Date.now()+30*86400000)}});else await update(a,paid(plan));
    await login(a.loginId);await contract();
    const info=await call(a.token,'GET','/subscription');const available=page.locator('article').filter({has:page.getByRole('heading',{name:'利用可能な機能',exact:true})});
    assert.deepEqual(await available.locator('li').allTextContents(),info.features);
    await fit();await page.screenshot({path:path.join(out,name+'-'+plan+'.png'),fullPage:true});await button('ログアウト').click();
   }
   await login(a.loginId);await contract();await page.getByLabel('解約理由',{exact:true}).fill('匿名画面検証');await button('利用期間末での解約を予約').click();await page.getByText('解約予定',{exact:true}).waitFor();await button('ログアウト').click();
   // Operator actually changes the contract from the existing operator UI.
   await login(operatorLogin,'#operator');await page.getByRole('heading',{name:'契約・利用状態の管理',exact:true}).waitFor();
   await page.getByLabel('契約を確認する園').selectOption(a.id);await page.getByLabel('契約の操作').selectOption('suspend');await page.getByLabel('変更理由',{exact:true}).fill('匿名画面停止');await button('契約変更を保存').click();await page.getByText('契約を更新しました。',{exact:true}).waitFor();await fit();await page.screenshot({path:path.join(out,name+'-operator.png'),fullPage:true});
   await page.getByLabel('契約の操作').selectOption('activate');await page.getByLabel('変更先プラン').selectOption('STANDARD');
   await page.getByLabel('契約開始日時').fill(new Date(Date.now()-86400000).toISOString().slice(0,16));await page.getByLabel('契約終了日時').fill(new Date(Date.now()+30*86400000).toISOString().slice(0,16));await page.getByLabel('確認済み契約の参照番号').fill('ANONYMOUS-UI-CONFIRMED');await button('契約変更を保存').click();await page.getByText('契約を更新しました。',{exact:true}).waitFor();
   assert.equal((await call(a.token,'GET','/subscription/access')).state,'ACTIVE');
   await page.getByLabel('契約の操作').selectOption('suspend');await button('契約変更を保存').click();await page.getByText('契約を更新しました。',{exact:true}).waitFor();await button('ログアウト').click();
   for(const [state,patch] of [['SUSPENDED',null],['CANCELLED',{status:'CANCELLED',reason:'匿名終了'}],['EXPIRED',{status:'EXPIRED'}],['PAST_DUE',{status:'PAST_DUE'}],['UNVERIFIED','malformed']]){
    if(patch==='malformed')await db.tenantSubscription.update({where:{tenantId:a.id},data:{currentPeriodEndsAt:null}});else if(patch)await update(a,patch);
    await login(a.loginId);await page.getByRole('heading',{name:'契約のご案内',exact:true}).waitFor();const access=await call(a.token,'GET','/subscription/access');assert.equal(access.readOnly,true);assert.equal(access.state,state);
    assert.equal(await page.getByRole('button',{name:'自動生成',exact:true}).count(),0);await fit();await page.screenshot({path:path.join(out,name+'-'+state+'.png'),fullPage:true});await button('ログアウト').click();
    if(state==='CANCELLED')await update(a,paid('STANDARD'));
   }
   await update(a,paid('STANDARD'));await login(a.loginId);await contract();await button('ログアウト').click();
   const b=tenants[1];await update(b,paid('STANDARD'));await login(b.loginId);await page.getByText(/保存済みの勤務条件に、現在の契約では利用できない設定/).waitFor();assert.equal(await button('最初のシフト作成へ').isDisabled(),true);await button('契約情報').click();await page.getByRole('heading',{name:'利用可能な機能',exact:true}).waitFor();await fit();await page.screenshot({path:path.join(out,name+'-downgrade.png'),fullPage:true});await button('ログアウト').click();await update(b,paid('PROFESSIONAL'));
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Phase5 browser PASS: '+name+' plans/cancellation/operator suspension/closed login/restart/downgrade; real API and no external requests');
  }catch(e){await page.screenshot({path:path.join(out,name+'-failure.png'),fullPage:true});console.error((await page.locator('body').innerText()).slice(0,1200));throw e;}finally{await browser.close();}
 }}finally{await new Promise(r=>server.close(r));}
};
