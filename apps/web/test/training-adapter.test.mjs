import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
globalThis.window=new EventTarget();let attemptedNetwork=0;
globalThis.fetch=()=>{attemptedNetwork++;throw new Error('Network forbidden');};
const source=await readFile('src/training/mock-client.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {api,resetFixture,fixtureSummary,staffFixture,month,today,startPractical,practiceAction,practiceState,practiceCanFinalize,trainingRole,prepareSwapExercise}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const token='training-ADMIN',id=staffFixture[0].id;
resetFixture('paid-day','ADMIN');
await api.confirmPaidLeaveUsage(token,id,{unit:'DAY',usageDate:today,allocations:[{grantId:'practice-grant',allocatedHalfDays:2}],decisionNote:'練習'});
assert.equal(fixtureSummary().remaining,9);
await api.confirmPaidLeaveUsage(token,id,{unit:'HALF_DAY',usageDate:today,allocations:[{grantId:'practice-grant',allocatedHalfDays:1}],decisionNote:'練習'});
assert.deepEqual(fixtureSummary(),{granted:10,used:1.5,remaining:8.5,rate:15,statutoryRemaining:3.5});
const rows=await api.paidLeaveUsages(token,id);await api.cancelPaidLeaveUsage(token,id,rows[0].id,'練習');assert.equal(fixtureSummary().remaining,9.5);
resetFixture('draft','ADMIN');await assert.rejects(()=>api.generateShift(token,'practice-shift'));await api.precheckShift(token,'practice-shift');await api.generateShift(token,'practice-shift');assert.equal((await api.shifts(token,month)).schedule.status,'DRAFT');
resetFixture('final-blocked','ADMIN');await assert.rejects(()=>api.confirmShift(token,'practice-shift'),/⑥が1名不足/);assert.equal((await api.shifts(token,month)).schedule.status,'DRAFT');
resetFixture('final','ADMIN');await api.confirmShift(token,'practice-shift');assert.equal((await api.shifts(token,month)).schedule.status,'CONFIRMED');
await assert.rejects(()=>api.staff('real-token'));
const copy=await api.staff(token);copy[0].displayName='changed';assert.equal((await api.staff(token))[0].displayName,'保育士A');
resetFixture('today','STAFF');
for(const method of ['staff','paidLeaveBalance','workPatterns','confirmShift','generateShift','createShift','updateShiftSwap','createRuleException'])await assert.rejects(()=>api[method]('training-STAFF',id,{}),/管理者/);
assert((await api.shifts('training-STAFF',month)).assignments.every(a=>a.staffId===id));
// Exercise EVERY production API method against the local adapter, including unsupported methods.
// Neither a new production method nor an unknown operation can fall through to the transport.
const real=await readFile('src/api/client.ts','utf8');const methods=[...real.slice(real.indexOf('export const api =')).matchAll(/^\s{2}([A-Za-z]\w*)\(/gm)].map(m=>m[1]);
for(const method of methods){try{await api[method]('training-STAFF',id,{});}catch{ /* fail closed is expected */ }}
await assert.rejects(()=>api.futureUnknownMethod('training-STAFF'),/正式データには接続しません/);
assert.equal(attemptedNetwork,0);console.log(`PASS training adapter: ${methods.length} API methods, fail-closed, role isolation, leave math, final block, network attempts=0`);

startPractical();await assert.rejects(()=>api.confirmShift(token,'practice-shift'));
await assert.rejects(()=>api.generateShift(token,'practice-shift'));assert.equal(practiceState().generated,false);
await api.precheckShift(token,'practice-shift');await api.generateShift(token,'practice-shift');practiceAction('shortage');
await assert.rejects(()=>api.confirmShift(token,'practice-shift'));practiceAction('answer');
await assert.rejects(()=>api.confirmShift(token,'practice-shift'));practiceAction('reevaluate');
assert.equal(practiceState().shortage,false);assert.equal(practiceCanFinalize(),false);
const revised=await api.shifts(token,month);assert.equal(revised.assignments.find(a=>a.staffId===staffFixture[1].id&&a.workDate===month+'-15').workPattern.code,'⑥');
assert.equal(revised.assignments.find(a=>a.staffId===id&&a.workDate===month+'-22').shiftType,'PAID_LEAVE');
assert.equal(revised.assignments.find(a=>a.staffId===id&&a.workDate===month+'-23').shiftType,'AM_HALF');
assert(revised.assignments.filter(a=>a.workDate===month+'-28').every(a=>a.shiftType==='OFF'));
practiceAction('eligible');await api.confirmShift(token,'practice-shift');assert.equal((await api.shifts(token,month)).schedule.status,'CONFIRMED');
prepareSwapExercise();const beforeSwap=await api.shifts(token,month);trainingRole('STAFF');const swap=await api.createShiftSwap('training-STAFF',{targetMemberId:'practice-user-1',requestDate:month+'-21'});await assert.rejects(()=>api.updateShiftSwap('training-STAFF',swap.id,{status:'APPROVED'}));trainingRole('ADMIN');await api.updateShiftSwap(token,swap.id,{status:'APPROVED'});const afterSwap=await api.shifts(token,month);
assert.equal(afterSwap.assignments.find(a=>a.staffId===id&&a.workDate===month+'-21').startTime,beforeSwap.assignments.find(a=>a.staffId===staffFixture[1].id&&a.workDate===month+'-21').startTime);
startPractical(14);practiceAction('eligible');assert.equal(practiceCanFinalize(),true);startPractical();assert.equal(practiceCanFinalize(),false);
assert.equal(attemptedNetwork,0);console.log('PASS: practical workflow, answer is insufficient, real fixture placement evaluation, leave/closure, FINAL gate, swap roles/assignments, checkpoint/reset');
const courseJS=ts.transpileModule(await readFile('src/training/courses.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {courses}=await import('data:text/javascript;base64,'+Buffer.from(courseJS).toString('base64'));
const shell=await readFile('src/training/shell.js','utf8');
for(const [course,steps] of Object.entries(courses))assert(shell.includes(`${course}:${steps.length}`),'Parent progress bounds must match course lengths');
console.log('PASS: parent/sandbox progress bounds match all three courses');

resetFixture('submission','ADMIN');
let submission=await api.monthlySubmission(token,month);assert(submission.hasUnsubmitted);
await assert.rejects(()=>api.confirmShift(token,'practice-shift'),/提出確認/);
for(const item of submission.items){await assert.rejects(()=>api.confirmMonthlySubmission(token,month,item.category,{revision:999,inputDigest:item.inputDigest,state:'SUBMITTED_EMPTY'}));await api.confirmMonthlySubmission(token,month,item.category,{revision:item.revision,inputDigest:item.inputDigest,state:item.count?'SUBMITTED_WITH_DATA':'SUBMITTED_EMPTY'});}
assert.equal((await api.monthlySubmission(token,month)).hasUnsubmitted,false);
resetFixture('answer','ADMIN');let [review]=await api.managerReviews(token,month);
await assert.rejects(()=>api.reevaluateManagerReview(token,month,review.id,review.revision));
await api.answerManagerReview(token,month,review.id,review.revision,{option:'PATTERN_6'});
await assert.rejects(()=>api.confirmShift(token,'practice-shift'));
[review]=await api.managerReviews(token,month);await api.reevaluateManagerReview(token,month,review.id,review.revision);
await assert.rejects(()=>api.confirmShift(token,'practice-shift'));
await api.precheckShift(token,'practice-shift');await api.generateShift(token,'practice-shift');await api.confirmShift(token,'practice-shift');
resetFixture('today','STAFF');for(const method of ['setup','monthlySubmission','confirmMonthlySubmission','managerReviews','answerManagerReview','reevaluateManagerReview'])await assert.rejects(()=>api[method]('training-STAFF',month),/管理者/);
assert.equal(attemptedNetwork,0);console.log('PASS: current monthly submission / review / regeneration gates; staff admin access denied');
