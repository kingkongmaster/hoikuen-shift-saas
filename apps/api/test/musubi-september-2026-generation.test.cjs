const assert = require('node:assert/strict');
const { AssignedClass, ShiftRequestType, ShiftType, StaffWorkRuleType } = require('@prisma/client');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');

const month = new Date('2026-09-01T00:00:00.000Z');
const classes = [AssignedClass.AGE_0,AssignedClass.AGE_0,AssignedClass.AGE_1,AssignedClass.AGE_1,AssignedClass.AGE_2,AssignedClass.AGE_2,AssignedClass.AGE_3,AssignedClass.AGE_3,AssignedClass.AGE_4,AssignedClass.AGE_4,AssignedClass.AGE_5,AssignedClass.AGE_5,AssignedClass.FREE,AssignedClass.AGE_1,AssignedClass.AGE_5,AssignedClass.AGE_4,AssignedClass.AGE_1,AssignedClass.AGE_0,AssignedClass.SUPPORT,AssignedClass.SUPPORT];
const staff = classes.map((assignedClass,index) => ({ id:`S${String(index+1).padStart(3,'0')}`,employeeNumber:`S${String(index+1).padStart(3,'0')}`,displayName:`S${String(index+1).padStart(3,'0')}`,assignedClass,employmentType:index>=14&&index<=17?'PART_TIME':'FULL_TIME',canWorkEarly:index<14||index===18,canWorkRegular:index!==18,canWorkLate:index<14,earlyShiftOnly:index===18,lateShiftOnly:false,canWorkSaturdays:true,monthlyWorkHourLimit:null,monthlyTargetWorkDays:null,monthlyTargetWorkHours:null,weeklyAvailableDays:null,regularWorkStartTime:index===19?'08:45':null,regularWorkEndTime:index===19?'17:15':null,isDirector:false }));
const pattern=(code,startTime,endTime,extra={})=>({id:`pattern-${code}`,code,startTime,endTime,breakMinutes:60,isWorking:true,countsTowardStaffing:true,isActive:true,...extra});
const fixed=(staffId,date,p)=>({id:`fixed-${staffId}-${date}`,staffId,ruleType:StaffWorkRuleType.FIXED_WORK_PATTERN,dayOfWeek:null,startDate:new Date(`${date}T00:00:00Z`),endDate:new Date(`${date}T00:00:00Z`),startTime:null,endTime:null,numericValue:null,priority:1,isHardConstraint:true,workPattern:p});
const noRotation=pattern('NO_ROTATION','08:30','17:00',{countsTowardStaffing:false});
const p09=pattern('09','10:30','18:00');
const rules=[];
for(const date of ['2026-09-02','2026-09-09','2026-09-16','2026-09-23','2026-09-30'])rules.push(fixed('S003',date,noRotation));
for(const [staffId,dates] of [['S005',['2026-09-15']],['S007',['2026-09-01']],['S012',['2026-09-08','2026-09-09','2026-09-16','2026-09-30']]])for(const date of dates)rules.push(fixed(staffId,date,noRotation));
for(const [staffId,dates] of [['S008',['2026-09-05','2026-09-19']],['S012',['2026-09-05']]])for(const date of dates)rules.push(fixed(staffId,date,p09));
rules.push(fixed('S012','2026-09-28',pattern('NORMAL','08:30','15:00')));
rules.push({id:'S012-early-monthly-limit',staffId:'S012',ruleType:StaffWorkRuleType.MAX_WORK_PATTERN_PER_MONTH,dayOfWeek:null,startDate:new Date('2026-09-01T00:00:00Z'),endDate:new Date('2026-09-30T00:00:00Z'),startTime:null,endTime:null,numericValue:1,priority:1,isHardConstraint:true,workPattern:pattern('EARLY','07:30','16:00')});
const options={weekdayEarlyRequired:2,weekdayLateRequired:2,saturdayEarlyRequired:2,saturdayLateRequired:2,saturdayMinimumStaff:5,saturdayOperationEnabled:true,sundayOperationEnabled:false,fillOpenUnassignedWithNormal:true,maxConsecutiveWorkDays:6,maxConsecutiveEarlyDays:1,maxConsecutiveLateDays:1,defaultStartEarly:'07:30',defaultEndEarly:'16:00',defaultStartNormal:'08:30',defaultEndNormal:'17:00',defaultStartLate:'11:00',defaultEndLate:'19:30',defaultBreakMinutes:60,classRequirements:[0,1,2,3,4,5].map((age)=>({classType:`AGE_${age}`,weekdayRequired:1,saturdayRequired:0,isActive:true})),staffWorkRules:rules};
const result=generateRuleBasedSchedule(month,staff,[],options);
const on=(id,date)=>result.assignments.find((row)=>row.staffId===id&&row.workDate.toISOString().slice(0,10)===date);
for(const rule of rules.filter((row)=>row.workPattern?.code==='NO_ROTATION')){const row=on(rule.staffId,rule.startDate.toISOString().slice(0,10));assert.equal(row.shiftType,ShiftType.OTHER);assert.equal(row.assignedClass,null);assert.equal(row.countsTowardStaffing,false);}
assert.equal(on('S012','2026-09-28').endTime,'15:00');
assert.ok(result.assignments.filter((row)=>row.staffId==='S012'&&row.shiftType===ShiftType.EARLY).length<=1);
assert.ok(['2026-09-05','2026-09-19'].every((date)=>on('S008',date).workPatternId==='pattern-09'));
assert.equal(on('S012','2026-09-05').workPatternId,'pattern-09');
assert.ok(result.assignments.some((row)=>row.shiftType===ShiftType.NORMAL&&row.note==='平日普通出'&&row.startTime==='08:30'&&row.endTime==='17:00'),'未選択の平日出勤可能職員は正式な普通出へ補完する');
assert.equal(result.assignments.filter((row)=>row.note==='平日普通出'&&row.workDate.getUTCDay()===6).length,0,'平日普通出を土曜へ流用しない');
const halfDayResult=generateRuleBasedSchedule(month,[staff[0]],[{staffId:'S001',requestDate:new Date('2026-09-25T00:00:00Z'),requestType:ShiftRequestType.HALF_DAY_PM,reason:'午後半休'}],{...options,weekdayEarlyRequired:0,weekdayLateRequired:0,classRequirements:[],staffWorkRules:[fixed('S001','2026-09-25',pattern('02','08:00','16:30'))]});
const halfDayAssignment=halfDayResult.assignments.find((row)=>row.staffId==='S001'&&row.workDate.toISOString().slice(0,10)==='2026-09-25');
assert.equal(halfDayAssignment.workPatternId,'pattern-02','半休は勤務予定②を上書きしない');
assert.deepEqual(halfDayAssignment.attendanceModifier,{modifierType:'PM_PAID_LEAVE',effectiveStartTime:'12:15',effectiveEndTime:'16:30',sourceType:'APPROVED_SHIFT_REQUEST'});
for(const [requestType,modifierType] of [[ShiftRequestType.HALF_DAY_AM,'AM_PAID_LEAVE'],[ShiftRequestType.HALF_DAY_PM,'PM_PAID_LEAVE']]){
  const unresolved=generateRuleBasedSchedule(month,[staff[0]],[{staffId:'S001',requestDate:new Date('2026-09-24T00:00:00Z'),requestType,reason:'半休'}],{...options,weekdayEarlyRequired:0,weekdayLateRequired:0,classRequirements:[],staffWorkRules:[],fillOpenUnassignedWithNormal:true});
  const unresolvedAssignment=unresolved.assignments.find((row)=>row.staffId==='S001'&&row.workDate.toISOString().slice(0,10)==='2026-09-24');
  assert.equal(unresolvedAssignment.shiftType,ShiftType.OFF,'基礎勤務未確定時は勤務帯を推測しない');assert.equal(unresolvedAssignment.attendanceModifier,undefined);assert.ok(unresolved.warnings.some((row)=>row.code==='HALF_DAY_BASE_ASSIGNMENT_UNCONFIRMED'&&row.level==='ERROR'));
  const resolved=generateRuleBasedSchedule(month,[staff[0]],[{staffId:'S001',requestDate:new Date('2026-09-24T00:00:00Z'),requestType,reason:'半休'}],{...options,weekdayEarlyRequired:0,weekdayLateRequired:0,classRequirements:[],staffWorkRules:[fixed('S001','2026-09-24',pattern('NORMAL','08:30','17:00'))],fillOpenUnassignedWithNormal:true});
  const resolvedAssignment=resolved.assignments.find((row)=>row.staffId==='S001'&&row.workDate.toISOString().slice(0,10)==='2026-09-24');assert.equal(resolvedAssignment.shiftType,ShiftType.NORMAL);assert.equal(resolvedAssignment.attendanceModifier.modifierType,modifierType);
}
const summary={rotationStaff:staff.length,displayedStaff:23,foodServiceDisplayedButExcluded:3,assignments:result.assignments.length,working:result.assignments.filter((row)=>[ShiftType.EARLY,ShiftType.NORMAL,ShiftType.LATE,ShiftType.OTHER].includes(row.shiftType)).length,nonRotationWorking:result.assignments.filter((row)=>row.countsTowardStaffing===false&&row.shiftType===ShiftType.OTHER).length,error:result.warnings.filter((row)=>row.level==='ERROR').length,warning:result.warnings.filter((row)=>row.level==='WARNING').length,info:result.warnings.filter((row)=>row.level==='INFO').length,warningCodes:[...new Set(result.warnings.map((row)=>row.code))].sort()};
console.log(JSON.stringify(summary,null,2));
