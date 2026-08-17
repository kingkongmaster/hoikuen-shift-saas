const assert = require('node:assert/strict');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');

const classes = ['AGE_0','AGE_0','AGE_0','SUPPORT','AGE_1','AGE_1','AGE_2','AGE_2','AGE_3','AGE_3','AGE_4','AGE_4','AGE_5','AGE_5'];
const targets = [[14,112],[17,85],[14,105],[20,150],[20,120],[15,110],[20,150],[19,145],[19,145],[15,110],[20,150],[19,145],[19,145],[19,145]];
const staff = Array.from({ length: 14 }, (_, index) => ({
  id: `R${String(index + 1).padStart(2, '0')}`, employeeNumber: `R${String(index + 1).padStart(2, '0')}`, displayName: `Anonymous ${index + 1}`,
  assignedClass: classes[index], employmentType: 'FULL_TIME', isDirector: false,
  canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: false, lateShiftOnly: false,
  canWorkSaturdays: true, monthlyWorkHourLimit: 192, monthlyTargetWorkDays: targets[index][0], monthlyTargetWorkHours: targets[index][1],
  weeklyAvailableDays: 5, regularWorkStartTime: null, regularWorkEndTime: null,
}));
Object.assign(staff[0], { canWorkLate: false, earlyShiftOnly: true });
Object.assign(staff[1], { employmentType: 'PART_TIME', canWorkEarly: false, canWorkLate: false, canWorkSaturdays: false, monthlyWorkHourLimit: 96, weeklyAvailableDays: 4, regularWorkStartTime: '09:00', regularWorkEndTime: '15:00' });
Object.assign(staff[2], { employmentType: 'REEMPLOYED', canWorkEarly: false, canWorkRegular: false, lateShiftOnly: true, monthlyWorkHourLimit: 120, weeklyAvailableDays: 4 });
Object.assign(staff[3], { monthlyWorkHourLimit: null, weeklyAvailableDays: null });
Object.assign(staff[4], { canWorkEarly: false, canWorkLate: false, regularWorkStartTime: '09:00', regularWorkEndTime: '16:00' });
Object.assign(staff[5], { employmentType: 'PART_TIME', canWorkSaturdays: false, monthlyWorkHourLimit: 120, weeklyAvailableDays: 4 });
Object.assign(staff[9], { employmentType: 'PART_TIME', canWorkSaturdays: false, monthlyWorkHourLimit: 120, weeklyAvailableDays: 4 });

const options = {
  weekdayEarlyRequired: 2, weekdayLateRequired: 2, saturdayEarlyRequired: 1, saturdayLateRequired: 1,
  saturdayMinimumStaff: 3, saturdayOperationEnabled: true, sundayOperationEnabled: false,
  maxConsecutiveWorkDays: 6, maxConsecutiveEarlyDays: 1, maxConsecutiveLateDays: 1,
  defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00',
  defaultStartLate: '11:00', defaultEndLate: '19:30', defaultBreakMinutes: 60,
  classRequirements: [['AGE_0',2],['AGE_1',2],['AGE_2',2],['AGE_3',2],['AGE_4',1],['AGE_5',1]].map(([classType, weekdayRequired]) => ({ classType, weekdayRequired, saturdayRequired: 0, isActive: true })),
};
const before = generateRuleBasedSchedule(new Date('2030-01-01T00:00:00Z'), staff, [], { ...options, futureHardCapacityReservation: false });
const after = generateRuleBasedSchedule(new Date('2030-01-01T00:00:00Z'), staff, [], { ...options, futureHardCapacityReservation: true });
const working = new Set(['EARLY', 'LATE', 'NORMAL']);
const weekdayErrors = (result) => result.warnings.filter((warning) => warning.level === 'ERROR' && ![0, 6].includes(new Date(`${warning.workDate}T00:00:00Z`).getUTCDay())).length;
assert.ok(weekdayErrors(after) <= weekdayErrors(before), 'future reservation must not increase weekday HARD errors');
for (const date of ['2030-01-05', '2030-01-12', '2030-01-19', '2030-01-26']) {
  const rows = after.assignments.filter((item) => item.workDate.toISOString().slice(0, 10) === date);
  assert.ok(rows.filter((item) => item.shiftType === 'EARLY').length >= 1, `${date} EARLY`);
  assert.ok(rows.filter((item) => item.shiftType === 'LATE').length >= 1, `${date} LATE`);
  assert.ok(rows.filter((item) => item.shiftType === 'NORMAL').length >= 1, `${date} NORMAL`);
  assert.ok(rows.filter((item) => working.has(item.shiftType)).length >= 3, `${date} total`);
}
const impossible = generateRuleBasedSchedule(new Date('2030-01-01T00:00:00Z'), [staff[0]], [], { ...options, weekdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayEarlyRequired: 1, saturdayLateRequired: 1, saturdayMinimumStaff: 3, classRequirements: [] });
assert.ok(impossible.warnings.some((warning) => warning.code === 'SATURDAY_MINIMUM_SHORTAGE' && warning.level === 'ERROR'), 'physical shortage warning remains visible');
console.log(JSON.stringify({ beforeWeekdayErrors: weekdayErrors(before), afterWeekdayErrors: weekdayErrors(after), saturdayHardCoverage: 'PASS', impossibleWarning: 'PASS' }));
