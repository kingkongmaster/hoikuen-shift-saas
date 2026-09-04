const assert=require('node:assert/strict');
const {ShiftType}=require('@prisma/client');
const {assignmentTimeBreakdown}=require('../dist/application/attendance/assignment-time-breakdown');
const {paidLeaveMetrics}=require('../dist/application/attendance/paid-leave-metrics');

const work={shiftType:ShiftType.NORMAL,startTime:'08:00',endTime:'16:30',breakMinutes:60};
assert.deepEqual(assignmentTimeBreakdown(work),{scheduledMinutes:450,actualWorkMinutes:450,paidLeaveMinutes:0,paidLeaveEquivalentDays:0,modifierType:null,representation:'WORK'});
for(const modifierType of ['AM_PAID_LEAVE','PM_PAID_LEAVE'])assert.deepEqual(assignmentTimeBreakdown({...work,attendanceModifier:{modifierType}}),{scheduledMinutes:450,actualWorkMinutes:225,paidLeaveMinutes:225,paidLeaveEquivalentDays:.5,modifierType,representation:'WORK_WITH_MODIFIER'});
assert.deepEqual(assignmentTimeBreakdown({shiftType:ShiftType.NORMAL,startTime:'09:30',endTime:'15:30',breakMinutes:60,attendanceModifier:{modifierType:'PM_PAID_LEAVE'}}),{scheduledMinutes:300,actualWorkMinutes:150,paidLeaveMinutes:150,paidLeaveEquivalentDays:.5,modifierType:'PM_PAID_LEAVE',representation:'WORK_WITH_MODIFIER'},'固定時間勤務も本人の実勤務予定時間を半分に分割する');
assert.deepEqual(assignmentTimeBreakdown({shiftType:ShiftType.PAID_LEAVE},450),{scheduledMinutes:450,actualWorkMinutes:0,paidLeaveMinutes:450,paidLeaveEquivalentDays:1,modifierType:null,representation:'FULL_PAID_LEAVE'});
assert.deepEqual(assignmentTimeBreakdown({shiftType:ShiftType.AM_HALF,attendanceModifier:{modifierType:'PM_PAID_LEAVE'}},450),{scheduledMinutes:450,actualWorkMinutes:225,paidLeaveMinutes:225,paidLeaveEquivalentDays:.5,modifierType:'AM_PAID_LEAVE',representation:'LEGACY_HALF_LEAVE'},'旧半休とmodifierが併存しても二重控除しない');
assert.throws(()=>assignmentTimeBreakdown({shiftType:ShiftType.NORMAL,startTime:null,endTime:null}),RangeError);
assert.deepEqual(paidLeaveMetrics([{unit:'DAY',usedHalfDays:2,status:'CONFIRMED'},{unit:'HALF_DAY',usedHalfDays:1,status:'CONFIRMED'},{unit:'HALF_DAY',usedHalfDays:1,status:'CANCELLED'}]),{fullDayPaidLeaveCount:1,halfDayPaidLeaveCount:1,paidLeaveUsageCount:2,paidLeaveEquivalentDays:1.5});
console.log('Assignment time breakdown SSoT tests: PASS');
