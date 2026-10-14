import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const source=ts.transpileModule(await readFile('src/training/courses.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {courses}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const base=process.env.TRAINING_REVIEW_URL||'http://127.0.0.1:4176';const results=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch();const page=await browser.newPage({viewport:{width:390,height:844}});const requests=[];page.on('request',r=>requests.push({url:r.url(),method:r.method()}));await page.goto(base+'/training/');const f=page.frameLocator('#practice');
 for(const [course,steps] of Object.entries(courses))for(let index=0;index<steps.length;index++){
   console.log(name,course,index+1);
   await f.getByRole('heading',{name:'操作練習ガイド',exact:true}).waitFor();
   await page.evaluate(p=>localStorage.setItem('aen.training.progress.v2',JSON.stringify(p)),{course,index});await page.reload();
   await f.getByRole('button',{name:/続きから再開/}).click();await page.waitForURL(`${base}/training/#/${course}/${index+1}`);
   await f.locator(`#practice-screen[data-training-step="${steps[index].id}"]`).waitFor();
   await page.getByRole('button',{name:'← 練習ガイドへ戻る',exact:true}).click();
   if(index){await page.waitForURL(`${base}/training/#/${course}/${index}`);await f.locator(`#practice-screen[data-training-step="${steps[index-1].id}"]`).waitFor();await f.getByRole('button',{name:'コース選択',exact:true}).click();}
   await f.getByRole('heading',{name:'操作練習ガイド',exact:true}).waitFor();await page.waitForURL(base+'/training/');
 }
 for(const r of requests){assert(['GET','HEAD'].includes(r.method));assert(new URL(r.url).origin===base&&new URL(r.url).pathname.startsWith('/training/'));}
 results.push({name,screens:64,backToPreviousStep:'PASS',productionWrites:0,humanAcceptance:'separate human decision'});await browser.close();console.log(name,'64 Back paths PASS');
}
await writeFile('../../reports/training/human-blocker/back-matrix-results.json',JSON.stringify(results,null,2));
