const assert = require('node:assert/strict');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');

const member = (id, assignedClass, overrides = {}) => ({
  id, employeeNumber: id, displayName: id, assignedClass, employmentType: 'FULL_TIME', isDirector: false,
  canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: false, lateShiftOnly: false,
  canWorkSaturdays: true, monthlyWorkHourLimit: 240, weeklyAvailableDays: 6, ...overrides,
});
const base = {
  weekdayEarlyRequired: 2, weekdayLateRequired: 2, saturdayEarlyRequired: 1, saturdayLateRequired: 1,
  saturdayMinimumStaff: 3, saturdayOperationEnabled: true, sundayOperationEnabled: false,
  maxConsecutiveWorkDays: 6, maxConsecutiveEarlyDays: 1, maxConsecutiveLateDays: 1,
  defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00',
  defaultStartLate: '11:00', defaultEndLate: '19:30', defaultBreakMinutes: 60, classRequirements: [],
};
const month = new Date('2034-08-01T00:00:00Z');
const day = '2034-08-01';
const onDay = (result, type) => result.assignments.filter((row) => row.workDate.toISOString().startsWith(day) && row.shiftType === type);

const sameEarly = generateRuleBasedSchedule(month, [member('a', 'AGE_0', { canWorkLate: false }), member('b', 'AGE_0', { canWorkLate: false })], [], { ...base, weekdayLateRequired: 0 });
assert.equal(onDay(sameEarly, 'EARLY').length, 1, '同じ固定クラスのEARLYは最大1名');
assert.ok(sameEarly.warnings.some((row) => row.code === 'EARLY_CLASS_DUPLICATE_SHORTAGE'));

const sameLate = generateRuleBasedSchedule(month, [member('a', 'AGE_0', { canWorkEarly: false }), member('b', 'AGE_0', { canWorkEarly: false })], [], { ...base, weekdayEarlyRequired: 0 });
assert.equal(onDay(sameLate, 'LATE').length, 1, '同じ固定クラスのLATEは最大1名');
assert.ok(sameLate.warnings.some((row) => row.code === 'LATE_CLASS_DUPLICATE_SHORTAGE'));

const earlyLate = generateRuleBasedSchedule(month, [member('a', 'AGE_0', { canWorkLate: false }), member('b', 'AGE_0', { canWorkEarly: false })], [], { ...base, weekdayEarlyRequired: 1, weekdayLateRequired: 1 });
assert.equal(onDay(earlyLate, 'EARLY').length, 1, '同じクラスのEARLY 1名を許可');
assert.equal(onDay(earlyLate, 'LATE').length, 1, '同じクラスのLATE 1名を同日に許可');

for (const type of ['EARLY', 'LATE']) {
  const result = generateRuleBasedSchedule(month, [member('a', 'AGE_0'), member('b', 'AGE_1')], [], { ...base, weekdayEarlyRequired: type === 'EARLY' ? 2 : 0, weekdayLateRequired: type === 'LATE' ? 2 : 0 });
  assert.equal(onDay(result, type).length, 2, `異なるクラスの${type} 2名を許可`);
}

const classes = ['AGE_0','AGE_0','AGE_1','AGE_1','AGE_2','AGE_2','AGE_3','AGE_3','AGE_4','AGE_4','AGE_5','AGE_5','FREE','SUPPORT'];
const demo = classes.map((assignedClass, index) => member(`STAFF-${String(index + 1).padStart(3, '0')}`, assignedClass));
demo[13].displayName = '子育て支援担当';
const generated = generateRuleBasedSchedule(month, demo, [], base);
for (const type of ['EARLY', 'LATE']) {
  const groups = new Map();
  for (const row of generated.assignments.filter((item) => item.shiftType === type)) {
    const fixedClass = demo.find((staff) => staff.id === row.staffId).assignedClass;
    if (!fixedClass.startsWith('AGE_')) continue;
    const key = `${row.workDate.toISOString().slice(0,10)}:${fixedClass}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  assert.ok([...groups.values()].every((count) => count <= 1), `1か月の${type}固定クラス重複なし`);
}
assert.ok(generated.assignments.some((row) => row.staffId === demo[13].id && ['EARLY','NORMAL','LATE'].includes(row.shiftType)), '子育て支援担当は勤務条件どおり生成対象');
assert.equal(generated.assignments.some((row) => row.staffId === 'ADMIN-001'), false, '園長は14名に含まれない');
console.log('Fixed-class special-shift constraints: PASS (8 scenarios)');
