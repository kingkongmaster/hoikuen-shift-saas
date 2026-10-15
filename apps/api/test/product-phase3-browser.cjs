const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
module.exports=async({base,operatorLogin,password,tenants,run,track})=>{
 const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');const out=path.resolve('output/product-phase3');await fs.mkdir(out,{recursive:true});
 for(const [name,engine,width] of [['pc-chromium',chromium,1280],['mobile-chromium',chromium,390],['mobile-webkit',webkit,390]]){
  const browser=await engine.launch();const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{if(!route.request().url().startsWith(base+'/')){external.push(route.request().url());return route.abort();}return route.continue();});
  const button=name=>page.getByRole('button',{name,exact:true});
  async function fit(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' horizontal overflow');}
  async function login(id){await page.getByLabel('ログインID',{exact:true}).fill(id);await page.getByLabel('パスワード',{exact:true}).fill(password);await button('ログイン').click();}
  try{
   await page.goto(base+'/#operator');await login(operatorLogin);await page.getByRole('heading',{name:'新しい園の導入',exact:true}).waitFor();
   const code='ui-'+run+'-'+name;await page.getByLabel('園名',{exact:true}).fill('匿名UI園');await page.getByLabel('園コード',{exact:false}).fill(code);await page.getByLabel('管理者ログインID',{exact:true}).fill(code);await page.getByLabel('管理者表示名',{exact:true}).fill('匿名管理者');
   await button('園を作成して招待を発行').click();await page.getByLabel('招待情報（受け渡し用）').waitFor();const delivery=await page.getByLabel('招待情報（受け渡し用）').inputValue();await track();
   assert(!page.url().includes(JSON.parse(delivery).token));await fit();await button('招待情報を画面から消す').click();await page.screenshot({path:path.join(out,name+'-operator.png'),fullPage:true});await button('ログアウト').click();
   await page.goto(base+'/#register');await page.getByLabel('招待情報',{exact:true}).fill('null');await page.getByLabel('ログインID',{exact:true}).fill(code);await page.getByLabel('新しいパスワード',{exact:true}).fill(password);await page.getByLabel('パスワード（確認）',{exact:true}).fill(password);await button('登録する').click();await page.getByText('受け取った招待情報をそのまま貼り付けてください。',{exact:true}).waitFor();await page.getByLabel('招待情報',{exact:true}).fill(delivery);await page.getByLabel('ログインID',{exact:true}).fill(code);await page.getByLabel('新しいパスワード',{exact:true}).fill(password);await page.getByLabel('パスワード（確認）',{exact:true}).fill(password);await fit();await button('登録する').click();await page.getByText('登録が完了しました。設定したパスワードでログインしてください。',{exact:true}).waitFor();await page.getByRole('link',{name:'ログインへ戻る'}).click();await login(code);
   await page.getByRole('heading',{name:'最初のシフト作成の準備',exact:true}).waitFor();assert(await button('最初のシフト作成へ').isDisabled());await fit();
   await page.getByLabel('連絡先メールアドレス',{exact:true}).fill('anonymous-ui@example.invalid');await button('園基本情報を保存').click();await button('設定状況を更新').waitFor({state:'visible'});
   await button('部署').click();await page.getByLabel('部署名',{exact:true}).fill('匿名部署');await page.getByLabel('部署コード',{exact:false}).fill('GROUP');await button('部署を登録').click();await page.getByText('部署を登録しました。',{exact:true}).waitFor();await fit();
   await button('職員・勤務条件').click();await button('職員を登録').click();await page.getByRole('dialog').waitFor();await page.getByLabel('職員番号',{exact:false}).fill('ANON-UI');await page.getByLabel('氏名',{exact:false}).fill('匿名職員');await button('保存する').click();await page.getByRole('dialog').waitFor({state:'hidden'});await fit();
   await button('勤務設定・必要人数・休園日').click();await page.getByRole('heading',{name:'クラス別必要人数',exact:true}).waitFor();await page.getByLabel('平日早出',{exact:true}).fill('0');await page.getByLabel('平日遅出',{exact:true}).fill('0');await page.getByLabel('土曜保育',{exact:true}).uncheck();
   await page.locator('article').filter({has:page.getByRole('heading',{name:'必要人数',exact:true})}).getByRole('button',{name:'保存',exact:true}).click();await page.getByText('園設定を保存しました。',{exact:true}).waitFor();
   for(let i=0;i<6;i++){await page.getByLabel(i+'歳児 平日',{exact:true}).fill(i===0?'1':'0');if(i>0)await page.getByLabel(i+'歳児 有効',{exact:true}).uncheck();}
   await page.locator('article').filter({has:page.getByRole('heading',{name:'クラス別必要人数',exact:true})}).getByRole('button',{name:'保存',exact:true}).click();await page.getByText('クラス別必要人数を保存しました。',{exact:true}).waitFor();await fit();
   await button('勤務パターン').click();await page.getByText('現在のプランでは標準4パターンを利用できます。',{exact:true}).waitFor();await page.getByRole('button',{name:'編集',exact:true}).first().waitFor();await fit();
   await button('設定状況を更新').click();await page.getByRole('heading',{name:'シフト作成へ進めます',exact:true}).waitFor();await page.screenshot({path:path.join(out,name+'-ready.png'),fullPage:true});await page.reload();await page.getByRole('heading',{name:'シフト作成へ進めます',exact:true}).waitFor();
   await button('最初のシフト作成へ').click();await button('園の初期設定へ戻る').waitFor();await button('園の初期設定へ戻る').click();await page.getByRole('heading',{name:'シフト作成へ進めます',exact:true}).waitFor();
   await button('ログアウト').click();await page.goto(base+'/#operator');await login(tenants[0].loginId);await page.getByText('運営者専用の画面です。',{exact:true}).waitFor();assert.equal(await button('園を作成して招待を発行').count(),0);
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Phase3 browser PASS: '+name+' real operator → invite → login → profile → department → staff → conditions → patterns → ready → reload → dashboard → return; no external requests.');
  }finally{await track();await browser.close();}
 }
};
