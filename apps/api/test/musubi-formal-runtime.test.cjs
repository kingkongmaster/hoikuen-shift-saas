const assert = require('node:assert/strict');
const master = require('../tenant-packages/musubi/permanent-master.cjs');
const { expectedStaff } = require('../scripts/lib/formal-package-adapter.cjs');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');
const { readProvisionalSoftRules } = require('../dist/application/shifts/provisional-soft-rules');
const { hasApprovedFixedTime } = require('../dist/application/shifts/approved-fixed-time');
const { ruleEligibility } = require('../dist/application/shifts/staff-work-rule-evaluator');
const date = value => new Date(`${value}T00:00:00.000Z`);
const patterns = master.patterns.map(([code,,startTime,endTime,isWorking,countsTowardStaffing]) => ({ id: code, code, startTime, endTime, isWorking, countsTowardStaffing, breakMinutes: 60, isActive: true }));
const byCode = new Map(patterns.map(row => [row.code, row]));
const staff = master.staffCodes.map(code => ({ ...expectedStaff(code), id: code, displayName: `Anonymous ${code}` }));
const rules = master.permanentRules.map((rule,index) => ({ ...rule, id: `r${index}`, staffId: rule.staffCode, dayOfWeek: rule.dayOfWeek ?? null, startDate: null, endDate: null, priority: 1, isHardConstraint: true, workPattern: byCode.get(rule.patternCode) ?? null }));
const options = { weekdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayEarlyRequired: 0, saturdayLateRequired: 0, saturdayMinimumStaff: 0,
  saturdayOperationEnabled: true, sundayOperationEnabled: false, maxConsecutiveWorkDays: 31, maxConsecutiveEarlyDays: 31, maxConsecutiveLateDays: 31,
  defaultStartEarly: '07:30', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00', defaultStartLate: '11:00', defaultEndLate: '19:30', defaultBreakMinutes: 60,
  systemWorkPatternIds: { EARLY: 'EARLY', NORMAL: 'NORMAL', LATE: 'LATE' }, classRequirements: [] };
assert.equal(byCode.get('P05').startTime, '10:00');
assert.equal(byCode.get('P02').endTime, '16:30');
assert.equal(staff.find(row => row.id === 'S016').regularWorkEndTime, '16:40');
for (const profile of master.staffProfiles) for (const key of ['assignedClass','employmentType','canWorkEarly','canWorkRegular','canWorkLate','canWorkSaturdays','earlyShiftOnly','lateShiftOnly','departmentCode']) assert.equal(profile[key], expectedStaff(profile.staffCode)[key], `${profile.staffCode}.${key}`);
const fixed = generateRuleBasedSchedule(date('2026-10-01'), staff.filter(row => ['S003','S016','S019','S020'].includes(row.id)), [{staffId:'S019',requestDate:date('2026-10-03'),requestType:'DAY_OFF',reason:null}], { ...options, staffWorkRules: rules });
const at = (result, id, day) => result.assignments.find(row => row.staffId === id && +row.workDate === +date(day));
assert.equal(at(fixed,'S019','2026-10-01').workPatternId,'EARLY');
assert.equal(at(fixed,'S019','2026-10-03').shiftType,'OFF');
assert.equal(at(fixed,'S019','2026-10-10').workPatternId,'P07');
assert.equal(at(fixed,'S020','2026-10-02').workPatternId,'FIXED_S020_1715');
assert.equal(at(fixed,'S020','2026-10-03').workPatternId,'P07');
assert.equal(at(fixed,'S016','2026-10-03').shiftType,'OFF');
assert.equal(at(fixed,'S016','2026-10-01').endTime,'16:40');
assert.equal(byCode.get('P02').endTime,'16:30','shared pattern unchanged');
assert.equal(at(fixed,'S003','2026-10-07').workPatternId,'NO_ROTATION');
assert.equal(at(fixed,'S003','2026-10-07').countsTowardStaffing,false);
assert.notEqual(at(fixed,'S003','2026-10-07').shiftType,'OFF');
assert.equal(ruleEligibility(rules,'S013',date('2026-10-06'),'OTHER',byCode.get('P03'),'P03').eligible,false);
assert.equal(ruleEligibility(rules,'S013',date('2026-10-07'),'OTHER',byCode.get('P03'),'P03').eligible,true);
assert.equal(ruleEligibility(rules,'S013',date('2026-10-08'),'LATE',byCode.get('LATE'),'LATE').eligible,false);

for (const row of require('../tenant-packages/musubi/formal-input-contract.json').globalInputs.workPatterns) { assert.equal(byCode.get(row.code).startTime,row.startTime); assert.equal(byCode.get(row.code).endTime,row.endTime); }
const capped = generateRuleBasedSchedule(date('2026-10-01'),[staff.find(row=>row.id==='S012')],[],{...options,staffWorkRules:rules,weekdayEarlyRequired:1});
assert.equal(capped.assignments.filter(row=>row.shiftType==='EARLY').length,1,'S012 approved monthly HARD cap');

