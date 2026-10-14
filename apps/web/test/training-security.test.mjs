import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.TRAINING_REVIEW_URL||'http://127.0.0.1:4176';
assert(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)||base==='https://shift.netforcemaster.com','Approved review/Production origin only');
const audit=JSON.parse(await readFile('dist/training/build-audit.json','utf8'));
assert.equal(audit.productionTransportModules,0);assert(!audit.modules.some(x=>x==='src/api/client.ts'||x==='src/App.tsx'));
const out=resolve('../../reports/training');await mkdir(out,{recursive:true});
const report=[];
for(const [name,engine,width] of [['chromium-pc',chromium,1440],['webkit-pc',webkit,1440],['chromium-390',chromium,390],['webkit-390',webkit,390]].filter(([name])=>!process.env.TRAINING_ENGINE||name===process.env.TRAINING_ENGINE)){
 const browser=await engine.launch();const context=await browser.newContext({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390});
 const page=await context.newPage();await page.route('**/*',r=>{const q=r.request();const u=new URL(q.url());return ['GET','HEAD'].includes(q.method())&&!u.pathname.startsWith('/api')?r.continue():r.abort('blockedbyclient');});await page.clock.setFixedTime(new Date('2026-10-09T03:00:00Z'));const network=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.protocol==='http:'||u.protocol==='https:'){network.push({method:r.method(),url:r.url()});assert.equal(u.origin,base);assert(['GET','HEAD'].includes(r.method()),'No mutating network request');assert(!u.pathname.startsWith('/api'),'No API request, including reads');}});
 page.on('dialog',async d=>{if(d.type()==='prompt')await d.accept('練習の確認');else await d.accept();});
 await page.goto(`${base}/training/`);await page.evaluate(()=>{sessionStorage.setItem('enshift.accessToken','production-token-sentinel');localStorage.setItem('business-sentinel','unchanged');});
 const frame=page.frameLocator('#practice');const b=(name)=>frame.getByRole('button',{name,exact:true});
 const next=async()=>{await frame.getByTestId('next').focus();await page.keyboard.press('Enter');};
 const click=async(title)=>{if(['やり直す','最初からやり直す','操作位置へ'].includes(title)&&!await b(title).isVisible())await frame.getByText('補助メニュー',{exact:true}).click();try{await b(title).filter({visible:true}).first().click();}catch(e){await page.screenshot({path:resolve(out,name+'-failure.png')});await writeFile(resolve(out,name+'-failure.txt'),await frame.locator('body').innerText()+'\n'+JSON.stringify(await frame.locator('input,select,textarea').evaluateAll(es=>es.map(e=>({tag:e.tagName,value:e.value,label:e.closest('label')?.textContent})))));throw e;}};
 const label=(name)=>frame.getByLabel(new RegExp('^'+name));
 const screenshot=async(suffix)=>{await page.screenshot({path:resolve(out,`${name}-${suffix}.png`)});};
 const check=async()=>{assert(await page.getByRole('button',{name:'← 練習ガイドへ戻る',exact:true}).isVisible());assert(await b('← 練習ガイドへ戻る').isVisible());assert.equal(await frame.locator('body').evaluate(e=>e.scrollWidth>innerWidth+1),false,'No document horizontal overflow');assert.equal(errors.length,0,errors.join('\n'));assert.doesNotMatch(await frame.locator('body').innerText(),/バックアップ|GitHub|migration|security|Production DB|データベース|\bB4\b/i,'No operator-maintenance topics');};
 await screenshot('entry');
 await frame.getByRole('button',{name:/管理者 基本操作/}).click();
 for(let n=0;n<38;n++){
  const i=n-6;
  await frame.getByTestId('progress').filter({hasText:`${n+1} / 38`}).waitFor();
  console.log(name,'admin',n+1);
  if(n===0){await click('練習のログイン画面へ');await frame.getByRole('heading',{name:'AeN Shiftにログイン',exact:true}).waitFor();await page.waitForURL(base+'/training/#/admin/2');}
  if(n===1||n===3){if(n===3)await click('ログアウト');await label('ログインID').fill('practice');await label('パスワード').fill('Practice123!');await click('ログイン');if(n===1)await frame.getByRole('heading',{name:/ようこそ/}).waitFor();else await frame.getByText('ログインしました。再ログイン時は端末で完了したガイドを繰り返す必要はありません。').waitFor();}
  if(n===2){await click('はじめる');await frame.locator('.count-label').filter({hasText:'1 / 3'}).waitFor();await frame.locator('#practice-screen').getByRole('button',{name:'次へ',exact:true}).click();await frame.locator('.count-label').filter({hasText:'2 / 3'}).waitFor();await frame.locator('#practice-screen').getByRole('button',{name:'次へ',exact:true}).click();await frame.locator('.count-label').filter({hasText:'3 / 3'}).waitFor();await click('ホームを見る');await click('ホームを確認しました');await screenshot('welcome-home');}
  if(n===4){assert.equal(await b('デスクトップからAeN Shiftを起動する（練習）').count(),0);await click('案内がない・確認できない');await click('Windowsの正式画面でインストール案内を確認した');await click('デスクトップからAeN Shiftを起動する（練習）');}
  if(n===5){await click('園設定');await click('登録内容を確認する');await screenshot('registration-readonly');await click('職員・クラス設定へ');await click('登録内容を確認しました');assert.equal(await frame.locator('#practice-screen input,#practice-screen select').count(),0);}
  if(n===32){await click('印刷／PDF保存');await frame.getByRole('heading',{name:'A4印刷プレビュー',exact:true}).waitFor();await page.getByRole('button',{name:'← 練習ガイドへ戻る',exact:true}).click();await frame.getByTestId('progress').filter({hasText:'33 / 38'}).waitFor();await click('確定シフトを確認しました');}
  if(n===33){await click('A4印刷プレビュー');await frame.locator('iframe[title="A4印刷プレビュー"]').waitFor();await click('PDF保存の練習');}
  if(n===34)await click('職員の月間シフトを開く');
  if(n===35){await label('交換する先生').selectOption('practice-user-1');await label('交換する日').fill('2026-10-21');assert.equal(await b('承認する').count(),0);await click('シフト交換を申請');await click('管理者として申請を確認');await click('承認する');}
  if(n===36)await click('管理者への相談内容を確認');
  if(i===0){await click('月間シフトを見る');await screenshot('home');}
  if(i===1){await click('編集');}
  if(i===2){await click('編集');await label('名称').fill('勤務①（練習）');await click('保存');}
  if(i===3){await click('新規登録');await label('コード').fill('PRACTICE');await label('名称').fill('練習の曜日別人数');await label('属性').selectOption('practice-attribute');await label('曜日').selectOption('1');await label('開始日').fill('2026-10-01');await label('終了日').fill('2026-10-31');await label('必要人数').fill('2');await click('保存');}
  if([4,5,6].includes(i)){await click('編集');await click('保存');}
  if(i===7){await label('種別').selectOption('NORMAL_GRANT');await label('失効日').fill('2027-12-31');await click('人間確認済みとして登録');}
  if(i===8||i===9){await label('単位').selectOption(i===8?'DAY':'HALF_DAY');await label('相談結果・確定理由').fill('練習用の相談結果');await click('取得を確定');await screenshot(i===8?'paid-day':'paid-half');}
  if(i===10){await click('半日を取得');}
  if(i===11||i===12){await click('希望休を申請');await frame.getByLabel(/^職員 \*/).selectOption('practice-staff-0');await frame.getByLabel(/^希望日/).fill('2026-10-22');if(i===12)await frame.getByLabel(/^種類/).selectOption('HALF_DAY_AM');await click('申請する');}
  if(i===13){await frame.getByPlaceholder('行事名').fill('練習の運動会');await click('行事を登録');}
  if(i===14){await label('休園日の日付').fill('2026-10-28');await label('休園日名称').fill('練習の休園日');await click('登録');}
  if(i===15){await frame.getByRole('heading',{name:'希望休：未提出',exact:true}).waitFor();await click('登録内容を確認して提出');for(let j=0;j<3;j++)await click('今月はありません');await frame.getByRole('heading',{name:'有給・半休：提出済み・該当0件',exact:true}).waitFor();}
  if(i===16){await click('生成前チェック');}
  if(i===17){await click('生成前チェック');await click('自動生成');}
  if(i===18||n===37){await click('シフトを確定');await frame.getByText(/この条件では最終決定できません。⑥/).waitFor();await screenshot('blocked');}
  if(i===19){await frame.getByLabel('勤務⑥を基礎勤務にする').check();await click('回答を保存');}
  if(i===20){await frame.getByLabel('勤務⑥を基礎勤務にする').check();await click('回答を保存');}
  if(i===21){await click('回答を反映して再評価');await click('生成前チェック');await click('自動生成');}
  if(i===22){await click('承認する');}
  if(i===23){await click('A4印刷プレビュー');await frame.locator('iframe[title="A4印刷プレビュー"]').waitFor();await screenshot('print');}
  if(i===24){await click('PDF保存の練習');}
  if(i===25){await click('シフトを確定');await frame.getByText('確定済み',{exact:true}).first().waitFor();}
  await check();if(n>1)await next();
 }
 await frame.getByRole('heading',{name:'管理者 基本操作を完了しました'}).waitFor();

 await click('コース選択へ');await frame.getByRole('button',{name:/管理者 実践編/}).click();
 for(let i=0;i<20;i++){
  console.log(name,'practical',i+1);
  await frame.getByTestId('progress').filter({hasText:`${i+1} / 20`}).waitFor();
  if(i===0){await label('対象月').selectOption('2026-10');await click('この月で始める');}
  if(i===1)await click('希望休を確認しました');
  if(i===2)await click('有給・半休を確認しました');
  if(i===3)await click('行事を確認しました');
  if(i===4)await click('休園日を確認しました');
  if(i===5)await click('必要人数を確認しました');
  if(i===6)await click('生成前チェック');
  if(i===7){await click('生成前チェック');await click('自動生成');}
  if(i===8){await click('不足を1件発生させる');await click('最終決定を試す');await frame.getByText(/この条件では最終決定できません。人数不足/).waitFor();await screenshot('practical-blocked');}
  if(i===9)await click('確認事項を開く');
  if(i===10)await click('配置案を回答する');
  if(i===11){await click('配置を反映して再評価');await frame.getByText(/必要1名・配置1名。不足0名/).waitFor();await screenshot('practical-reevaluation');}
  if(i===12)await click('下書きを確認しました');
  if(i===13){await click('A4印刷プレビュー');await frame.locator('iframe[title="A4印刷プレビュー"]').waitFor();await screenshot('practical-print');}
  if(i===14)await click('最終決定できるか確認');
  if(i===15){await click('シフトを確定');await frame.getByText('確定済み',{exact:true}).first().waitFor();}
  if(i===16)await click('確定シフトを確認しました');
  if(i===17){await click('A4印刷プレビュー');await frame.locator('iframe[title="A4印刷プレビュー"]').waitFor();await click('PDF保存の練習');}
  if(i===18)await click('職員の月間シフトを開く');
  if(i===19){await label('交換する先生').selectOption('practice-user-1');await label('交換する日').fill('2026-10-21');assert.equal(await b('承認する').count(),0);await click('シフト交換を申請');await click('管理者として申請を確認');await click('承認する');}
  await check();await next();
 }
 await frame.getByRole('heading',{name:'管理者 実践編を完了しました'}).waitFor();
 await click('コース選択へ');await frame.getByRole('button',{name:/職員 かんたん操作/}).click();
 for(let i=0;i<6;i++){
  console.log(name,'staff',i+1);
  if(i===0)await click('個人カレンダーを見る');
  if(i===1){await frame.getByRole('gridcell').first().click();await screenshot('staff-calendar');}
  if(i===2){await click('希望休を申請');await frame.getByLabel(/^希望日/).fill('2026-10-22');await click('申請する');}
  if(i===3){await click('既読にする');}
  if(i===4){await label('交換する先生').selectOption('practice-user-1');await label('交換する日').fill('2026-10-23');await click('シフト交換を申請');}
  if(i===5)await click('管理者への相談内容を確認');
  await check();await next();
 }
 await frame.getByRole('heading',{name:'職員 かんたん操作を完了しました'}).waitFor();
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('enshift.accessToken')),'production-token-sentinel');assert.equal(await page.evaluate(()=>localStorage.getItem('business-sentinel')),'unchanged');
 // Verify isolation with a real DOM action target, including same-origin credential access.
 const inner=page.frames().find(f=>f.url()==='about:srcdoc');
 assert.equal(await inner.evaluate(()=>{try{void parent.document.body;return false;}catch{return true;}}),true);
 assert.equal(await inner.evaluate(()=>{try{void localStorage.length;return false;}catch{return true;}}),true);
 const before=network.length;
 assert.equal(await inner.evaluate(async base=>{try{await fetch(base+'/api/training-write-probe',{method:'POST',body:'probe'});return false;}catch{return true;}},base),true);
 await page.waitForTimeout(80);assert.equal(network.length,before,'CSP blocks network before transmission');
 // Resume is bounded and contains no business data.
 await click('コース選択へ');await frame.getByRole('button',{name:/管理者 基本操作/}).click();await click('練習のログイン画面へ');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('aen.training.progress.v2'))?.index===1);await page.reload();await frame.getByRole('button',{name:/続きから再開/}).click();await frame.getByTestId('progress').filter({hasText:'2 / 38'}).waitFor();
 await click('やり直す');assert.equal(await frame.getByTestId('next').isDisabled(),true);await click('← 練習ガイドへ戻る');await frame.getByTestId('progress').filter({hasText:'1 / 38'}).waitFor();
 await b('練習のログイン画面へ').focus();await page.keyboard.press('Enter');await frame.getByTestId('progress').filter({hasText:'2 / 38'}).waitFor();
 await page.goBack();await frame.getByTestId('progress').filter({hasText:'1 / 38'}).waitFor();await page.goForward();await frame.getByTestId('progress').filter({hasText:'2 / 38'}).waitFor();
 await click('最初からやり直す');await frame.getByTestId('progress').filter({hasText:'1 / 38'}).waitFor();assert.equal(await frame.getByTestId('next').isDisabled(),true);await check();
 // Restore practical checkpoints after reload, including FINAL eligibility.
 await click('コース選択');await frame.getByRole('button',{name:/管理者 実践編/}).click();
 await page.waitForFunction(()=>{const p=JSON.parse(localStorage.getItem('aen.training.progress.v2'));return p?.course==='practical'&&p.index===0;});
 await page.evaluate(()=>localStorage.setItem('aen.training.progress.v2',JSON.stringify({course:'practical',index:14})));await page.reload();await frame.getByRole('button',{name:/続きから再開/}).click();await frame.getByTestId('progress').filter({hasText:'15 / 20'}).waitFor();await click('最終決定できるか確認');await next();await click('シフトを確定');await frame.getByText('確定済み',{exact:true}).first().waitFor();
 await click('最初からやり直す');await frame.getByTestId('progress').filter({hasText:'1 / 20'}).waitFor();assert.equal(await frame.getByTestId('next').isDisabled(),true);

 report.push({name,width,adminSteps:38,practicalSteps:20,staffSteps:6,productionRequests:0,productionWrites:0,errors,network});await browser.close();
}
await writeFile(resolve(out,'browser-results.json'),JSON.stringify(report,null,2));console.log(`PASS: ${report.length*64} guided steps, no production requests or writes.`);
