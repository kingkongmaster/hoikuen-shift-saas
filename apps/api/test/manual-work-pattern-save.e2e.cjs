// Run against a migrated, isolated local DB/API and this branch's Web. No real staff data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, scryptSync} = require('node:crypto');
const {resolveIsolatedDatabaseUrl, resolveLocalApiBaseUrl} = require('./helpers/isolated-database.cjs');
resolveIsolatedDatabaseUrl();
const base = resolveLocalApiBaseUrl();
const web = process.env.WEB_BASE_URL || 'http://127.0.0.1:4187';
assert.ok(['127.0.0.1','localhost'].includes(new URL(web).hostname));
const {PrismaClient} = require('@prisma/client');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const db = new PrismaClient();
const output = process.env.EVIDENCE_DIR || path.resolve('output/manual-work-pattern-save');
fs.mkdirSync(output,{recursive:true});
const date='2027-02-09', month='2027-02', run=randomUUID().slice(0,8), result={checks:[],externalRequests:[],browserErrors:[],requests:[]};
let browser;
const pass=(name,detail)=>{result.checks.push({name,status:'PASS',detail});console.log('PASS',name)};
async function api(token,route,method='GET',body){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
async function tenant(tag){
 const t=await db.tenant.create({data:{name:'匿名検証園'+tag,setupStatus:'COMPLETED'}});
 const password='Isolated-Manual-Only-2026!',salt=randomUUID();
 const user=await db.user.create({data:{email:`manual-${tag.toLowerCase()}-${run}@example.invalid`,displayName:'匿名管理者'+tag,passwordHash:salt+':'+scryptSync(password,salt,64).toString('hex')}});
 await db.membership.create({data:{tenantId:t.id,userId:user.id,role:'ADMIN'}});
 await db.tenantSubscription.create({data:{tenantId:t.id,plan:'PROFESSIONAL',status:'ACTIVE',currentPeriodStartedAt:new Date('2026-01-01'),currentPeriodEndsAt:new Date('2028-12-31')}});
 const staff=[];for(let i=1;i<=4;i++)staff.push(await db.staff.create({data:{tenantId:t.id,employeeNumber:'ANON-'+i,displayName:`保育士${tag}${i}`,assignedClass:'FREE',regularWorkStartTime:'08:15',regularWorkEndTime:'17:15'}}));
 await db.tenantShiftSetting.create({data:{tenantId:t.id,weekdayEarlyRequired:0,weekdayLateRequired:0,saturdayEarlyRequired:0,saturdayLateRequired:0,saturdayMinimumStaff:0,sundayOperationEnabled:false,saturdayOperationEnabled:false,maxConsecutiveWorkDays:31,maxConsecutiveEarlyDays:31,maxConsecutiveLateDays:31}});
 const schedule=await db.monthlyShift.create({data:{tenantId:t.id,targetMonth:new Date(month+'-01'),createdByUserId:user.id}});
 const login=await api('', '/auth/login','POST',{email:user.email,password});assert.equal(login.status,200);const token=login.body.accessToken;
 const setup=(await api(token,'/setup')).body;const consent=await api(token,'/setup/consents','PATCH',{acceptTerms:true,acceptPrivacy:true,termsVersion:setup.currentTermsVersion,privacyVersion:setup.currentPrivacyVersion,termsHash:setup.legalRelease.termsHash,privacyHash:setup.legalRelease.privacyHash});assert.equal(consent.status,200);
 const patterns=(await api(token,'/work-patterns')).body;const normal=patterns.find(p=>p.code==='NORMAL');
 // Deliberately fictional pattern times: do not encode any customer's working hours.
 const custom=async(code,name,start,end,rest,counts=true)=>db.workPattern.create({data:{tenantId:t.id,code,name,shortName:name,startTime:start,endTime:end,breakMinutes:rest,isWorking:true,countsTowardStaffing:counts}});
 const p3=await custom('TEST03','③','09:10','17:40',45),p4=await custom('TEST04','④','09:40','18:10',50),excluded=await custom('TRAINING','研修','10:00','16:00',30,false);
 const assignment=await db.shiftAssignment.create({data:{tenantId:t.id,monthlyShiftId:schedule.id,staffId:staff[0].id,workDate:new Date(date),shiftType:'OTHER',workPatternId:p3.id,startTime:p3.startTime,endTime:p3.endTime,breakMinutes:p3.breakMinutes,assignedClass:'FREE',note:'匿名・維持対象'}});
 await db.shiftAssignment.create({data:{tenantId:t.id,monthlyShiftId:schedule.id,staffId:staff[1].id,workDate:new Date(date),shiftType:'NORMAL',workPatternId:normal.id,startTime:'08:15',endTime:'17:15',breakMinutes:normal.breakMinutes,assignedClass:'FREE'}});
 const attr=await db.staffAttributeDefinition.create({data:{tenantId:t.id,code:'ANON_ROLE',name:'匿名資格',category:'QUALIFICATION'}});
 await db.staffAttributeAssignment.createMany({data:staff.map(s=>({tenantId:t.id,staffId:s.id,attributeDefinitionId:attr.id}))});
 const requirement=await db.shiftStaffingRequirement.create({data:{tenantId:t.id,code:'ANON03',name:'③必要人数',attributeDefinitionId:attr.id,workPatternId:p3.id,startDate:new Date(date),endDate:new Date(date),requiredCount:1,constraintLevel:'HARD'}});
 await db.staffWorkRule.create({data:{tenantId:t.id,staffId:staff[2].id,ruleType:'UNAVAILABLE_WORK_PATTERN',workPatternId:p3.id,startDate:new Date(date),endDate:new Date(date),priority:0,isHardConstraint:true}});
 const otherMonth=await db.monthlyShift.create({data:{tenantId:t.id,targetMonth:new Date('2027-03-01'),createdByUserId:user.id}});
 await db.shiftAssignment.create({data:{tenantId:t.id,monthlyShiftId:otherMonth.id,staffId:staff[0].id,workDate:new Date('2027-03-02'),shiftType:'NORMAL',workPatternId:normal.id,startTime:'08:15',endTime:'17:15'}});
 return {t,user,staff,schedule,token,normal,p3,p4,excluded,assignment,otherMonth,requirement};
}
async function snapshot(){const tables=['staff','staffWorkRule','staffWorkContract','shiftRequest','monthlyShift','shiftAssignment','workPattern','tenantClosedDate','shiftStaffingRequirement','staffAttributeAssignment'];const o={};for(const table of tables)o[table]=await db[table].findMany({orderBy:{id:'asc'}});return o;}
async function main(){
 const A=await tenant('A'),B=await tenant('B');
 const before=await snapshot();let expected=before;
 const read=()=>db.shiftAssignment.findUniqueOrThrow({where:{id:A.assignment.id}});
 const payload=(pattern,staffId=A.staff[0].id)=>({assignments:[{staffId,workDate:date,shiftType:pattern.code==='NORMAL'?'NORMAL':'OTHER',workPatternId:pattern.id,assignedClass:'FREE'}]});
 const evaluate=async(expectedCount)=>{const e=await api(A.token,`/shifts/${A.schedule.id}/evaluation`);assert.equal(e.status,200);const q=e.body.staffingRequirementEvaluations.find(r=>r.requirementId===A.requirement.id&&r.date===date);assert.equal(q.actualCount,expectedCount);return e.body;};
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',r=>{if(!['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)){result.externalRequests.push(r.request().url());return r.abort()}return r.continue()});
 await context.addInitScript(a=>{sessionStorage.setItem('enshift.accessToken',a.token);localStorage.setItem(`enshift.onboarding.completed:${a.t.id}:${a.user.id}`,'2026-10-23')},A);
 const page=await context.newPage();page.on('pageerror',e=>result.browserErrors.push(e.message));page.on('request',r=>{if(r.method()==='PUT'&&r.url().endsWith('/assignments'))result.requests.push(JSON.parse(r.postData()));assert.ok(!/\/(generate|confirm|reopen)$/.test(r.url()),'No generation/confirmation/reopen in this E2E')});
 async function open(){await page.goto(web);await page.getByRole('button').filter({hasText:'月間シフトを見る'}).click();await page.getByLabel('対象月',{exact:true}).fill(month);if(page.viewportSize().width < 1024) await page.getByLabel('表示日',{exact:true}).waitFor(); else await cell().waitFor();}
 const cell=(who=A.staff[0])=>page.getByRole('region',{name:'月間シフト表',exact:true}).locator(`select[aria-label*="${who.displayName}"][aria-label*="${date}"]`);
 async function selectAndSave(pattern){await cell().selectOption('pattern:'+pattern.id);const pending=page.waitForResponse(r=>r.url().endsWith('/assignments')&&r.request().method()==='PUT');await page.getByRole('button',{name:'下書きを保存（1件）',exact:true}).click();const r=await pending;assert.equal(r.status(),200,await r.text());assert.equal(result.requests.at(-1).assignments[0].workPatternId,pattern.id);assert.ok(result.requests.at(-1).expectedUpdatedAt);await page.getByRole('button',{name:'下書きを保存（0件）',exact:true}).waitFor();await page.getByRole('status').filter({hasText:'変更を保存しました。'}).waitFor();const data=await read();assert.equal(data.workPatternId,pattern.id);assert.equal(data.shiftType,pattern.code==='NORMAL'?'NORMAL':'OTHER');assert.equal(data.startTime,pattern.code==='NORMAL'?'08:15':pattern.startTime);assert.equal(data.endTime,pattern.code==='NORMAL'?'17:15':pattern.endTime);assert.equal(data.breakMinutes,pattern.breakMinutes);assert.equal(data.note,'匿名・維持対象');await page.screenshot({path:path.join(output,'saved-'+pattern.code+'.png'),fullPage:true});await open();assert.equal(await cell().inputValue(),'pattern:'+pattern.id);assert.ok((await cell().locator('option:checked').innerText()).includes(pattern.name));assert.ok((await cell().locator('option:checked').innerText()).includes(pattern.code==='NORMAL'?'08:15':pattern.startTime));return data;}
 await open();await evaluate(1);
 await selectAndSave(A.normal);await evaluate(0);await page.getByRole('complementary',{name:'保存済み下書きの再評価'}).getByText(/③必要人数：必要 1名・実績 0名/).waitFor();pass('1 ③→普通：UI・payload・DB・時刻・休憩・再表示・③人数0');
 await selectAndSave(A.p3);await evaluate(1);pass('2 普通→③：番号ID指定・再表示・③人数1');
 await selectAndSave(A.p4);await evaluate(0);pass('3 ③→④：同じOTHERでもID・時間・表示を更新');
 expected=await snapshot();await cell().selectOption('pattern:'+A.p3.id);assert.deepEqual(await snapshot(),expected);await page.getByRole('button',{name:'変更を取り消す',exact:true}).click();assert.equal(await cell().inputValue(),'pattern:'+A.p4.id);assert.deepEqual(await snapshot(),expected);await open();assert.equal(await cell().inputValue(),'pattern:'+A.p4.id);pass('4 変更取消：保存前DB不変・表示復元');pass('5 保存後再読込：全3方向でDBと表示一致');
 const beforeReevaluate=await snapshot();await page.getByRole('button',{name:'保存済み下書きを再評価',exact:true}).click();await page.getByRole('status').filter({hasText:'保存済み下書きの必要人数・必須条件を再評価しました。'}).waitFor();assert.deepEqual(await snapshot(),beforeReevaluate);pass('6 必要人数再集計：保存応答・再読込・再評価GET、勤務DB不変');
 // A per-staff HARD prohibition rejects the entire batch; not just a UI warning.
 await cell(A.staff[2]).selectOption('pattern:'+A.p3.id);const pending=page.waitForResponse(r=>r.url().endsWith('/assignments')&&r.request().method()==='PUT');await page.getByRole('button',{name:'下書きを保存（1件）',exact:true}).click();assert.equal((await pending).status(),409);await page.getByRole('status').filter({hasText:'変更した勤務が必須条件に違反しています。'}).first().waitFor();assert.deepEqual(await snapshot(),beforeReevaluate);await page.getByRole('button',{name:'変更を取り消す',exact:true}).click();
 const blocked=await api(A.token,`/shifts/${A.schedule.id}/assignments`,'PUT',{assignments:[payload(A.p3).assignments[0],payload(A.p3,A.staff[2].id).assignments[0]]});assert.equal(blocked.status,409);assert.deepEqual(await snapshot(),beforeReevaluate);pass('7 HARD禁止：UI保存409・複数セルも全体拒否・DB不変');
 for(const [token,route,method,body] of [[A.token,`/shifts/${B.schedule.id}/assignments`,'PUT',payload(B.p3)],[A.token,`/shifts/${A.schedule.id}/assignments`,'PUT',payload(B.p3)],[A.token,`/shifts/${A.schedule.id}/assignments`,'PUT',payload(A.p3,B.staff[0].id)],[B.token,`/shifts/${A.schedule.id}/evaluation`,'GET'],[A.token,`/shifts/${B.schedule.id}`,'GET']]){const r=await api(token,route,method,body);assert.ok([403,404].includes(r.status),JSON.stringify(r));}
 assert.deepEqual(await snapshot(),beforeReevaluate);pass('8 Tenant境界：他園シフト・職員・パターンID・評価を拒否');
 const after=await snapshot();for(const table of ['staff','staffWorkRule','staffWorkContract','shiftRequest','workPattern','tenantClosedDate','shiftStaffingRequirement','staffAttributeAssignment'])assert.deepEqual(after[table],before[table]);assert.deepEqual(after.shiftAssignment.filter(r=>r.id!==A.assignment.id),before.shiftAssignment.filter(r=>r.id!==A.assignment.id));assert.deepEqual(after.monthlyShift.filter(r=>r.id!==A.schedule.id),before.monthlyShift.filter(r=>r.id!==A.schedule.id));assert.ok(after.monthlyShift.every(r=>r.status==='DRAFT'));pass('9 他職員・他園・別月・職員マスター・条件・休暇不変');
 const stale=await api(A.token,`/shifts/${A.schedule.id}/assignments`,'PUT',{...payload(A.p3),expectedUpdatedAt:before.monthlyShift.find(r=>r.id===A.schedule.id).updatedAt.toISOString()});assert.equal(stale.status,409);assert.deepEqual(await snapshot(),after);pass('10 既存DRAFT保護：古い版409・未編集割当不変・再生成/FINAL 0');
 // Previously corrupt rows are detected, never silently rewritten on read.
 await db.shiftAssignment.update({where:{id:A.assignment.id},data:{shiftType:'NORMAL',workPatternId:A.p3.id}});const corrupt=await snapshot();const precheck=await api(A.token,`/shifts/${A.schedule.id}/precheck`,'POST');assert.equal(precheck.status,201);assert.ok(precheck.body.diagnostics.some(d=>d.code==='ASSIGNMENT_PATTERN_MISMATCH'));assert.equal(precheck.body.canGenerate,false);assert.deepEqual(await snapshot(),corrupt);pass('生成前チェック：保存済み勤務ID/種別の不整合検出・自動修復なし');await db.shiftAssignment.update({where:{id:A.assignment.id},data:{shiftType:'OTHER',workPatternId:A.p4.id}});
 const invalid=await api(A.token,`/shifts/${A.schedule.id}/assignments`,'PUT',{assignments:[{...payload(A.p3).assignments[0],shiftType:'NORMAL'}]});assert.equal(invalid.status,400);pass('IDと種別が不一致のpayloadを400拒否');
 await db.workPattern.update({where:{id:A.p3.id},data:{isActive:false}});assert.equal((await api(A.token,`/shifts/${A.schedule.id}/assignments`,'PUT',payload(A.p3))).status,404);await db.workPattern.update({where:{id:A.p3.id},data:{isActive:true}});pass('無効パターンを拒否');
 const fixed=await db.staffWorkRule.create({data:{tenantId:A.t.id,staffId:A.staff[1].id,ruleType:'FIXED_WORK_PATTERN',workPatternId:A.p3.id,startDate:new Date(date),endDate:new Date(date),priority:0,isHardConstraint:true}});
 const fixedBefore=await snapshot();assert.equal((await api(A.token,`/shifts/${A.schedule.id}/assignments`,'PUT',payload(A.p4,A.staff[1].id))).status,409);assert.deepEqual(await snapshot(),fixedBefore);await db.staffWorkRule.update({where:{id:fixed.id},data:{isActive:false}});pass('HARD固定勤務：同じOTHERの別番号への変更も拒否');

 // Staffing-excluded work must not count towards a generic requirement either.
 const generic=await db.shiftStaffingRequirement.create({data:{tenantId:A.t.id,code:'GENERIC',name:'出勤資格者',attributeDefinitionId:(await db.staffAttributeDefinition.findFirstOrThrow({where:{tenantId:A.t.id}})).id,startDate:new Date(date),endDate:new Date(date),requiredCount:2,constraintLevel:'HARD'}});
 assert.equal((await api(A.token,`/shifts/${A.schedule.id}/assignments`,'PUT',payload(A.excluded))).status,200);const e=await evaluate(0);assert.equal(e.staffingRequirementEvaluations.find(r=>r.requirementId===generic.id).actualCount,1);pass('配置人数に算入しない勤務設定を尊重');
 // Legacy clients without pattern ID resolve a standard pattern and clear any old custom ID.
 const legacy=await api(A.token,`/shifts/${A.schedule.id}/assignments`,'PUT',{assignments:[{staffId:A.staff[0].id,workDate:date,shiftType:'NORMAL',assignedClass:'FREE'}]});assert.equal(legacy.status,200);assert.equal((await read()).workPatternId,A.normal.id);pass('旧payload：普通勤務へ正規化・古い番号ID残存なし');
 // Mobile uses exactly the same catalogue and cancellation behavior.
 const beforeMobile=await snapshot();await page.setViewportSize({width:390,height:844});await open();await page.getByLabel('表示日',{exact:true}).fill(date);const mobile=page.getByTestId('daily-staff-card').filter({hasText:A.staff[0].displayName});await mobile.getByRole('combobox',{name:`${A.staff[0].displayName} ${date} 勤務パターン`}).selectOption('pattern:'+A.p3.id);await mobile.getByText('09:10〜17:40',{exact:true}).waitFor();await page.getByRole('button',{name:'この日の変更を取り消す',exact:true}).click();assert.deepEqual(await snapshot(),beforeMobile);await page.screenshot({path:path.join(output,'mobile-cancel.png'),fullPage:true});pass('モバイル日別編集：同じ勤務選択・時刻プレビュー・取消');
 assert.deepEqual(result.browserErrors,[]);assert.deepEqual(result.externalRequests,[]);pass('ブラウザ例外0・外部通信0');result.status='PASS';
}
main().catch(e=>{result.status='FAIL';result.error=e.stack;console.error(e.stack);process.exitCode=1}).finally(async()=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));await browser?.close();await db.$disconnect()});