const soft = readProvisionalSoftRules(master.customRules.release1ProvisionalSoftRules,staff,patterns);
const requirement = (code, day='2026-10-01') => ({id:code,code,name:code,attributeDefinitionId:'rotation',workPatternId:code,workPattern:byCode.get(code),classType:null,startDate:date(day),endDate:date(day),dayOfWeek:null,requiredCount:1,constraintLevel:'HARD'});
const pair = staff.filter(row => ['S001','S006','S007'].includes(row.id)).map(row=>({...row, assignedClass:'FREE'}));
const softOptions = { ...options, provisionalSoftRules:soft, staffingRequirements:[requirement('P03')], staffAttributeAssignments:pair.map(row=>({staffId:row.id,attributeDefinitionId:'rotation',startDate:null,endDate:null})), priorAssignments:[{staffId:'S006',workDate:date('2026-09-30'),shiftType:'LATE',workPatternId:'LATE'}] };
assert.equal(at(generateRuleBasedSchedule(date('2026-10-01'),pair,[],softOptions),'S006','2026-10-01').workPatternId,'P03','SOFT must outrank ordinary fairness');
const s007 = generateRuleBasedSchedule(date('2026-10-01'),pair,[],{...softOptions, priorAssignments:[{staffId:'S007',workDate:date('2026-09-30'),shiftType:'LATE',workPatternId:'LATE'}]});
assert.equal(at(s007,'S007','2026-10-01').workPatternId,'P03');
const blockedRule = { id:'deny',staffId:'S006',ruleType:'UNAVAILABLE_WORK_PATTERN',dayOfWeek:null,startDate:null,endDate:null,isHardConstraint:true,priority:1,workPattern:byCode.get('P03') };
const fallback = generateRuleBasedSchedule(date('2026-10-01'),pair,[],{...softOptions,staffWorkRules:[blockedRule]});
assert.notEqual(at(fallback,'S006','2026-10-01').workPatternId,'P03');
assert.equal(at(fallback,'S001','2026-10-01').workPatternId,'P03','legal fallback satisfies staffing');
const scarcePair = pair.filter(row=>row.id!=='S007');
const protectHard = generateRuleBasedSchedule(date('2026-10-01'),scarcePair,[],{...softOptions,priorAssignments:[],staffingRequirements:[requirement('EARLY'),requirement('P03')],staffWorkRules:[{...blockedRule,staffId:'S001'}]});
assert.equal(at(protectHard,'S001','2026-10-01').workPatternId,'EARLY');
assert.equal(at(protectHard,'S006','2026-10-01').workPatternId,'P03','HARD staffing must outrank monthly EARLY preference');
assert.ok(protectHard.warnings.some(row=>row.code==='PROVISIONAL_SOFT_DEFERRED_FOR_HARD'));
const onLeave = generateRuleBasedSchedule(date('2026-10-01'),pair,[{staffId:'S006',requestDate:date('2026-10-01'),requestType:'PAID_LEAVE',reason:null}],softOptions);
assert.equal(at(onLeave,'S006','2026-10-01').shiftType,'PAID_LEAVE');
const monthly = { ...softOptions, priorAssignments:[], staffingRequirements:[requirement('EARLY','2026-10-01'),requirement('EARLY','2026-10-02'),requirement('EARLY','2026-10-07')] };
const preferredMonth = generateRuleBasedSchedule(date('2026-10-01'),pair,[],monthly);
assert.equal(at(preferredMonth,'S006','2026-10-01').workPatternId,'EARLY');
assert.notEqual(at(preferredMonth,'S006','2026-10-02').workPatternId,'EARLY');
assert.notEqual(at(preferredMonth,'S006','2026-10-07').workPatternId,'EARLY');
const onlyCandidate = generateRuleBasedSchedule(date('2026-10-01'),[pair.find(row=>row.id==='S006')],[],monthly);
assert.equal(at(onlyCandidate,'S006','2026-10-02').workPatternId,'EARLY','SOFT is not a maximum');
assert.equal(at(onlyCandidate,'S006','2026-10-07').workPatternId,'EARLY','Wednesday avoidance cannot prevent HARD staffing');
const transition = generateRuleBasedSchedule(date('2026-10-01'),pair,[],{...monthly, priorAssignments:[{staffId:'S006',workDate:date('2026-09-30'),shiftType:'OTHER',workPatternId:'P05'}],patternTransitionBlocks:[{fromWorkPatternIds:['P05'],toWorkPatternIds:['EARLY']}]});
assert.notEqual(at(transition,'S006','2026-10-01').workPatternId,'EARLY','HARD transition overrides SOFT');

const range = { start:date('2026-10-01'),end:date('2026-11-01') };
const timeRule = { id:'time',staffId:'S021',ruleType:'AVAILABLE_TIME_RANGE',dayOfWeek:null,startDate:null,endDate:null,startTime:'07:30',endTime:'16:00',isHardConstraint:true,sourceType:'FORMAL_SOURCE_PACKAGE',sourceReference:JSON.stringify({sourceId:'MUSUBI-2026-039',locator:'S021 approved time',approvalStatus:'APPROVED',decisionActorType:'RECORDED_ADMIN_ANSWER'}) };
assert.equal(hasApprovedFixedTime([timeRule],'S021','07:30','16:00',range),true);
assert.equal(hasApprovedFixedTime([{...timeRule,sourceReference:'{}'}],'S021','07:30','16:00',range),false);
assert.equal(hasApprovedFixedTime([timeRule,timeRule],'S021','07:30','16:00',range),false);
assert.equal(hasApprovedFixedTime([{...timeRule,endDate:date('2026-10-15')}],'S021','07:30','16:00',range),false);
console.log('Musubi formal runtime PASS: fixed weekdays/Saturday/leave, source-backed times, SOFT preference/fallback/HARD precedence');
