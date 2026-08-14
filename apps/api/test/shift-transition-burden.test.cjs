const assert = require('node:assert/strict');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');

const month = new Date('2034-08-01T00:00:00.000Z');
const member = (id, overrides = {}) => ({
  id, employeeNumber: id, displayName: id, assignedClass: 'FREE', employmentType: 'FULL_TIME', isDirector: false,
  canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: false, lateShiftOnly: false,
  canWorkSaturdays: true, monthlyWorkHourLimit: 300, monthlyTargetWorkDays: null, monthlyTargetWorkHours: null,
  weeklyAvailableDays: 7, regularWorkStartTime: null, regularWorkEndTime: null, ...overrides,
});
const options = {
  weekdayEarlyRequired: 1, weekdayLateRequired: 0, saturdayEarlyRequired: 0, saturdayLateRequired: 0,
  saturdayMinimumStaff: 0, saturdayOperationEnabled: true, sundayOperationEnabled: false,
  maxConsecutiveWorkDays: 31, maxConsecutiveEarlyDays: 31, maxConsecutiveLateDays: 31,
  defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00',
  defaultStartLate: '11:00', defaultEndLate: '19:30', defaultBreakMinutes: 60,
  classRequirements: [{ classType: 'AGE_0', weekdayRequired: 0, saturdayRequired: 0, isActive: true }],
};
const patterns = {
  EARLY: { id: 'pattern-early', code: 'EARLY', startTime: '07:00', endTime: '16:00', breakMinutes: 60, isWorking: true, isActive: true },
  NORMAL: { id: 'pattern-normal', code: 'NORMAL', startTime: '08:30', endTime: '17:00', breakMinutes: 60, isWorking: true, isActive: true },
  LATE: { id: 'pattern-late', code: 'LATE', startTime: '11:00', endTime: '19:30', breakMinutes: 60, isWorking: true, isActive: true },
};
const rule = (id, staffId, ruleType, type, date, priority = 100) => ({
  id, staffId, ruleType, dayOfWeek: null, startDate: new Date(`${date}T00:00:00.000Z`), endDate: new Date(`${date}T00:00:00.000Z`),
  startTime: null, endTime: null, numericValue: null, priority, isHardConstraint: ruleType === 'FIXED_WORK_PATTERN', workPattern: patterns[type],
});
const shiftOn = (result, date, type) => result.assignments.find((item) => item.workDate.toISOString().slice(0, 10) === date && item.shiftType === type)?.staffId;

const lateToEarly = generateRuleBasedSchedule(month, [member('LATE-YESTERDAY'), member('NORMAL-YESTERDAY')], [], {
  ...options,
  staffWorkRules: [
    rule('fixed-late', 'LATE-YESTERDAY', 'FIXED_WORK_PATTERN', 'LATE', '2034-08-01'),
    rule('fixed-normal', 'NORMAL-YESTERDAY', 'FIXED_WORK_PATTERN', 'NORMAL', '2034-08-01'),
  ],
});
assert.equal(shiftOn(lateToEarly, '2034-08-02', 'EARLY'), 'NORMAL-YESTERDAY', 'A: 遅出翌日の職員より通常勤務だった職員を早出へ優先');

const necessary = generateRuleBasedSchedule(month, [member('ONLY-EARLY')], [], {
  ...options,
  staffWorkRules: [rule('fixed-only-late', 'ONLY-EARLY', 'FIXED_WORK_PATTERN', 'LATE', '2034-08-01')],
});
assert.equal(shiftOn(necessary, '2034-08-02', 'EARLY'), 'ONLY-EARLY', 'B: 唯一の候補なら遅出翌日でも早出へ配置可能');

const earlyToLate = generateRuleBasedSchedule(month, [member('EARLY-YESTERDAY'), member('NORMAL-BEFORE-LATE')], [], {
  ...options, weekdayEarlyRequired: 0, weekdayLateRequired: 1,
  staffWorkRules: [
    rule('fixed-early', 'EARLY-YESTERDAY', 'FIXED_WORK_PATTERN', 'EARLY', '2034-08-01'),
    rule('fixed-normal-late-case', 'NORMAL-BEFORE-LATE', 'FIXED_WORK_PATTERN', 'NORMAL', '2034-08-01'),
  ],
});
assert.equal(shiftOn(earlyToLate, '2034-08-02', 'LATE'), 'NORMAL-BEFORE-LATE', 'C: 早出翌日の職員より通常勤務だった職員を遅出へ優先');

const preferred = generateRuleBasedSchedule(month, [member('PREFERS-EARLY'), member('NO-PREFERENCE')], [], {
  ...options,
  staffWorkRules: [
    rule('fixed-preferred-early', 'PREFERS-EARLY', 'FIXED_WORK_PATTERN', 'EARLY', '2034-08-01'),
    rule('fixed-no-preference-normal', 'NO-PREFERENCE', 'FIXED_WORK_PATTERN', 'NORMAL', '2034-08-01'),
    rule('preferred-early', 'PREFERS-EARLY', 'PREFERRED_WORK_PATTERN', 'EARLY', '2034-08-02', 10),
  ],
});
assert.equal(shiftOn(preferred, '2034-08-02', 'EARLY'), 'PREFERS-EARLY', 'D: PREFERREDの早出希望は同種連続SOFT減点より優先');

console.log('Shift transition burden tests: PASS (A-D)');
