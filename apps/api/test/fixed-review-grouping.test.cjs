const assert=require('node:assert/strict');
const {groupFixedRules}=require('../dist/presentation/setup/workforce-review');
const rule=(staffId,dayOfWeek,extra={})=>({staffId,ruleType:'FIXED_WORK_PATTERN',dayOfWeek,startDate:null,endDate:null,workPattern:{code:'A',name:'A勤務'},...extra});
const rows=[...Array.from({length:5},(_,i)=>rule('anonymous-A',i+1)),rule('anonymous-B',6),rule('anonymous-A',null),rule('anonymous-A',1,{endDate:'2030-03-31'}),rule('anonymous-B',2,{endDate:'2030-03-31'})];
const original=JSON.stringify(rows),groups=groupFixedRules(rows);
assert.equal(groups.length,5); assert.deepEqual(groups[0].days,[1,2,3,4,5]);assert.equal(groups[0].staffCount,1);
assert.equal(JSON.stringify(rows),original);
assert.ok(groups.every(g=>!JSON.stringify(g).includes('anonymous-')));
assert.deepEqual(groupFixedRules([rule('A',1),rule('B',2)]).map(g=>g.days),[[1],[2]]);
assert.equal(groupFixedRules([rule('A',1),rule('A',1)])[0].staffCount,1);
assert.equal(groupFixedRules([{...rule('A',1),ruleType:'PREFERRED_WORK_PATTERN'}]).length,0);
console.log('FIXED_GROUPING_PASS same staff set required; period/null/duplicates preserved; identities excluded');

const {workforceReview}=require('../dist/presentation/setup/workforce-review');
const crypto=require('node:crypto');
(async()=>{
 let writes=0;
 const read=(value)=>({findMany:async()=>value});
 const db={staff:{count:async()=>23},workPattern:read([]),shiftStaffingRequirement:read([]),staffWorkRule:read(rows),department:read([]),staffAttributeAssignment:read([]),auditLog:read([]),tenantFeature:{findUnique:async()=>null},$executeRaw:()=>{writes++;throw Error('write forbidden')}};
 const r=await workforceReview(db,'anonymous-tenant',4);
 const {sourceDayScopes,fixedRuleGroups,digest,workConfirmed,staffConfirmed,...summary}=r;
 assert.equal(digest,crypto.createHash('sha256').update(JSON.stringify(summary)).digest('hex'));
 assert.equal(writes,0);assert.equal(workConfirmed,false);assert.equal(staffConfirmed,false);
 assert.equal(fixedRuleGroups.length,5);
 console.log('REVIEW_DIGEST_PASS additive presentation groups do not change existing confirmation digest; writes0');
})().catch(e=>{console.error(e.name);process.exitCode=1});

const {sourceReviewDayScopes}=require('../dist/presentation/setup/workforce-review');
const provenance={release1SourceProvenance:{matrixSourceId:'MUSUBI-2026-039',matrixSha256:'6db2e20d95802e185f2d21801dc513a1fd3b9f752c3544a393391229643869cb'}};
const patterns=[{code:'NORMAL',name:'renamed',startTime:'08:30',endTime:'17:00',isWorking:true},{code:'SAT_NORMAL',name:'other',startTime:'08:30',endTime:'16:00',isWorking:true}];
assert.deepEqual(sourceReviewDayScopes(provenance,patterns).map(x=>x.days),[[1,2,3,4,5],[6]]);
assert.deepEqual(sourceReviewDayScopes(null,patterns),[]);
assert.deepEqual(sourceReviewDayScopes({release1SourceProvenance:{matrixSourceId:'other'}},patterns),[]);
assert.deepEqual(sourceReviewDayScopes(provenance,patterns.map(p=>({...p,endTime:'18:00'}))),[]);
assert.deepEqual(sourceReviewDayScopes(provenance,patterns.map(p=>({...p,code:'unrelated',name:'普通出（土曜日）'}))),[]);
assert.deepEqual(sourceReviewDayScopes(provenance,patterns.map(p=>({...p,isWorking:false}))),[]);
console.log('SOURCE_DAY_SCOPE_PASS provenance/hash/code/time binding; no name inference');
