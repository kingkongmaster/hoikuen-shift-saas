const assert = require('node:assert/strict');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');

const month = new Date('2026-09-01T00:00:00.000Z');
const staff = (id) => ({ id, employeeNumber:id, displayName:id, assignedClass:'FREE', employmentType:'FULL_TIME', canWorkEarly:true, canWorkRegular:true, canWorkLate:true, earlyShiftOnly:false, lateShiftOnly:false, canWorkSaturdays:true, monthlyWorkHourLimit:300, weeklyAvailableDays:7 });
const patterns = {
  P01:{id:'p01',code:'01',startTime:'07:30',endTime:'16:00',breakMinutes:60,isWorking:true,isActive:true},
  P03:{id:'p03',code:'03',startTime:'09:00',endTime:'17:30',breakMinutes:60,isWorking:true,isActive:true},
  P02:{id:'p02',code:'02',startTime:'08:00',endTime:'16:30',breakMinutes:60,isWorking:true,isActive:true},
  P06:{id:'p06',code:'06',startTime:'11:00',endTime:'19:30',breakMinutes:60,isWorking:true,isActive:true},
  NORMAL:{id:'normal',code:'NORMAL',startTime:'08:30',endTime:'17:00',breakMinutes:60,isWorking:true,isActive:true},
};
const fixed = (id, staffId, pattern, date) => ({ id,staffId,ruleType:'FIXED_WORK_PATTERN',dayOfWeek:null,startDate:new Date(`${date}T00:00:00Z`),endDate:new Date(`${date}T00:00:00Z`),startTime:null,endTime:null,numericValue:null,priority:100,isHardConstraint:true,workPattern:pattern });
const base = { weekdayEarlyRequired:0,weekdayLateRequired:0,saturdayEarlyRequired:0,saturdayLateRequired:0,saturdayMinimumStaff:0,saturdayOperationEnabled:true,sundayOperationEnabled:false,maxConsecutiveWorkDays:31,maxConsecutiveEarlyDays:31,maxConsecutiveLateDays:31,defaultStartEarly:'07:30',defaultEndEarly:'16:00',defaultStartNormal:'08:30',defaultEndNormal:'17:00',defaultStartLate:'11:00',defaultEndLate:'19:30',defaultBreakMinutes:60,classRequirements:[],weeklyPatternGroups:[{groupCode:'MUSUBI_01_06',maxPerWeek:1,workPatternIds:['p01','p02','p03','p06']}],systemWorkPatternIds:{EARLY:'p01',NORMAL:'normal',LATE:'p06'} };
const assigned = (result, id, date) => result.assignments.find((row) => row.staffId===id && row.workDate.toISOString().slice(0,10)===date);
const blocked = (result) => result.warnings.some((row) => row.code==='WEEKLY_PATTERN_GROUP_LIMIT_BLOCKED');

