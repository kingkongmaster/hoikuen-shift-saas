const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');
const { individualRegularWorkHoursError } = require('../dist/domain/staff/staff-master');

const month = new Date('2034-08-01T00:00:00.000Z');
const member = (overrides = {}) => ({
  id: 'staff-1', employeeNumber: 'STAFF-001', displayName: 'テスト職員', assignedClass: 'AGE_0',
  employmentType: 'FULL_TIME', isDirector: false, canWorkEarly: true, canWorkRegular: true,
  canWorkLate: true, earlyShiftOnly: false, lateShiftOnly: false, canWorkSaturdays: true,
  monthlyWorkHourLimit: 300, weeklyAvailableDays: 7, regularWorkStartTime: null,
  regularWorkEndTime: null, ...overrides,
});
const options = {
  weekdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayEarlyRequired: 0, saturdayLateRequired: 0,
  saturdayMinimumStaff: 0, saturdayOperationEnabled: true, sundayOperationEnabled: true,
  maxConsecutiveWorkDays: 31, maxConsecutiveEarlyDays: 31, maxConsecutiveLateDays: 31,
  defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00',
  defaultStartLate: '11:00', defaultEndLate: '19:30', defaultBreakMinutes: 60,
  classRequirements: [{ classType: 'AGE_0', weekdayRequired: 1, saturdayRequired: 1, isActive: true }],
};
const working = (result, id = 'staff-1') => result.assignments.filter((row) => row.staffId === id && ['EARLY', 'NORMAL', 'LATE'].includes(row.shiftType));
const minutes = (row) => {
  const [sh, sm] = row.startTime.split(':').map(Number); const [eh, em] = row.endTime.split(':').map(Number);
  return eh * 60 + em - sh * 60 - sm - (row.breakMinutes ?? 0);
};

const common = generateRuleBasedSchedule(month, [member()], [], options);
assert.equal(common.assignments.find((row) => row.shiftType === 'NORMAL').startTime, '08:30', '未設定時は園共通開始時刻');
assert.equal(common.assignments.find((row) => row.shiftType === 'NORMAL').endTime, '17:00', '未設定時は園共通終了時刻');

for (const [endTime, expectedMinutes] of [['16:00', 360], ['15:00', 300]]) {
  const result = generateRuleBasedSchedule(month, [member({ regularWorkStartTime: '09:00', regularWorkEndTime: endTime })], [], options);
  const normal = result.assignments.find((row) => row.shiftType === 'NORMAL');
  assert.equal(normal.startTime, '09:00'); assert.equal(normal.endTime, endTime);
  assert.equal(minutes(normal), expectedMinutes, `9:00〜${endTime}は既存の60分休憩を控除`);
}

const earlyOptions = { ...options, weekdayEarlyRequired: 1, saturdayEarlyRequired: 1, classRequirements: [] };
assert.equal(working(generateRuleBasedSchedule(month, [member({ canWorkEarly: false, regularWorkStartTime: '09:00', regularWorkEndTime: '16:00' })], [], earlyOptions)).some((row) => row.shiftType === 'EARLY'), false, '早出不可を尊重');
const lateOptions = { ...options, weekdayLateRequired: 1, saturdayLateRequired: 1, classRequirements: [] };
assert.equal(working(generateRuleBasedSchedule(month, [member({ canWorkLate: false, regularWorkStartTime: '09:00', regularWorkEndTime: '16:00' })], [], lateOptions)).some((row) => row.shiftType === 'LATE'), false, '遅出不可を尊重');
assert.equal(working(generateRuleBasedSchedule(month, [member({ employmentType: 'PART_TIME', canWorkEarly: true, regularWorkStartTime: '09:00', regularWorkEndTime: '15:00' })], [], earlyOptions)).some((row) => row.shiftType === 'EARLY'), true, 'PART_TIMEや個別時間だけでは早出から除外しない');

assert.match(individualRegularWorkHoursError('09:00', null), /両方/);
assert.match(individualRegularWorkHoursError(null, '16:00'), /両方/);
assert.match(individualRegularWorkHoursError('9:00', '16:00'), /HH:mm/);
assert.match(individualRegularWorkHoursError('16:00', '16:00'), /後/);
assert.match(individualRegularWorkHoursError('17:00', '16:00'), /後/);
assert.equal(individualRegularWorkHoursError('09:00', '16:00'), null);

const capped = generateRuleBasedSchedule(month, [member({ monthlyWorkHourLimit: 10, regularWorkStartTime: '09:00', regularWorkEndTime: '15:00' })], [], options);
assert.equal(working(capped).length, 2, '5時間×2日で月間10時間上限に到達する');
assert.equal(working(capped).reduce((sum, row) => sum + minutes(row), 0), 600, '個別勤務時間で月間上限を計算する');

const shiftsService = readFileSync(require.resolve('../src/presentation/shifts/shifts.service.ts'), 'utf8');
assert.match(shiftsService, /!managerUserIds\.has\(item\.userId\)/, '園長・管理者は生成対象外のまま');

console.log('Individual working hours regression tests: PASS (11 requirements; fixed-class suite is separate)');
