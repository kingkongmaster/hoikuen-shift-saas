const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');

const month = new Date('2034-08-01T00:00:00.000Z');
const member = (id, assignedClass, overrides = {}) => ({
  id, employeeNumber: id, displayName: id, assignedClass, employmentType: 'FULL_TIME', isDirector: false,
  canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: false, lateShiftOnly: false,
  canWorkSaturdays: true, monthlyWorkHourLimit: 300, weeklyAvailableDays: 7,
  regularWorkStartTime: null, regularWorkEndTime: null, ...overrides,
});
const options = {
  weekdayEarlyRequired: 1, weekdayLateRequired: 1, saturdayEarlyRequired: 1, saturdayLateRequired: 1,
  saturdayMinimumStaff: 0, saturdayOperationEnabled: true, sundayOperationEnabled: false,
  maxConsecutiveWorkDays: 31, maxConsecutiveEarlyDays: 31, maxConsecutiveLateDays: 31,
  defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00',
  defaultStartLate: '11:00', defaultEndLate: '19:30', defaultBreakMinutes: 60,
  classRequirements: [{ classType: 'AGE_0', weekdayRequired: 0, saturdayRequired: 0, isActive: true }],
};
const date = (row) => row.workDate.toISOString().slice(0, 10);
const rows = (result, type) => result.assignments.filter((row) => row.shiftType === type);
const summary = (result, id) => result.specialShiftSummary.find((row) => row.staffId === id);

