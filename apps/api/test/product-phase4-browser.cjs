const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async({base,password,tenants})=>{
 const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');const out=path.resolve('output/product-phase4');await fs.mkdir(out,{recursive:true});
 for(const [name,engine,width] of [['pc-chromium',chromium,1280],['mobile-chromium',chromium,390],['mobile-webkit',webkit,390]]){
  const browser=await engine.launch();const context=await browser.newContext({viewport:{width,height:900}});const errors=[],external=[];
  await context.route('**/*',r=>{if(!r.request().url().startsWith(base+'/')){external.push(r.request().url());return r.abort();}return r.continue();});
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  const page=await context.newPage();await page.clock.setFixedTime(new Date('2032-02-15T03:00:00Z'));
  const button=n=>page.getByRole('button',{name:n,exact:true});
  async function login(id,pw){await page.goto(base);await page.getByLabel('ログインID',{exact:true}).fill(id);await page.getByLabel('パスワード',{exact:true}).fill(pw);await button('ログイン').click();}
  async function fit(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' overflow');}
  try{
   page.on('dialog',dialog=>dialog.accept());
   await login(tenants[0].loginId,password);await button('最初のシフト作成へ').click();
   await page.locator('.menu-tile').filter({has:page.getByText('シフト',{exact:true})}).click();
   await page.getByLabel('対象月',{exact:true}).fill('2032-02');await button('下書きへ戻す').click();
   await button('生成前チェック').click();await page.getByRole('heading',{name:'生成前チェック：生成可能',exact:true}).waitFor();
   await button('自動生成').click();await page.getByRole('heading',{name:'自動生成結果',exact:true}).waitFor();
   await fit();await page.screenshot({path:path.join(out,name+'-generation.png'),fullPage:true});
   await button('シフトを確定').click();await page.getByText('確定済み',{exact:true}).waitFor();await button('ログアウト').click();
   await login(tenants[1].loginId,password);await button('最初のシフト作成へ').click();
   await page.locator('.menu-tile').filter({has:page.getByText('シフト',{exact:true})}).click();
   await page.getByLabel('対象月',{exact:true}).fill('2032-02');await page.getByText('確定済み',{exact:true}).waitFor();await fit();
   await page.screenshot({path:path.join(out,name+'-admin-final.png'),fullPage:true});
   const popupPromise=context.waitForEvent('page');await button('印刷／PDF保存').click();const popup=await popupPromise;
   await popup.getByRole('heading',{name:/匿名園B 全職員シフト表/}).waitFor();
   assert((await popup.locator('style').innerText()).includes('@page{size:A4 landscape'));
   assert.equal(await popup.locator('tbody tr').count(),5);assert.equal(await popup.locator('thead th').count(),30);
   await popup.emulateMedia({media:'print'});await popup.screenshot({path:path.join(out,name+'-print.png'),fullPage:true});
   if(engine===chromium)await popup.pdf({path:path.join(out,name+'-A4.pdf'),preferCSSPageSize:true,printBackground:true});
   await popup.close();await button('ログアウト').click();
   await login(tenants[1].staffLogin,tenants[1].staffPassword);await button('はじめる').click();await button('次へ').click();await button('次へ').click();await button('ホームを見る').click();
   await page.locator('.menu-tile').filter({hasText:'カレンダー'}).click();await page.getByTestId('personal-calendar').waitFor();await page.getByText('✓ 確定済みシフト',{exact:true}).waitFor();
   await page.getByRole('gridcell',{name:/午後半休/}).waitFor();
   await page.getByRole('gridcell').filter({hasText:'4'}).first().click();await fit();await page.screenshot({path:path.join(out,name+'-staff-calendar.png'),fullPage:true});
   assert(!((await page.locator('body').innerText()).includes('匿名職員B')),'other staff name not exposed');
   await button('ホームへ戻る').click();await page.locator('.menu-tile').filter({hasText:'希望休'}).click();await page.getByRole('heading',{name:'希望休',exact:true,level:1}).waitFor();await fit();
   await page.getByRole('button',{name:'希望休を申請'}).first().click();await page.getByRole('dialog').waitFor();
   await page.getByLabel('希望日',{exact:false}).fill('2032-03-'+(name==='pc-chromium'?'02':name==='mobile-chromium'?'03':'04'));
   await page.getByLabel('職員コメント',{exact:true}).fill('匿名ブラウザ申請');await button('申請する').click();await page.getByRole('dialog').waitFor({state:'hidden'});
   await button('ホームへ戻る').click();await page.locator('.menu-tile').filter({hasText:'通知'}).click();await page.getByRole('heading',{name:'通知',exact:true}).waitFor();await page.getByText('シフト確定',{exact:true}).first().waitFor();await fit();
   await page.screenshot({path:path.join(out,name+'-staff-notifications.png'),fullPage:true});
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Phase4 browser PASS: '+name+' admin FINAL / A4 print / staff calendar / requests / notifications; no external requests');
  }catch(e){await page.screenshot({path:path.join(out,name+'-failure.png'),fullPage:true});console.error((await page.locator('body').innerText()).slice(0,1200));throw e;}finally{await browser.close();}
 }
};