for (const [label, first, second] of [['①→①',patterns.P01,patterns.P01],['①→③',patterns.P01,patterns.P03],['③→⑥',patterns.P03,patterns.P06]]) {
  const result=generateRuleBasedSchedule(month,[staff(label)],[],{...base,staffWorkRules:[fixed('a',label,first,'2026-09-01'),fixed('b',label,second,'2026-09-03')]});
  assert.notEqual(assigned(result,label,'2026-09-03').workPatternId,second.id,`${label}は同一週NG`); assert.ok(blocked(result));
}
const once=generateRuleBasedSchedule(month,[staff('ONCE')],[],{...base,staffWorkRules:[fixed('once','ONCE',patterns.P03,'2026-09-01')]});
assert.equal(assigned(once,'ONCE','2026-09-01').workPatternId,'p03','①〜⑥が週1回だけならPASS');
const normalThen=generateRuleBasedSchedule(month,[staff('NORMAL-THEN')],[],{...base,staffWorkRules:[fixed('n','NORMAL-THEN',patterns.NORMAL,'2026-09-01'),fixed('g','NORMAL-THEN',patterns.P03,'2026-09-03')]});
assert.equal(assigned(normalThen,'NORMAL-THEN','2026-09-03').workPatternId,'p03','普通勤務はグループ回数に含めない');
const cross=generateRuleBasedSchedule(month,[staff('CROSS')],[],{...base,priorAssignments:[{staffId:'CROSS',workDate:new Date('2026-08-31T00:00:00Z'),shiftType:'OTHER',workPatternId:'p06'}],staffWorkRules:[fixed('cross','CROSS',patterns.P01,'2026-09-01')]});
assert.notEqual(assigned(cross,'CROSS','2026-09-01').workPatternId,'p01','月跨ぎ8/31⑤→9/1①は週間グループでもNG');
const exempt=generateRuleBasedSchedule(month,[staff('S008')],[],{...base,weeklyPatternGroupExemptStaffIds:['S008'],staffWorkRules:[fixed('e1','S008',patterns.P01,'2026-09-01'),fixed('e2','S008',patterns.P03,'2026-09-03')]});
assert.equal(assigned(exempt,'S008','2026-09-03').workPatternId,'p03','確定した例外S008は週2回以上PASS');
const fixedExceptions=generateRuleBasedSchedule(month,[staff('S019'),staff('S016')],[],{...base,weeklyPatternGroupExemptStaffIds:['S019','S016'],staffWorkRules:[fixed('m1','S019',patterns.P01,'2026-09-01'),fixed('m2','S019',patterns.P01,'2026-09-02'),fixed('k1','S016',patterns.P02,'2026-09-01'),fixed('k2','S016',patterns.P02,'2026-09-02')]});
assert.equal(assigned(fixedExceptions,'S019','2026-09-02').workPatternId,'p01','S019は出勤日①固定を週内で継続可能');
assert.equal(assigned(fixedExceptions,'S016','2026-09-02').workPatternId,'p02','S016は出勤日②固定を週内で継続可能');
const explicitPreference=generateRuleBasedSchedule(month,[staff('FIXED-PRIORITY')],[],{...base,fixedWorkPatternOverridesWeeklyLimit:true,staffWorkRules:[fixed('p1','FIXED-PRIORITY',patterns.P03,'2026-09-01'),fixed('p2','FIXED-PRIORITY',patterns.P01,'2026-09-03')]});
assert.equal(assigned(explicitPreference,'FIXED-PRIORITY','2026-09-03').workPatternId,'p01','明示固定希望は週間上限より優先');

const attribute = (id) => ({staffId:id,attributeDefinitionId:'eligible',startDate:null,endDate:null});
const requirement = (id,date,count=1) => ({id,code:id,name:id,attributeDefinitionId:'eligible',workPatternId:'p03',workPattern:patterns.P03,classType:null,dayOfWeek:null,startDate:new Date(`${date}T00:00:00Z`),endDate:new Date(`${date}T00:00:00Z`),requiredCount:count,constraintLevel:'HARD'});
const relaxationBase = { ...base, weeklyPatternRelaxation:{enabled:true,maxPerWeek:2,explanationLevel:'INFO'},replaceLegacyShiftTargetsWhenPatternRequirementsActive:true };
const relaxationRows = (result) => result.weeklyPatternRelaxations;
const prior = (staffId,date,patternId='p01') => ({staffId,workDate:new Date(`${date}T00:00:00Z`),shiftType:'OTHER',workPatternId:patternId});

// A: strict weekly limit can satisfy every slot, so relaxation is never used.
const caseA=generateRuleBasedSchedule(month,[staff('A1'),staff('A2')],[],{...relaxationBase,staffingRequirements:[requirement('A-1','2026-09-01'),requirement('A-2','2026-09-03')],staffAttributeAssignments:[attribute('A1'),attribute('A2')]});
assert.equal(relaxationRows(caseA).length,0,'A: 週1回で成立する場合は緩和しない');

// B: one missing slot uses exactly one second weekly assignment.
const caseB=generateRuleBasedSchedule(month,[staff('B1')],[],{...relaxationBase,staffingRequirements:[requirement('B-1','2026-09-01'),requirement('B-2','2026-09-03')],staffAttributeAssignments:[attribute('B1')]});
assert.equal(relaxationRows(caseB).length,1,'B: 1枠不足は1名だけ緩和');

