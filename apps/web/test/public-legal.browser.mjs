// Verify the current shared public document renderer without a DB or credentials.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PRODUCT_REVIEW_URL;
assert(base && /^http:\/\/127\.0\.0\.1:\d+$/.test(base),'Loopback review server only');
const documents=JSON.parse((await readFile(new URL('../src/features/legal/legal-documents.ts',import.meta.url),'utf8')).split('export const LEGAL_DOCUMENTS = ')[1].replace(/ as const;\s*$/,''));
const normalize=s=>s.replace(/\s+/g,' ').trim();
for(const [name,engine,width] of [['pc-chromium',chromium,1280],['390-chromium',chromium,390],['390-webkit',webkit,390]]){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],forbidden=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>{const q=r.request();if(!q.url().startsWith(base+'/')||new URL(q.url()).pathname.startsWith('/api')||q.method()!=='GET'){forbidden.push(q.method()+' '+q.url());return r.abort();}return r.continue();});
  for(const kind of ['terms','privacy']){
   await page.goto(base+'/#'+kind);
   const doc=documents[kind],article=page.getByRole('article',{name:doc.title+'全文',exact:true});await article.waitFor();
   assert.equal(await article.locator('section').count(),doc.sections.length);
   const text=normalize(await article.innerText());
   for(const section of doc.sections){assert(text.includes(normalize(section.heading)));assert(text.includes(normalize(section.text)),'full text present');}
   assert((await article.locator('section p').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)))>=16);
   assert(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),'public page scrolls');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
   await article.locator('section').last().scrollIntoViewIfNeeded();
   assert(await page.evaluate(()=>scrollY>0),'last section reachable by page scrolling');
   await page.getByRole('link',{name:'戻る',exact:true}).click();await page.getByRole('heading',{name:'AeN Shiftにログイン',exact:true}).waitFor();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
  console.log('PUBLIC_LEGAL_PASS '+name+': complete terms/privacy, page scrolling, readable text, return, API writes 0');
 }finally{await browser.close();}
}
