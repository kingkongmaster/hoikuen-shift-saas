const assert=require('node:assert/strict');
const {basicCandidateSet,basicMemberEligibility,basicRuleEligibility}=require('../dist/application/shifts/basic-candidate-evaluator');
const {fixedRule}=require('../dist/application/shifts/staff-work-rule-evaluator');
const {musubiGeneratorInput}=require('./helpers/musubi-generator-input.cjs');
const x=musubiGeneratorInput();const tenantId='anonymous-tenant';
const staff=x.staff.map(s=>({...s,tenantId,isActive:true,rotationEligible:true}));
const food=[21,22,23].map(i=>({...staff[0],id:'F'+i,employeeNumber:'F'+i,tenantId,isActive:true,rotationEligible:false}));
const input=(pattern,day)=>({tenantId,date:new Date(`2034-10-${String(day).padStart(2,'0')}T00:00:00Z`),pattern:x.patterns.find(p=>p.code===pattern),attributeId:day===7?'MUSUBI_SATURDAY_ROTATION':'MUSUBI_ROTATION',staff:[...staff,...food],rules:x.rules,attributes:x.options.staffAttributeAssignments,systemWorkPatternIds:x.options.systemWorkPatternIds});
const rows=[];
for(const [code,days] of [['EARLY',[2,3,4,5,6]],['P02',[2,3,4,5,6]],['P03',[2,3,4,5,6]],['P04',[2,3,4,5,6]],['P05',[2,3,4,5,6]],['LATE',[2,3,4,5,6]],['P07',[7]],['P08',[7]],['P09',[7]]]){
 for(const day of days){const a=input(code,day),r=basicCandidateSet(a);assert.equal(new Set(r.eligibleIds).size,r.eligibleIds.length);assert.ok(r.fixedIds.every(id=>r.eligibleIds.includes(id)));assert.ok(!r.eligibleIds.some(id=>id.startsWith('F')));assert.equal(r.exclusions.NOT_ROTATION_TARGET,3);
 const polluted={...a,staff:[...a.staff,...a.staff,{...staff[0],id:'foreign',tenantId:'other'},{...staff[0],id:'inactive',isActive:false}]};const pr=basicCandidateSet(polluted);assert.deepEqual(pr.eligibleIds,r.eligibleIds);assert.equal(pr.exclusions.INACTIVE_STAFF,1);
 if(code==='EARLY'){assert.ok(r.fixedIds.includes('S019'));assert.ok(!r.eligibleIds.includes('S020'));}if(code==='P02')assert.ok(r.fixedIds.includes('S016'));if(code==='P07')for(const id of ['S019','S020'])assert.ok(r.fixedIds.includes(id));if(['P08','P09'].includes(code))for(const id of ['S019','S020','S016'])assert.ok(!r.eligibleIds.includes(id));
 rows.push({code,weekday:a.date.getUTCDay(),count:r.eligibleIds.length,fixed:r.fixedIds.length,exclusions:r.exclusions});}
}
const a=input('P02',2);assert.equal(a.pattern.endTime,'16:30');assert.equal(fixedRule(a.rules,'S016',a.date).workPattern.endTime,'16:40');
const base=input('P03',2), member=staff.find(s=>!fixedRule(x.rules,s.id,base.date));
const r={id:'period',staffId:member.id,ruleType:'UNAVAILABLE_WORK_PATTERN',dayOfWeek:null,startDate:new Date('2034-01-01'),endDate:new Date('2034-01-31'),startTime:null,endTime:null,numericValue:null,priority:0,isHardConstraint:true,workPattern:base.pattern};
assert.equal(basicRuleEligibility([r],member.id,base.date,'OTHER',{startTime:'09:00',endTime:'17:30'},'P03').eligible,true);
r.startDate=new Date('2034-10-01');r.endDate=new Date('2034-10-31');assert.equal(basicRuleEligibility([r],member.id,base.date,'OTHER',{startTime:'09:00',endTime:'17:30'},'P03').eligible,false);
assert.equal(basicMemberEligibility({...staff[0],canWorkSaturdays:false},new Date('2034-10-07'),'OTHER').eligible,false);
console.log('BASIC_CANDIDATE_COMPONENT_TESTS_PASS: duplicates, scope, inactive, food, support, fixed, contract override, weekdays, bounded period');
console.log(JSON.stringify({fixture:'anonymous permanent master; no Production connection',rows}));

// Exhaustive preservation of legacy flag truth tables; no inference from pattern names.
for(let bits=0;bits<64;bits++)for(const day of [2,7])for(const type of ['EARLY','NORMAL','LATE','OTHER'])for(const legacy of [false,true]){
 const m={...staff[0],canWorkEarly:!!(bits&1),canWorkRegular:!!(bits&2),canWorkLate:!!(bits&4),earlyShiftOnly:!!(bits&8),lateShiftOnly:!!(bits&16),canWorkSaturdays:!!(bits&32)};
 const d=new Date(`2034-10-${String(day).padStart(2,'0')}`);
 const expected=!(day===7&&!m.canWorkSaturdays)&&!(type==='EARLY'&&(!m.canWorkEarly||m.lateShiftOnly))&&!(type==='LATE'&&(!m.canWorkLate||m.earlyShiftOnly))&&!(legacy&&type==='NORMAL'&&(!m.canWorkRegular||m.earlyShiftOnly||m.lateShiftOnly));
 assert.equal(basicMemberEligibility(m,d,type,legacy).eligible,expected);
}
console.log('FLAG_TRUTH_TABLE_1024_PASS');
// A prohibited fixed assignment must fall back to the ordinary path unchanged.
const fallback=input('P03',2), id='S019';
fallback.rules=[{...x.rules.find(r=>r.staffId===id&&r.dayOfWeek===1),id:'fixed',dayOfWeek:null}, {...r,id:'denyFixed',staffId:id,workPattern:x.patterns.find(p=>p.code==='EARLY'),startDate:null,endDate:null}];
assert.ok(basicCandidateSet(fallback).eligibleIds.includes(id));
console.log('PROHIBITED_FIXED_FALLBACK_PASS');
const periodInput=input('P03',2), original=basicCandidateSet(periodInput);
const expiredAttributes=periodInput.attributes.map(a=>a.staffId===member.id?{...a,startDate:new Date('2034-01-01'),endDate:new Date('2034-01-31')}:a);
assert.ok(!basicCandidateSet({...periodInput,attributes:expiredAttributes}).eligibleIds.includes(member.id));
assert.deepEqual(basicCandidateSet({...periodInput,rules:[...periodInput.rules,{...r,startDate:new Date('2034-01-01'),endDate:new Date('2034-01-31')}]}).eligibleIds,original.eligibleIds);
console.log('ATTRIBUTE_EXPIRY_AND_EXPIRED_RULE_PASS');
