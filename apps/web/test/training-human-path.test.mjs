import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TRAINING_REVIEW_URL||'http://127.0.0.1:4176';
const out=resolve('../../reports/training/human-blocker');await mkdir(out,{recursive:true});
const audit=JSON.parse(await readFile('dist/training/build-audit.json','utf8'));
for(const module of ['src/features/auth/LoginPage.tsx','src/features/onboarding/FirstLoginExperience.tsx','src/features/dashboard/HomeDashboard.tsx','src/styles.css'])assert(audit.modules.includes(module),`Must reuse ${module}`);
const results=[];
for(const [name,engine,width,channel] of [['mac-chrome',chromium,1440,'chrome'],['chromium-pc',chromium,1440],['webkit-390',webkit,390],['chromium-390',chromium,390]]){
 const browser=await engine.launch(channel?{channel}:{});const page=await browser.newPage({viewport:{width,height:width===390?844:1000},hasTouch:width===390,isMobile:width===390});const requests=[],errors=[],violations=[];
 page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/training/');const f=page.frameLocator('#practice');const b=t=>f.getByRole('button',{name:t,exact:true});
 const back=async()=>{await page.getByRole('button',{name:'← 練習ガイドへ戻る',exact:true}).click();};
 const screen=async(index,id,heading)=>{
   await page.waitForURL(`${base}/training/#/admin/${index}`,{waitUntil:'commit'});
   await f.locator(`#practice-screen[data-training-screen="${id}"]`).waitFor();
   if(heading)await f.getByRole('heading',{name:heading,exact:true}).waitFor();
   assert((await page.locator('#practice').getAttribute('srcdoc')).includes('connect-src'));
   assert.equal(await page.locator('#practice').getAttribute('sandbox'),'allow-scripts allow-modals allow-forms');
   assert.equal(await page.locator('#practice').getAttribute('src'),null);
   assert(await page.getByRole('button',{name:'← 練習ガイドへ戻る',exact:true}).isVisible());
   assert(await f.getByRole('button',{name:'← 練習ガイドへ戻る',exact:true}).isVisible());
   assert.equal(await f.locator('body').evaluate(e=>e.scrollWidth>innerWidth+1),false);
 };
 const login=async()=>{await f.getByLabel('ログインID',{exact:true}).fill('practice');await f.getByLabel('パスワード',{exact:true}).fill('Practice123!');await b('ログイン').click();await screen(3,'welcome');await f.locator('#welcome-title').waitFor();};
 const tutorial=async(n)=>{await f.locator('.count-label').filter({hasText:`${n} / 3`}).waitFor();await f.locator('#tutorial-title').waitFor();assert.equal(new URL(page.url()).pathname,'/training/');};
 const tourNext=async()=>f.locator('#practice-screen').getByRole('button',{name:'次へ',exact:true}).click();
 await f.getByRole('heading',{name:'操作練習ガイド',exact:true}).waitFor();await f.getByRole('button',{name:/管理者 基本操作/}).click();await screen(1,'access','正式URLを開く');
 assert.equal(await f.getByText('補助メニュー',{exact:true}).count(),0);assert(await f.getByTestId('next').isDisabled());
 await b('練習のログイン画面へ').click();
 // Critical: assert actual reused login immediately, WITHOUT pressing generic Next.
 await screen(2,'login','AeN Shiftにログイン');assert(await f.getByLabel('ログインID',{exact:true}).isVisible());assert(await f.getByLabel('パスワード',{exact:true}).isVisible());
 const colors=await b('ログイン').evaluate(e=>({background:getComputedStyle(e).backgroundColor,brand:getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()}));assert.equal(colors.brand,'#568127');assert.equal(colors.background,'rgb(86, 129, 39)');
 await page.screenshot({path:resolve(out,name+'-login.png')});await back();await screen(1,'access','正式URLを開く');await b('練習のログイン画面へ').click();await screen(2,'login','AeN Shiftにログイン');
 await f.getByLabel('ログインID',{exact:true}).fill('practice');await f.getByLabel('パスワード',{exact:true}).fill('wrong-password');await b('ログイン').click();await f.getByRole('alert').waitFor();await screen(2,'login','AeN Shiftにログイン');
 await login();await back();await screen(2,'login','AeN Shiftにログイン');await login();
 await b('はじめる').click();await tutorial(1);await back();await f.locator('#welcome-title').waitFor();await b('はじめる').click();await tutorial(1);
 await tourNext();await tutorial(2);await back();await tutorial(1);await tourNext();await tutorial(2);
 await tourNext();await tutorial(3);await back();await tutorial(2);await tourNext();await tutorial(3);
 await b('ホームを見る').click();await f.getByRole('heading',{name:'今日の勤務',exact:true}).waitFor();await screen(3,'welcome');await page.screenshot({path:resolve(out,name+'-home.png')});
 await back();await tutorial(3);await b('ホームを見る').click();await b('ホームを確認しました').click();await f.getByTestId('next').click();await screen(4,'logout');
 // Remaining on the training route, guide Back and browser history also work.
 await b('← 練習ガイドへ戻る').click();await screen(3,'welcome');await back();await screen(2,'login','AeN Shiftにログイン');await page.goBack();await screen(3,'welcome');await page.goForward();await screen(2,'login','AeN Shiftにログイン');
 await back();await screen(1,'access');await back();await f.getByRole('heading',{name:'操作練習ガイド',exact:true}).waitFor();assert.equal(page.url(),base+'/training/');
 assert.equal(errors.length,0,errors.join('\n'));
 for(const request of requests){assert.equal(new URL(request.url).origin,base);assert(['GET','HEAD'].includes(request.method));assert(new URL(request.url).pathname.startsWith('/training/'),'No navigation into the official app');assert(!request.url.includes('/api/'));}
 const inner=await page.locator('#practice').elementHandle().then(h=>h.contentFrame());assert.equal(await inner.evaluate(()=>{try{void parent.localStorage.length;return false;}catch{return true;}}),true);
 results.push({name,browser:browser.version(),width,routeAndHeadings:'PASS',loginWithoutExtraNext:'PASS',welcomeBackEveryStage:'PASS',reusedUi:colors,iframeIsolation:'PASS',productionWrites:0,errors,requests,humanAcceptance:'separate human decision'});await browser.close();console.log(name,'PASS (automated regression; human acceptance recorded separately)');
}
await writeFile(resolve(out,'regression-results.json'),JSON.stringify(results,null,2));
