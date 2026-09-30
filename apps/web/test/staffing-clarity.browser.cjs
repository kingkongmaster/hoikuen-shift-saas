const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const html=path.join(root,'.staffing-clarity-test.html'),tsx=path.join(root,'.staffing-clarity-test.tsx');
assert.ok(!fs.existsSync(html)&&!fs.existsSync(tsx));
fs.writeFileSync(html,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/.staffing-clarity-test.tsx"></script></body></html>');
fs.writeFileSync(tsx,`import React from 'react';import {createRoot} from 'react-dom/client';import {WorkforceReviewStep} from './src/features/setup/WorkforceReviewStep';import './src/styles.css';
const times=[['08:30','17:00'],['08:30','16:00'],['07:30','16:00'],['08:00','16:30'],['09:00','17:30'],['09:30','18:00'],['10:00','18:30'],['11:00','19:30'],['07:30','15:00'],['09:30','17:00'],['10:30','18:00']];
const names=['普通出','普通出（土曜日）','①','②','③','④','⑤','⑥','⑦','⑧','⑨'];
const patterns=names.map((name,i)=>({code:name,name,startTime:times[i][0],endTime:times[i][1],isWorking:true})).reverse();
const fixed={ruleType:'FIXED_WORK_PATTERN',workPattern:{code:'A',name:'①'},startDate:null,endDate:null,startTime:null,endTime:null,numericValue:null,isHardConstraint:true};
const req=(name,dayOfWeek)=>({workPattern:{code:name,name},attributeDefinition:{code:'ROLE',name:'役割'},classType:null,dayOfWeek,startDate:null,endDate:null,requiredCount:['①','⑥','⑦','⑨'].includes(name)?2:1,constraintLevel:'HARD'});
const review={sourceDayScopes:[{code:'普通出',days:[1,2,3,4,5],exclusive:false,basis:'SOURCE_REVIEW_ONLY'},{code:'普通出（土曜日）',days:[6],exclusive:true,basis:'SOURCE_REVIEW_ONLY'}],fiscalYearStartMonth:4,patterns,requirements:[...['⑨','⑧','⑦'].map(n=>req(n,6)),...['⑥','⑤','④','③','②','①'].flatMap(n=>Array.from({length:5},(_,i)=>req(n,i+1)))],rules:[],fixedRuleGroups:[{rule:fixed,days:[1,2,3,4,5],staffCount:1}],staffCount:23,generatorCount:20,excludedCount:3,fixedAttributeCount:3,departments:[]};
createRoot(document.getElementById('root')).render(<WorkforceReviewStep setup={{workforceReview:review,classRequirements:[]}} step={2}/>);`);
const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5199','--strictPort'],{cwd:root,stdio:'ignore'});
(async()=>{for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:5199/.staffing-clarity-test.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
for(const engine of [webkit,chromium]){const browser=await engine.launch();try{const page=await browser.newPage({viewport:{width:390,height:844}});let writes=0;page.on('request',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.method()))writes++;});await page.goto('http://127.0.0.1:5199/.staffing-clarity-test.html');await page.getByRole('heading',{name:'勤務設定をご確認ください',exact:true}).waitFor();
const cards=page.getByRole('list',{name:'勤務パターン一覧'}).locator(':scope > li');assert.deepEqual(await cards.locator('strong').allTextContents(),['普通出','普通出（土曜日）','①','②','③','④','⑤','⑥','⑦','⑧','⑨']);
for(let i=2;i<11;i++)assert.ok((await cards.nth(i).innerText()).includes(i<8?'月〜金':'土曜日'));
assert.ok((await cards.nth(6).innerText()).includes('10:00〜18:30'));
assert.ok((await cards.nth(3).innerText()).includes('08:00〜16:30'));
assert.ok((await cards.nth(0).innerText()).includes('月〜金'));
assert.ok((await cards.nth(1).innerText()).includes('土曜日限定'));assert.equal(await page.getByText(/曜日設定なし/).count(),0);
const necessary=page.locator('details').filter({has:page.locator('summary',{hasText:'必要人数'})});assert.deepEqual(await necessary.locator('li strong').allTextContents(),['①：2名','②：1名','③：1名','④：1名','⑤：1名','⑥：2名','⑦：2名','⑧：1名','⑨：2名']);
const fixed=page.locator('details').filter({has:page.locator('summary',{hasText:'固定勤務'})});assert.equal(await fixed.locator('li').count(),1);assert.ok((await fixed.innerText()).includes('固定勤務：1名'));assert.ok((await fixed.innerText()).includes('月〜金'));assert.ok(!(await fixed.innerText()).includes('対象1名'));
assert.equal(await page.getByText(/出勤可能職員|未算定/).count(),0);assert.equal(await page.locator('input,table').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(writes,0);console.log(engine.name()+' STAFFING_CLARITY_390_PASS numbered requirements; grouped fixed; candidate counts absent; writes0');
}finally{await browser.close();}}
})().catch(e=>{console.error(e.name,e.message);process.exitCode=1;}).finally(()=>{server.kill();fs.unlinkSync(html);fs.unlinkSync(tsx);});
