const assert = require('node:assert/strict');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');

const member = (id, isDirector, assignedClass = 'AGE_0') => ({
  id, employeeNumber: id, displayName: id, assignedClass, employmentType: 'FULL_TIME', isDirector,
  canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: false, lateShiftOnly: false,
  canWorkSaturdays: true, monthlyWorkHourLimit: 200, weeklyAvailableDays: 6,
});
const options = {
  weekdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayEarlyRequired: 0, saturdayLateRequired: 0,
  saturdayMinimumStaff: 0, saturdayOperationEnabled: false, sundayOperationEnabled: false,
  maxConsecutiveWorkDays: 6, maxConsecutiveEarlyDays: 1, maxConsecutiveLateDays: 1,
  defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30',
  defaultEndNormal: '17:00', defaultStartLate: '11:00', defaultEndLate: '19:30', defaultBreakMinutes: 60,
  classRequirements: [{ classType: 'AGE_0', weekdayRequired: 2, saturdayRequired: 0, isActive: true }],
};
const staff = [member('director', true, 'FREE'), member('teacher', false)];
const day = '2026-07-01';

const none = generateRuleBasedSchedule(new Date(`${day}T00:00:00Z`), staff, [], { ...options, directorCountsTowardStaffing: false, directorClassPlacementMode: 'NONE' });
const noneDirector = none.assignments.find((row) => row.staffId === 'director' && row.workDate.toISOString().startsWith(day));
assert.ok(['EARLY', 'NORMAL', 'LATE'].includes(noneDirector.shiftType), '園長は勤務候補');
assert.equal(noneDirector.assignedClass, null, '原則なしは運営');
assert.ok(none.warnings.some((row) => row.code === 'CLASS_SHORTAGE' && row.workDate === day), '初期値では園長を充足人数に含めない');

const help = generateRuleBasedSchedule(new Date(`${day}T00:00:00Z`), staff, [], { ...options, directorCountsTowardStaffing: true, directorClassPlacementMode: 'SHORTAGE_ONLY' });
const helpDirector = help.assignments.find((row) => row.staffId === 'director' && row.workDate.toISOString().startsWith(day));
assert.equal(helpDirector.assignedClass, 'AGE_0', '不足時のみ応援配置');
assert.ok(!help.warnings.some((row) => row.code === 'CLASS_SHORTAGE' && row.workDate === day), '算入設定では不足を解消');

for (const [field, shiftType] of [['weekdayEarlyRequired', 'EARLY'], ['weekdayLateRequired', 'LATE']]) {
  const result = generateRuleBasedSchedule(new Date(`${day}T00:00:00Z`), [member('director', true, 'FREE')], [], { ...options, classRequirements: [], weekdayEarlyRequired: 0, weekdayLateRequired: 0, [field]: 1 });
  assert.equal(result.assignments.find((row) => row.staffId === 'director' && row.workDate.toISOString().startsWith(day)).shiftType, shiftType);
}
console.log('RC1 director staffing rules: PASS');
