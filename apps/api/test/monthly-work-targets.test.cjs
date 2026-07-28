const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');

const month = new Date('2034-08-01T00:00:00.000Z');
const member = (id, overrides = {}) => ({ id, employeeNumber: id, displayName: id, assignedClass: 'AGE_0', employmentType: 'FULL_TIME', isDirector: false, canWorkEarly: false, canWorkRegular: true, canWorkLate: false, earlyShiftOnly: false, lateShiftOnly: false, canWorkSaturdays: true, monthlyWorkHourLimit: 300, monthlyTargetWorkDays: null, monthlyTargetWorkHours: null, weeklyAvailableDays: 7, regularWorkStartTime: null, regularWorkEndTime: null, ...overrides });
const options = { weekdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayEarlyRequired: 0, saturdayLateRequired: 0, saturdayMinimumStaff: 0, saturdayOperationEnabled: true, sundayOperationEnabled: false, maxConsecutiveWorkDays: 31, maxConsecutiveEarlyDays: 31, maxConsecutiveLateDays: 31, defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00', defaultStartLate: '11:00', defaultEndLate: '19:30', defaultBreakMinutes: 60, classRequirements: [{ classType: 'AGE_0', weekdayRequired: 1, saturdayRequired: 1, isActive: true }] };
const oneCandidateOptions = { ...options, sundayOperationEnabled: true, saturdayMinimumStaff: 1, classRequirements: [{ classType: 'AGE_0', weekdayRequired: 0, saturdayRequired: 1, isActive: true }] };
const normalOn = (result, day) => result.assignments.find((row) => row.workDate.toISOString().slice(0, 10) === day && row.shiftType === 'NORMAL');

assert.doesNotThrow(() => generateRuleBasedSchedule(month, [member('NO-TARGET')], [], options), '目標未設定でも生成可能');
const dayTargets = generateRuleBasedSchedule(month, [member('A', { monthlyTargetWorkDays: 1 }), member('B', { monthlyTargetWorkDays: 10 })], [], oneCandidateOptions);
assert.equal(normalOn(dayTargets, '2034-08-06').staffId, 'B', '日数目標未達の職員を優先');
const hourTargets = generateRuleBasedSchedule(month, [member('A', { monthlyTargetWorkHours: 7.5 }), member('B', { monthlyTargetWorkHours: 75 })], [], oneCandidateOptions);
assert.equal(normalOn(hourTargets, '2034-08-06').staffId, 'B', '時間目標未達の職員を優先');
const necessary = generateRuleBasedSchedule(month, [member('ONLY', { monthlyTargetWorkDays: 1, monthlyTargetWorkHours: 7.5 })], [], options);
assert.ok(necessary.specialShiftSummary[0].workCount > 1, '目標超過後も配置上必要なら勤務可能');
const hard = generateRuleBasedSchedule(month, [member('UNAVAILABLE', { monthlyTargetWorkDays: 31, canWorkRegular: false }), member('AVAILABLE')], [], options);
assert.equal(hard.assignments.some((row) => row.staffId === 'UNAVAILABLE' && row.shiftType === 'NORMAL'), false, '目標のために勤務不可制約を破らない');
const short = generateRuleBasedSchedule(month, [member('SHORT', { regularWorkStartTime: '09:00', regularWorkEndTime: '15:00', monthlyTargetWorkHours: 10, monthlyWorkHourLimit: 10 })], [], options);
assert.equal(short.specialShiftSummary[0].workCount, 2, '時短5時間×2日を目標・上限計算へ反映');
assert.ok(short.warnings.every((row) => row.code !== 'TARGET_WORK_HOURS_SHORTAGE'), '10時間目標を達成');

const generator = readFileSync(require.resolve('../src/application/shifts/rule-based-shift-generator.ts'), 'utf8');
assert.match(generator, /specialCount[\s\S]*targetDeficit/, '特殊勤務公平性を目標不足度より優先');
const service = readFileSync(require.resolve('../src/presentation/shifts/shifts.service.ts'), 'utf8');
assert.match(service, /Math\.round\(member\.monthlyTargetWorkHours \* 60\)/, '小数目標時間は実績・表示と同じ分単位へ丸める');
assert.match(service, /targetMinutes != null && minutes !== targetMinutes/, '警告も表示集計と同じ丸め済み境界値で判定');
assert.match(service, /!managerUserIds\.has\(item\.userId\)/, '園長・管理者は生成対象外');
assert.match(service, /manager \? this\.activeStaff[\s\S]*Promise\.resolve\(\[\]\)/, '一般職員へ他職員の目標集計を返さない');
for (const code of ['TARGET_WORK_DAYS_SHORTAGE','TARGET_WORK_HOURS_SHORTAGE','TARGET_WORK_DAYS_EXCESS','TARGET_WORK_HOURS_EXCESS']) assert.ok(generator.includes(code), `${code}を生成`);
console.log('Monthly work targets regression tests: PASS');