// Verify the two counters are wired independently; monthly behavior is asserted below.
const independent = generateRuleBasedSchedule(month, [member('STAFF-001', 'AGE_0'), member('STAFF-002', 'AGE_1'), member('STAFF-003', 'AGE_2')], [], options);
const generatorSource = readFileSync(require.resolve('../src/application/shifts/rule-based-shift-generator.ts'), 'utf8');
assert.match(generatorSource, /type === ShiftType\.EARLY \? \(earlyCountByStaff\.get\(member\.id\)/, '早出候補はearlyCountを使用');
assert.match(generatorSource, /type === ShiftType\.LATE \? \(lateCountByStaff\.get\(member\.id\)/, '遅出候補はlateCountを使用');
assert.ok(independent.specialShiftSummary.every((row) => Number.isInteger(row.earlyCount) && Number.isInteger(row.lateCount)), '早出・遅出を別フィールドで集計');

const general = ['AGE_0', 'AGE_1', 'AGE_2', 'AGE_3', 'AGE_4', 'AGE_5'].map((assignedClass, index) => member(`GENERAL-${index + 1}`, assignedClass));
const balanced = generateRuleBasedSchedule(month, general, [], options);
const generalEarly = balanced.specialShiftSummary.map((row) => row.earlyCount);
const generalLate = balanced.specialShiftSummary.map((row) => row.lateCount);
assert.ok(Math.max(...generalEarly) - Math.min(...generalEarly) <= 1, '一般職員の早出回数差を縮小');
assert.ok(Math.max(...generalLate) - Math.min(...generalLate) <= 1, '一般職員の遅出回数差を縮小');

const dedicated = generateRuleBasedSchedule(month, [
  member('EARLY-DEDICATED', 'AGE_0', { canWorkRegular: false, canWorkLate: false, earlyShiftOnly: true }),
  member('EARLY-GENERAL', 'AGE_1', { canWorkLate: false }),
  member('LATE-DEDICATED', 'AGE_2', { canWorkEarly: false, canWorkRegular: false, lateShiftOnly: true }),
  member('LATE-GENERAL', 'AGE_3', { canWorkEarly: false }),
], [], options);
assert.equal(rows(dedicated, 'EARLY')[0].staffId, 'EARLY-DEDICATED', '早出専任を一般より優先');
assert.equal(rows(dedicated, 'LATE')[0].staffId, 'LATE-DEDICATED', '遅出専任を一般より優先');
assert.equal(summary(dedicated, 'EARLY-DEDICATED').earlyCategory, 'DEDICATED');
assert.equal(summary(dedicated, 'LATE-DEDICATED').lateCategory, 'DEDICATED');

const constrained = generateRuleBasedSchedule(month, [
  member('DEDICATED-LIMITED', 'AGE_0', { canWorkRegular: false, canWorkLate: false, earlyShiftOnly: true, monthlyWorkHourLimit: 8, canWorkSaturdays: false }),
  member('GENERAL-FALLBACK', 'AGE_1', { canWorkLate: false }),
], [{ staffId: 'DEDICATED-LIMITED', requestDate: new Date('2034-08-01T00:00:00.000Z'), requestType: 'DAY_OFF', reason: null }], { ...options, weekdayLateRequired: 0, saturdayLateRequired: 0 });
assert.equal(rows(constrained, 'EARLY').find((row) => date(row) === '2034-08-01').staffId, 'GENERAL-FALLBACK', '専任職員の希望休を尊重');
assert.equal(rows(constrained, 'EARLY').filter((row) => date(row) === '2034-08-01').length, 1, '希望休を除外しても早出必要人数を代替候補で満たす');
assert.equal(rows(constrained, 'EARLY').find((row) => date(row) === '2034-08-02').staffId, 'DEDICATED-LIMITED', '希望休ではない通常日は専任職員を候補へ戻す');
assert.ok(summary(constrained, 'DEDICATED-LIMITED').earlyCount <= 1, '専任職員の月間上限を尊重');
assert.equal(rows(constrained, 'EARLY').some((row) => row.staffId === 'DEDICATED-LIMITED' && row.workDate.getUTCDay() === 6), false, '専任職員の土曜不可を尊重');

const lateLeave = generateRuleBasedSchedule(month, [
  member('LATE-LEAVE', 'AGE_0', { canWorkEarly: false, canWorkRegular: false, lateShiftOnly: true }),
  member('LATE-BACKUP', 'AGE_1', { canWorkEarly: false }),
], [{ staffId: 'LATE-LEAVE', requestDate: new Date('2034-08-01T00:00:00.000Z'), requestType: 'PAID_LEAVE', reason: null }], { ...options, weekdayEarlyRequired: 0, saturdayEarlyRequired: 0 });
assert.equal(rows(lateLeave, 'LATE').find((row) => date(row) === '2034-08-01').staffId, 'LATE-BACKUP', '承認済み有給の職員を遅出へ再選択しない');
assert.equal(lateLeave.assignments.find((row) => row.staffId === 'LATE-LEAVE' && date(row) === '2034-08-01').shiftType, 'PAID_LEAVE', '有給区分を保持');
assert.equal(rows(lateLeave, 'LATE').find((row) => date(row) === '2034-08-02').staffId, 'LATE-LEAVE', '有給日以外は遅出候補へ戻す');

const normalLeaveOptions = { ...options, weekdayEarlyRequired: 0, saturdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayLateRequired: 0, classRequirements: [{ classType: 'AGE_0', weekdayRequired: 1, saturdayRequired: 1, isActive: true }] };
const normalLeave = generateRuleBasedSchedule(month, [member('NORMAL-LEAVE', 'AGE_0'), member('NORMAL-BACKUP', 'AGE_1')], [{ staffId: 'NORMAL-LEAVE', requestDate: new Date('2034-08-01T00:00:00.000Z'), requestType: 'SUMMER_LEAVE', reason: null }], normalLeaveOptions);
assert.equal(normalLeave.assignments.find((row) => row.staffId === 'NORMAL-LEAVE' && date(row) === '2034-08-01').shiftType, 'SUMMER_LEAVE', '夏季休暇区分を保持して通常勤務へ再選択しない');
assert.equal(normalLeave.assignments.find((row) => row.staffId === 'NORMAL-BACKUP' && date(row) === '2034-08-01').shiftType, 'NORMAL', '希望休を除外しても通常勤務必要人数を代替候補で満たす');
assert.equal(normalLeave.assignments.find((row) => row.staffId === 'NORMAL-LEAVE' && date(row) === '2034-08-02').shiftType, 'NORMAL', '休暇日以外は通常勤務候補へ戻す');

const unavailable = generateRuleBasedSchedule(month, [
  member('EARLY-NO', 'AGE_0', { canWorkEarly: false }), member('EARLY-YES', 'AGE_1', { canWorkLate: false }),
  member('LATE-NO', 'AGE_2', { canWorkLate: false }), member('LATE-YES', 'AGE_3', { canWorkEarly: false }),
], [], options);
assert.equal(summary(unavailable, 'EARLY-NO').earlyCategory, 'NOT_ELIGIBLE', '早出不可は公平性グループ外');
assert.equal(summary(unavailable, 'EARLY-NO').earlyCount, 0);
assert.equal(summary(unavailable, 'LATE-NO').lateCategory, 'NOT_ELIGIBLE', '遅出不可は公平性グループ外');
assert.equal(summary(unavailable, 'LATE-NO').lateCount, 0);

const sameClass = generateRuleBasedSchedule(month, [member('CLASS-A', 'AGE_0', { canWorkLate: false }), member('CLASS-B', 'AGE_0', { canWorkLate: false })], [], { ...options, weekdayEarlyRequired: 2, saturdayEarlyRequired: 2, weekdayLateRequired: 0, saturdayLateRequired: 0 });
const sameClassPerDay = new Map();
for (const row of rows(sameClass, 'EARLY')) sameClassPerDay.set(date(row), (sameClassPerDay.get(date(row)) || 0) + 1);
assert.ok([...sameClassPerDay.values()].every((count) => count === 1), '固定クラス同種特殊勤務の重複なし');

const shortHours = generateRuleBasedSchedule(month, [member('SHORT', 'AGE_0', { canWorkEarly: false, canWorkLate: false, regularWorkStartTime: '09:00', regularWorkEndTime: '15:00', monthlyWorkHourLimit: 10 })], [], { ...options, weekdayEarlyRequired: 0, saturdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayLateRequired: 0, classRequirements: [{ classType: 'AGE_0', weekdayRequired: 1, saturdayRequired: 1, isActive: true }] });
assert.equal(summary(shortHours, 'SHORT').workCount, 2, '個別勤務時間を月間上限へ反映');
assert.ok(rows(shortHours, 'EARLY').length === 0 && rows(shortHours, 'LATE').length === 0, '時短職員の早出遅出不可を維持');

const streak = generateRuleBasedSchedule(month, general, [], { ...options, maxConsecutiveEarlyDays: 1, maxConsecutiveLateDays: 1 });
for (const type of ['EARLY', 'LATE']) {
  const byStaff = new Map();
  for (const row of rows(streak, type)) { const list = byStaff.get(row.staffId) || []; list.push(row.workDate.getTime()); byStaff.set(row.staffId, list); }
  assert.ok([...byStaff.values()].every((list) => list.every((value, index) => index === 0 || value - list[index - 1] > 86400000)), `${type}最大連続日数を維持`);
}
assert.ok(balanced.specialShiftSummary.every((item) => item.workCount <= 31), '月間勤務時間上限を超過しない');

const shiftsService = readFileSync(require.resolve('../src/presentation/shifts/shifts.service.ts'), 'utf8');
assert.match(shiftsService, /!managerUserIds\.has\(item\.userId\)/, '園長・管理者は生成対象外のまま');

console.table(balanced.specialShiftSummary.map(({ employeeNumber, earlyCount, lateCount, totalSpecialShiftCount, saturdayCount, workCount, earlyCategory, lateCategory }) => ({ employeeNumber, earlyCount, lateCount, totalSpecialShiftCount, saturdayCount, workCount, earlyCategory, lateCategory })));
console.log('Fair special-shift allocation and approved-leave regression: PASS (fixed-class 8-scenario suite is separate)');
