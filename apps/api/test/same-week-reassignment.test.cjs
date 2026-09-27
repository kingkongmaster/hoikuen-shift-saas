const assert=require('node:assert/strict');
const {generateRuleBasedSchedule:generate}=require('../dist/application/shifts/rule-based-shift-generator');
const {fixedRule,ruleEligibility}=require('../dist/application/shifts/staff-work-rule-evaluator');
const {musubiGeneratorInput}=require('./helpers/musubi-generator-input.cjs');
const input=musubiGeneratorInput();const date=s=>new Date(s+'T00:00:00.000Z');
const deficits=r=>r.staffingRequirementEvaluations.filter(x=>!x.isSatisfied).map(x=>[x.date,x.code,x.requiredCount-x.actualCount]);
const run=(options=input.options,staff=input.staff,requests=[])=>generate(date('2035-01-01'),staff,requests,options);
const beforeStart=performance.now();const before=run({...input.options,sameWeekReassignment:false});const beforeMs=performance.now()-beforeStart;
assert.deepEqual(deficits(before).map(x=>x[2]),[2,2,1,2]);
const afterStart=performance.now();const after=run();const afterMs=performance.now()-afterStart;
assert.deepEqual(deficits(after).map(x=>x[2]),[1,1,1,1]);
assert.equal(after.sameWeekReassignment.accepted,3);assert.ok(after.sameWeekReassignment.attempts<=after.sameWeekReassignment.maxAttempts);
assert.ok(after.sameWeekReassignment.examined<=after.sameWeekReassignment.maxPlans);
assert.deepEqual(after.approvedWeeklyThirdAssignments,[]);
const shortageWarnings=after.warnings.filter(w=>w.code==='WEEKLY_PATTERN_RELAXATION_EXHAUSTED');
assert.equal(shortageWarnings.length,4);
for(const w of shortageWarnings){assert.match(w.message,/必要2名・配置1名・不足1名/);assert.match(w.message,/週2回までの最小緩和でも解消できませんでした/);assert.match(w.message,/管理者判断が必要/);}
assert.deepEqual(after,run(),'same input has identical assignments, diagnostics and counters');
const group=new Set(['EARLY','P02','P03','P04','P05','LATE']);const exempt=new Set(['S008','S016','S019']);const counts=new Map();
for(const a of after.assignments){
 const d=a.workDate.toISOString().slice(0,10);const week=new Date(a.workDate);week.setUTCDate(week.getUTCDate()-(week.getUTCDay()+6)%7);
 if(group.has(a.workPatternId)){const k=a.staffId+week.toISOString();counts.set(k,(counts.get(k)||0)+1);if(!exempt.has(a.staffId))assert.ok(counts.get(k)<=2);}
 const fixed=fixedRule(input.rules,a.staffId,a.workDate);
 if(a.startTime&&fixed){assert.equal(a.workPatternId,fixed.workPattern.id);assert.equal(a.startTime,fixed.workPattern.startTime);assert.equal(a.endTime,fixed.workPattern.endTime);}
 if(a.startTime&&!fixed)assert.equal(ruleEligibility(input.rules,a.staffId,a.workDate,a.shiftType,{startTime:a.startTime,endTime:a.endTime},a.workPatternId).eligible,true);
 const prev=after.assignments.find(b=>b.staffId===a.staffId&&+b.workDate===+a.workDate-86400000);
 if(prev?.workPatternId==='P05')assert.notEqual(a.workPatternId,'EARLY');
 if(a.staffId==='S016'&&a.workDate.getUTCDay()===6)assert.equal(a.shiftType,'OFF');
 assert.ok(input.staff.some(s=>s.id===a.staffId),'no foreign/food worker can enter rotation');
}
assert.ok(after.warnings.some(w=>w.code==='PROVISIONAL_SOFT_DEFERRED_FOR_HARD'));
assert.ok(after.warnings.filter(w=>w.level==='ERROR').every(w=>['WORK_PATTERN_REQUIREMENT_SHORTAGE','WEEKLY_PATTERN_RELAXATION_EXHAUSTED','STAFFING_REQUIREMENT_HARD'].includes(w.code)));
// Small adversarial input: A is consumed by Mon/Tue; B can take Monday's
// intermediate pattern but cannot work late. Only a same-week exchange helps.
function tiny(){
 const {patterns,options}=musubiGeneratorInput();const p=new Map(patterns.map(x=>[x.code,x]));
 const staff=['A','B'].map(id=>({...input.staff[0],id,employeeNumber:id,displayName:id,assignedClass:'FREE',canWorkLate:id==='A'}));
 const req=(day,pattern)=>({id:day,code:day,name:pattern,attributeDefinitionId:'local',workPatternId:pattern,workPattern:p.get(pattern),classType:null,startDate:date(day),endDate:date(day),dayOfWeek:null,requiredCount:1,constraintLevel:'HARD'});
 return {staff,p,options:{...options,provisionalSoftRules:[],conditionalStaffingRequirements:[],staffWorkRules:[{id:'B-no-P04',staffId:'B',ruleType:'UNAVAILABLE_WORK_PATTERN',workPattern:p.get('P04'),dayOfWeek:null,startDate:null,endDate:null,startTime:null,endTime:null,numericValue:null,priority:1,isHardConstraint:true}],classRequirements:[{classType:'AGE_0',weekdayRequired:0,saturdayRequired:0,isActive:true}],staffAttributeAssignments:staff.map(s=>({staffId:s.id,attributeDefinitionId:'local',startDate:null,endDate:null})),staffingRequirements:[req('2035-01-01','P03'),req('2035-01-02','P04'),req('2035-01-05','LATE')],weeklyPatternGroupExemptStaffIds:[],closedDates:Array.from({length:31},(_,i)=>i+1).filter(i=>![1,2,5].includes(i)).map(i=>({closedDate:date('2035-01-'+String(i).padStart(2,'0')),name:'test closed'})),meetingDayRules:[]}};
}
const t=tiny();assert.equal(deficits(run(t.options,t.staff)).length,0);
assert.equal(deficits(run({...t.options,sameWeekReassignment:false},t.staff)).length,1);
for(const requestType of ['PAID_LEAVE','DAY_OFF','HALF_DAY_AM','HALF_DAY_PM']){
 const requests=[{staffId:'B',requestDate:date('2035-01-01'),requestType,reason:null}];
 const r=run(t.options,t.staff,requests);assert.equal(r.sameWeekReassignment.accepted,0,'leave/request blocks replacement');
 const row=r.assignments.find(a=>a.staffId==='B'&&+a.workDate===+date('2035-01-01'));assert.notEqual(row.workPatternId,'P03');
}
const rule=(type,pattern,dayOfWeek=1)=>({id:type,staffId:'B',ruleType:type,workPattern:pattern?t.p.get(pattern):null,dayOfWeek,startDate:null,endDate:null,startTime:null,endTime:null,numericValue:null,priority:1,isHardConstraint:true});
for(const rules of [[rule('FIXED_WORK_PATTERN','NORMAL')],[rule('REQUIRED_DAY_OFF')],[{...rule('AVAILABLE_TIME_RANGE'),startTime:'08:30',endTime:'17:00'}]]){
 const r=run({...t.options,staffWorkRules:[...t.options.staffWorkRules,...rules]},t.staff);assert.equal(r.sameWeekReassignment.accepted,0,'fixed/day/contract cannot be changed');
}
const transition=tiny();transition.options.staffingRequirements[0]={...transition.options.staffingRequirements[0],workPatternId:'P05',workPattern:transition.p.get('P05')};transition.options.staffWorkRules.push(rule('FIXED_WORK_PATTERN','EARLY',2));
const tr=run(transition.options,transition.staff);assert.equal(tr.sameWeekReassignment.accepted,0,'repair cannot introduce P05 -> next EARLY');assert.ok(!tr.warnings.some(w=>w.code==='PATTERN_TRANSITION_BLOCKED'),'rejected replay diagnostics do not leak into result');
const crossWeek=tiny();crossWeek.options.staffingRequirements[2]={...crossWeek.options.staffingRequirements[2],id:'2035-01-12',code:'2035-01-12',startDate:date('2035-01-12'),endDate:date('2035-01-12')};crossWeek.options.closedDates=crossWeek.options.closedDates.filter(x=>+x.closedDate!==+date('2035-01-12'));const cw=run(crossWeek.options,crossWeek.staff);assert.equal(cw.sameWeekReassignment.accepted,0,'prior week is not rearranged');
const original=JSON.stringify(t);t.options.staffAttributeAssignments.push({staffId:'OTHER_TENANT_ONLY',attributeDefinitionId:'local',startDate:null,endDate:null});const sentinel=JSON.stringify(t.options.staffAttributeAssignments);const scoped=run(t.options,t.staff);assert.equal(JSON.stringify(t.options.staffAttributeAssignments),sentinel);assert.ok(scoped.assignments.every(a=>['A','B'].includes(a.staffId)));
// Exhausted searches must stop at the configured replay budget, retain
// their real shortage diagnostics and return the unchanged legal schedule.
const bounded=tiny();
bounded.staff=[bounded.staff[0],...Array.from({length:11},(_,i)=>({...bounded.staff[1],id:'B'+i,employeeNumber:'B'+String(i).padStart(2,'0'),displayName:'anonymous'}))];
bounded.options.staffAttributeAssignments=bounded.staff.map(s=>({staffId:s.id,attributeDefinitionId:'local',startDate:null,endDate:null}));
bounded.options.staffWorkRules=bounded.staff.slice(1).flatMap(s=>['P03','P04'].map(code=>({...rule('UNAVAILABLE_WORK_PATTERN',code,null),id:s.id+code,staffId:s.id})));
bounded.options.staffingRequirements=[0,7,14,21].flatMap(offset=>t.options.staffingRequirements.map(r=>{const d=new Date(r.startDate);d.setUTCDate(d.getUTCDate()+offset);return {...r,id:r.id+'-'+offset,code:r.code+'-'+offset,startDate:d,endDate:d};}));
const open=new Set(bounded.options.staffingRequirements.map(r=>r.startDate.toISOString().slice(0,10)));bounded.options.closedDates=Array.from({length:31},(_,i)=>date('2035-01-'+String(i+1).padStart(2,'0'))).filter(d=>!open.has(d.toISOString().slice(0,10))).map(closedDate=>({closedDate,name:'test closed'}));
const stopped=run(bounded.options,bounded.staff);assert.equal(stopped.sameWeekReassignment.attempts,stopped.sameWeekReassignment.maxAttempts);assert.equal(stopped.sameWeekReassignment.limitReached,true);assert.equal(stopped.sameWeekReassignment.accepted,0);assert.equal(deficits(stopped).length,4);
for(const summary of after.specialShiftSummary){assert.equal(summary.earlyCount,after.assignments.filter(a=>a.staffId===summary.staffId&&a.shiftType==='EARLY').length);assert.equal(summary.lateCount,after.assignments.filter(a=>a.staffId===summary.staffId&&a.shiftType==='LATE').length);}
console.log(JSON.stringify({pass:true,beforeDeficit:7,afterDeficit:4,repairs:3,beforeMs:Math.round(beforeMs),afterMs:Math.round(afterMs),search:after.sameWeekReassignment,checks:['structural-warning','weekly-max2','transition','fixed','leave-full-half','weekday','contract','tenant-input-scope','soft-hard','determinism','same-week-only']}));