// C: annual repeated-week history is the first fairness discriminator.
const historyA=['2026-04-06','2026-04-07','2026-04-13','2026-04-14','2026-04-20','2026-04-21','2026-04-27','2026-04-28','2026-05-04','2026-05-05'].map(date=>prior('C-A',date));
const caseC=generateRuleBasedSchedule(month,[staff('C-A'),staff('C-B')],[],{...relaxationBase,priorAssignments:[...historyA,prior('C-A','2026-08-31'),prior('C-B','2026-08-31')],staffingRequirements:[requirement('C','2026-09-01')],staffAttributeAssignments:[attribute('C-A'),attribute('C-B')]});
assert.equal(relaxationRows(caseC)[0].staffId,'C-B','C: 年度内の週2回週が少ない候補を優先');

// D: equal relaxation history falls back to existing workload fairness.
const caseD=generateRuleBasedSchedule(month,[{...staff('D-A'),annualFairness:{annualTargetMinutes:10000,confirmedFairnessMinutes:9000}},{...staff('D-B'),annualFairness:{annualTargetMinutes:10000,confirmedFairnessMinutes:1000}}],[],{...relaxationBase,priorAssignments:[prior('D-A','2026-08-31'),prior('D-B','2026-08-31')],staffingRequirements:[requirement('D','2026-09-03')],staffAttributeAssignments:[attribute('D-A'),attribute('D-B')]});
assert.equal(relaxationRows(caseD)[0].staffId,'D-B','D: 同点は既存の勤務負担で安全にtie-break');

// E/F: approved leave states remain unavailable even during relaxation.
for(const [label,requestType] of [['E','DAY_OFF'],['F-PAID','PAID_LEAVE'],['F-AM','HALF_DAY_AM'],['F-PM','HALF_DAY_PM']]){
  const result=generateRuleBasedSchedule(month,[staff(label)],[{staffId:label,requestDate:new Date('2026-09-01T00:00:00Z'),requestType,reason:null}],{...relaxationBase,priorAssignments:[prior(label,'2026-08-31')],staffingRequirements:[requirement(label,'2026-09-01')],staffAttributeAssignments:[attribute(label)]});
  assert.equal(relaxationRows(result).length,0,`${label}: 休暇中は緩和候補にしない`); assert.notEqual(assigned(result,label,'2026-09-01').workPatternId,'p03');
}

// G is covered by FIXED-PRIORITY above and must remain independent of auto-relaxation.
assert.equal(assigned(explicitPreference,'FIXED-PRIORITY','2026-09-03').workPatternId,'p01','G: 固定希望優先を維持');

// H: max two means no implicit third assignment; return administrator decision data.
const caseH=generateRuleBasedSchedule(month,[staff('H')],[],{...relaxationBase,priorAssignments:[prior('H','2026-08-31'),prior('H','2026-09-01')],staffingRequirements:[requirement('H','2026-09-02')],staffAttributeAssignments:[attribute('H')]});
assert.equal(relaxationRows(caseH).length,0,'H: 週3回へ拡張しない');
assert.ok(caseH.warnings.some(row=>row.code==='WEEKLY_PATTERN_RELAXATION_EXHAUSTED'&&row.details?.shortage===1),'H: 管理者判断情報を返す');

// I: the Monday assignment from the previous month participates in both limit and fairness.
const caseI=generateRuleBasedSchedule(month,[staff('I')],[],{...relaxationBase,priorAssignments:[prior('I','2026-08-31')],staffingRequirements:[requirement('I','2026-09-01')],staffAttributeAssignments:[attribute('I')]});
assert.equal(relaxationRows(caseI).length,1,'I: 月跨ぎでも同一週として緩和判定');
assert.equal(relaxationRows(caseI)[0].previousWeeklyCount,1,'I: 前月勤務を公平性集計へ含める');

console.log('Weekly work-pattern group limit and minimal relaxation: PASS (A-I)');
