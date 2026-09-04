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
  systemWorkPatternIds: { EARLY: 'pattern-early', NORMAL: 'pattern-normal', LATE: 'pattern-late' },
  patternTransitionBlocks: [{ fromWorkPatternIds: ['pattern-05'], toWorkPatternIds: ['pattern-early'] }],
  classRequirements: [{ classType: 'AGE_0', weekdayRequired: 0, saturdayRequired: 0, isActive: true }],
};
const patterns = {
  EARLY: { id: 'pattern-early', code: 'EARLY', startTime: '07:00', endTime: '16:00', breakMinutes: 60, isWorking: true, isActive: true },
  NORMAL: { id: 'pattern-normal', code: 'NORMAL', startTime: '08:30', endTime: '17:00', breakMinutes: 60, isWorking: true, isActive: true },
  LATE: { id: 'pattern-late', code: 'LATE', startTime: '11:00', endTime: '19:30', breakMinutes: 60, isWorking: true, isActive: true },
  P05: { id: 'pattern-05', code: '05', startTime: '10:00', endTime: '18:30', breakMinutes: 60, isWorking: true, isActive: true },
};
const rule = (id, staffId, ruleType, type, date, priority = 100) => ({
  id, staffId, ruleType, dayOfWeek: null, startDate: new Date(`${date}T00:00:00.000Z`), endDate: new Date(`${date}T00:00:00.000Z`),
  startTime: null, endTime: null, numericValue: null, priority, isHardConstraint: ruleType === 'FIXED_WORK_PATTERN', workPattern: patterns[type],
});
const shiftOn = (result, date, type) => result.assignments.find((item) => item.workDate.toISOString().slice(0, 10) === date && item.shiftType === type)?.staffId;

const lateToEarly = generateRuleBasedSchedule(month, [member('LATE-YESTERDAY'), member('NORMAL-YESTERDAY')], [], {
  ...options,
  staffWorkRules: [
    rule('fixed-late', 'LATE-YESTERDAY', 'FIXED_WORK_PATTERN', 'P05', '2034-08-01'),
    rule('fixed-normal', 'NORMAL-YESTERDAY', 'FIXED_WORK_PATTERN', 'NORMAL', '2034-08-01'),
  ],
});
assert.equal(shiftOn(lateToEarly, '2034-08-02', 'EARLY'), 'NORMAL-YESTERDAY', 'A: 遅出翌日の職員より通常勤務だった職員を早出へ優先');

const necessary = generateRuleBasedSchedule(month, [member('ONLY-EARLY')], [], {
  ...options,
  staffWorkRules: [rule('fixed-only-late', 'ONLY-EARLY', 'FIXED_WORK_PATTERN', 'P05', '2034-08-01')],
});
assert.equal(shiftOn(necessary, '2034-08-02', 'EARLY'), undefined, 'B: 唯一の候補でも⑤の翌日に①を割り当てない');
assert.ok(necessary.warnings.some((row) => row.code === 'EARLY_SHORTAGE'), 'B: ⑤→①を破る代わりに不足を報告');

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

const september = new Date('2034-09-01T00:00:00.000Z');
const crossMonth = generateRuleBasedSchedule(september, [member('A-LATE-AUG31'), member('B-NORMAL-AUG31')], [], {
  ...options,
  priorAssignments: [
    { staffId: 'A-LATE-AUG31', workDate: new Date('2034-08-31T00:00:00.000Z'), shiftType: 'OTHER', workPatternId: 'pattern-05' },
    { staffId: 'B-NORMAL-AUG31', workDate: new Date('2034-08-31T00:00:00.000Z'), shiftType: 'NORMAL', workPatternId: 'pattern-normal' },
  ],
});
assert.equal(shiftOn(crossMonth, '2034-09-01', 'EARLY'), 'B-NORMAL-AUG31', 'E: 8/31確定⑤を9/1生成時に参照し、月境界を越えて①を回避');

const withoutPrior = generateRuleBasedSchedule(september, [member('A-LATE-AUG31'), member('B-NORMAL-AUG31')], [], options);
assert.equal(shiftOn(withoutPrior, '2034-09-01', 'EARLY'), 'A-LATE-AUG31', 'F: 比較用・前月確定勤務なしでは職員番号順');

const october = new Date('2035-10-01T00:00:00.000Z');
const crossMonthOctober = generateRuleBasedSchedule(october, [member('A-P05-SEP30'), member('B-P04-SEP30')], [], {
  ...options,
  priorAssignments: [
    { staffId: 'A-P05-SEP30', workDate: new Date('2035-09-30T00:00:00.000Z'), shiftType: 'OTHER', workPatternId: 'pattern-05' },
    { staffId: 'B-P04-SEP30', workDate: new Date('2035-09-30T00:00:00.000Z'), shiftType: 'OTHER', workPatternId: 'pattern-04' },
  ],
});
assert.equal(shiftOn(crossMonthOctober, '2035-10-01', 'EARLY'), 'B-P04-SEP30', 'G: 9/30確定⑤から10/1①を禁止し、④から①は許可');

const sixToEarly = generateRuleBasedSchedule(month, [member('SIX-THEN-EARLY')], [], { ...options, weekdayEarlyRequired: 0, staffWorkRules: [rule('six', 'SIX-THEN-EARLY', 'FIXED_WORK_PATTERN', 'LATE', '2034-08-01'), rule('early', 'SIX-THEN-EARLY', 'FIXED_WORK_PATTERN', 'EARLY', '2034-08-02')] });
assert.equal(shiftOn(sixToEarly, '2034-08-02', 'EARLY'), 'SIX-THEN-EARLY', 'H: ⑥→①は⑤→①ルールだけを理由に遮断しない');

console.log('Shift transition burden tests: PASS (A-H; both month boundaries; ⑤ only, ④/⑥ excluded)');
