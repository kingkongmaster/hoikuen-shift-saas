const assert = require('node:assert/strict');
const { ShiftsService } = require('../dist/presentation/shifts/shifts.service');
const { materializeFixedAssignments } = require('../dist/application/shifts/fixed-assignment-materializer');
const times = [['07:30','16:00'], ['08:30','17:00'], ['08:00','16:30']];
const staff = times.map(([regularWorkStartTime, regularWorkEndTime], i) => ({ id:`fixed-${i}`, displayName:`Fixture ${i}`, canWorkSaturdays:false, regularWorkStartTime, regularWorkEndTime }));
const materialized = materializeFixedAssignments({ staff, requests:[], start:new Date('2026-10-01'), end:new Date('2026-11-01'), closedDates:[], sundayOperationEnabled:false, defaultBreakMinutes:60 });
const assignments = materialized.map(a=>({...a,staff:staff.find(s=>s.id===a.staffId)}));
const attrs = staff.flatMap(s=>['FIXED_ASSIGNMENT','GENERATOR_EXCLUDED'].map(code=>({staffId:s.id,startDate:null,endDate:null,attributeDefinition:{code}})));
const rules = staff.map(s=>({id:`rule-${s.id}`,staffId:s.id,ruleType:'AVAILABLE_TIME_RANGE',dayOfWeek:null,startDate:null,endDate:null,startTime:s.regularWorkStartTime,endTime:s.regularWorkEndTime,priority:100,isHardConstraint:true,workPattern:null,sourceType:'FORMAL_SOURCE_PACKAGE',sourceReference:JSON.stringify({sourceId:'MUSUBI-2026-039',approvalStatus:'APPROVED',decisionActorType:'RECORDED_ADMIN_ANSWER',locator:'/anonymous-fixed-time'})}));
const before=JSON.stringify(assignments);
function service(attributes=attrs, workRules=rules) {
 const scoped = q=>{assert.equal(q.where.tenantId,'tenant-a');assert.equal(q.where.isActive,true);assert.deepEqual([...q.where.staffId.in].sort(),staff.map(s=>s.id));};
 return new ShiftsService({staffAttributeAssignment:{findMany:async q=>{scoped(q);assert.equal(q.where.attributeDefinition.isActive,true);return attributes;}},staffWorkRule:{findMany:async q=>{scoped(q);return workRules;}}});
}
async function count(attributes=attrs,workRules=rules,rows=assignments) {const s=service(attributes,workRules);return s.warnings(rows,[],await s.fixedSaturdayCells('tenant-a',rows)).filter(w=>w.code==='SATURDAY_NOT_AVAILABLE').length;}
(async()=>{
 assert.equal(service().warnings(assignments,[]).length,15,'old flag-only path reproduces 15');
 assert.equal(await count(),0,'approved fixed opening-day work: 15 -> 0');
 assert.equal(await count([]),15,'no marks: actual Saturday-unavailable warnings retained');
 assert.equal(await count(attrs.filter(a=>a.attributeDefinition.code!=='GENERATOR_EXCLUDED')),15,'fixed mark alone is not an exemption');
 assert.equal(await count(attrs.map(a=>({...a,endDate:new Date('2026-09-30')}))),15,'expired marks do not exempt');
 assert.equal(await count(attrs.map(a=>({...a,startDate:new Date('2026-11-01')}))),15,'future marks do not exempt');
 assert.equal(await count(attrs,[]),15,'no approved time evidence: fail closed');
 assert.equal(await count(attrs,rules.map(r=>({...r,sourceReference:'{}'}))),15,'unapproved time evidence: fail closed');
 for(const ruleType of ['REQUIRED_DAY_OFF','UNAVAILABLE_DAY_OF_WEEK']) {
  assert.equal(await count(attrs,[...rules,...staff.map(s=>({id:`deny-${s.id}`,staffId:s.id,ruleType,dayOfWeek:6,startDate:null,endDate:null,priority:1,isHardConstraint:true,workPattern:null}))]),15,'real Saturday prohibition overrides fixed marks');
 }
 assert.equal(await count(attrs,[...rules,...staff.map(s=>({id:`deny-${s.id}`,staffId:s.id,ruleType:'REQUIRED_DAY_OFF',dayOfWeek:6,startDate:new Date('2026-10-10'),endDate:new Date('2026-10-10'),priority:1,isHardConstraint:true,workPattern:null}))]),3,'date-limited real prohibition retained');
 assert.equal(await count(attrs,rules,assignments.map(a=>({...a,endTime:a.endTime?'18:00':null}))),15,'outside fixed time is not exempt');
 assert.equal(await count(attrs,rules,assignments.map(a=>({...a,workPatternId:'rotation',workPattern:{code:'P07'}}))),15,'numbered rotation is not exempt');
 assert.equal(JSON.stringify(assignments),before,'warning evaluation never mutates generated/fixed cells');
 assert.deepEqual(materializeFixedAssignments({staff,requests:[],start:new Date('2026-10-01'),end:new Date('2026-11-01'),closedDates:[],sundayOperationEnabled:false,defaultBreakMinutes:60}),materialized,'fixed materialization identical');
 console.log('Fixed Saturday warnings PASS: false positive 15->0; real prohibitions retained; tenant scope; date scope; no assignment mutation');
})().catch(e=>{console.error(e);process.exitCode=1;});
