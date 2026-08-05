const assert = require('node:assert/strict');
const { AssignedClass, ShiftRequestType, ShiftType, StaffWorkRuleType } = require('@prisma/client');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');
const { prohibitionConflict, ruleEligibility, ruleLabel } = require('../dist/application/shifts/staff-work-rule-evaluator');

const month = new Date('2035-01-01T00:00:00.000Z'); // Monday
const staff = (id, employeeNumber) => ({ id, employeeNumber, displayName: id, assignedClass: AssignedClass.AGE_0, employmentType: 'FULL_TIME', canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: false, lateShiftOnly: false, canWorkSaturdays: true, monthlyWorkHourLimit: null, weeklyAvailableDays: null });
const pattern = (code, overrides = {}) => ({ id: `pattern-${code}`, code, startTime: code === 'OFF' ? null : '08:30', endTime: code === 'OFF' ? null : '17:00', breakMinutes: code === 'OFF' ? 0 : 60, isWorking: code !== 'OFF', isActive: true, ...overrides });
const rule = (staffId, ruleType, overrides = {}) => ({ id: `${staffId}-${ruleType}-${overrides.id ?? '1'}`, staffId, ruleType, dayOfWeek: null, startDate: null, endDate: null, startTime: null, endTime: null, numericValue: null, priority: 100, isHardConstraint: true, workPattern: null, ...overrides });
const options = { weekdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayEarlyRequired: 0, saturdayLateRequired: 0, saturdayMinimumStaff: 0, saturdayOperationEnabled: false, sundayOperationEnabled: false, maxConsecutiveWorkDays: 31, maxConsecutiveEarlyDays: 31, maxConsecutiveLateDays: 31, defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00', defaultStartLate: '11:00', defaultEndLate: '19:30', defaultBreakMinutes: 60, classRequirements: [{ classType: AssignedClass.AGE_0, weekdayRequired: 1, saturdayRequired: 0, isActive: true }] };
const people = [staff('s1', '001'), staff('s2', '002')];
const assignmentOn = (result, staffId, date = '2035-01-01') => result.assignments.find((row) => row.staffId === staffId && row.workDate.toISOString().slice(0, 10) === date);

const baseline = generateRuleBasedSchedule(month, people, [], options);
assert.deepEqual(generateRuleBasedSchedule(month, people, [], { ...options, staffWorkRules: [] }), baseline, 'ルール0件は従来結果と一致');

const fixedNormal = rule('s2', StaffWorkRuleType.FIXED_WORK_PATTERN, { startDate: new Date('2035-01-01T00:00:00Z'), endDate: new Date('2035-01-01T00:00:00Z'), workPattern: pattern('NORMAL') });
const allowedEarlyMonday = rule('s2', StaffWorkRuleType.AVAILABLE_WORK_PATTERN, { dayOfWeek: 1, workPattern: pattern('EARLY', { startTime: '07:00', endTime: '16:00' }) });
const fixedAllowed = generateRuleBasedSchedule(month, people, [], { ...options, staffWorkRules: [fixedNormal, allowedEarlyMonday] });
assert.equal(assignmentOn(fixedAllowed, 's2').shiftType, ShiftType.NORMAL, 'ALLOWED不一致でもFIXEDを適用');
assert.equal(assignmentOn(fixedAllowed, 's2').workPatternId, 'pattern-NORMAL', 'FIXEDのWorkPatternを保持');
assert.equal(prohibitionConflict([allowedEarlyMonday], 's2', month, ShiftType.NORMAL, { startTime: '08:30', endTime: '17:00' }), null, 'FIXED用判定はALLOWEDを参照しない');

const prohibited = rule('s2', StaffWorkRuleType.UNAVAILABLE_WORK_PATTERN, { workPattern: pattern('NORMAL') });
const conflict = generateRuleBasedSchedule(month, people, [], { ...options, staffWorkRules: [fixedNormal, prohibited] });
assert.equal(assignmentOn(conflict, 's2').shiftType, ShiftType.OFF, 'PROHIBITEDをFIXEDより優先');
assert.ok(conflict.warnings.some((row) => row.code === 'STAFF_WORK_RULE_FIXED_PROHIBITED' && row.level === 'ERROR'), '禁止理由を返して生成継続');

const leave = generateRuleBasedSchedule(month, people, [{ staffId: 's2', requestDate: month, requestType: ShiftRequestType.PAID_LEAVE, reason: null }], { ...options, staffWorkRules: [fixedNormal] });
assert.equal(assignmentOn(leave, 's2').shiftType, ShiftType.PAID_LEAVE, '承認休暇をFIXEDより優先');
assert.ok(leave.warnings.some((row) => row.code === 'STAFF_WORK_RULE_FIXED_BLOCKED' && row.level === 'ERROR'));

const closed = generateRuleBasedSchedule(month, people, [], { ...options, closedDates: [{ closedDate: month, name: '検証休園日' }], staffWorkRules: [fixedNormal] });
assert.equal(assignmentOn(closed, 's2').shiftType, ShiftType.OFF, '休園日をFIXEDより優先');
assert.ok(closed.warnings.some((row) => row.code === 'STAFF_WORK_RULE_FIXED_BLOCKED'));

assert.equal(ruleLabel(null), '勤務条件の競合', '競合理由nullを安全な一般表示にする');
assert.doesNotThrow(() => generateRuleBasedSchedule(month, people, [], { ...options, staffWorkRules: [fixedNormal, allowedEarlyMonday] }), '問題経路でGeneratorを例外停止させない');

const mondayAllowed = rule('s1', StaffWorkRuleType.AVAILABLE_DAY_OF_WEEK, { dayOfWeek: 1 });
assert.equal(ruleEligibility([mondayAllowed], 's1', new Date('2035-01-01T00:00:00Z'), ShiftType.NORMAL, { startTime: '08:30', endTime: '17:00' }).eligible, true, '月曜ALLOWEDは月曜を許可');
assert.equal(ruleEligibility([mondayAllowed], 's1', new Date('2035-01-02T00:00:00Z'), ShiftType.NORMAL, { startTime: '08:30', endTime: '17:00' }).eligible, false, '月曜ALLOWEDは火曜を拒否');
const sundayAllowed = rule('s1', StaffWorkRuleType.AVAILABLE_DAY_OF_WEEK, { dayOfWeek: 0 });
assert.equal(ruleEligibility([sundayAllowed], 's1', new Date('2035-01-07T00:00:00Z'), ShiftType.NORMAL, { startTime: '08:30', endTime: '17:00' }).eligible, true, '日曜ALLOWEDは数値0を正しく許可');
const wednesdayAllowed = rule('s1', StaffWorkRuleType.AVAILABLE_DAY_OF_WEEK, { id: 'wed', dayOfWeek: 3 });
assert.equal(ruleEligibility([mondayAllowed, wednesdayAllowed], 's1', new Date('2035-01-03T00:00:00Z'), ShiftType.NORMAL, { startTime: '08:30', endTime: '17:00' }).eligible, true, '複数曜日ALLOWEDは和集合');
assert.equal(ruleEligibility([mondayAllowed, wednesdayAllowed], 's1', new Date('2035-01-02T00:00:00Z'), ShiftType.NORMAL, { startTime: '08:30', endTime: '17:00' }).eligible, false, '和集合外の曜日は拒否');
const prohibitedMonday = rule('s1', StaffWorkRuleType.UNAVAILABLE_DAY_OF_WEEK, { dayOfWeek: 1 });
const allowedAndProhibited = ruleEligibility([mondayAllowed, prohibitedMonday], 's1', month, ShiftType.NORMAL, { startTime: '08:30', endTime: '17:00' });
assert.equal(allowedAndProhibited.eligible, false, '同日はPROHIBITEDをALLOWEDより優先');
assert.equal(allowedAndProhibited.reason.id, prohibitedMonday.id);

const fixedOff = rule('s2', StaffWorkRuleType.FIXED_WORK_PATTERN, { startDate: month, endDate: month, workPattern: pattern('OFF') });
const offResult = generateRuleBasedSchedule(month, people, [], { ...options, staffWorkRules: [fixedOff] });
assert.equal(assignmentOn(offResult, 's2').shiftType, ShiftType.OFF, 'OFF固定勤務を正常処理');
assert.equal(assignmentOn(offResult, 's2').workPatternId, 'pattern-OFF');

const futureFixed = rule('s2', StaffWorkRuleType.FIXED_WORK_PATTERN, { dayOfWeek: 2, startDate: new Date('2035-01-02T00:00:00Z'), endDate: new Date('2035-01-09T00:00:00Z'), workPattern: pattern('EARLY', { startTime: '07:00', endTime: '16:00' }) });
const scoped = generateRuleBasedSchedule(month, people, [], { ...options, staffWorkRules: [futureFixed] });
assert.equal(assignmentOn(scoped, 's2', '2035-01-02').shiftType, ShiftType.EARLY, '特定期間FIXEDを適用');
assert.notEqual(assignmentOn(scoped, 's2', '2035-01-03').shiftType, ShiftType.EARLY, '曜日不一致には適用しない');

const preferred = generateRuleBasedSchedule(month, people, [], { ...options, staffWorkRules: [rule('s2', StaffWorkRuleType.PREFERRED_WORK_PATTERN, { workPattern: pattern('NORMAL'), priority: 10 })] });
assert.equal(assignmentOn(preferred, 's2').shiftType, ShiftType.NORMAL, 'PREFERREDを公平性より優先');
const weeklyLimit = generateRuleBasedSchedule(month, [staff('s1', '001')], [], { ...options, staffWorkRules: [rule('s1', StaffWorkRuleType.MAX_WORK_DAYS_PER_WEEK, { numericValue: 1 })] });
assert.equal(weeklyLimit.assignments.filter((row) => row.staffId === 's1' && row.shiftType === ShiftType.NORMAL && row.workDate.toISOString().slice(0, 10) <= '2035-01-07').length, 1, '週勤務日数上限を反映');

console.log('StaffWorkRule generator unit tests: PASS (30 assertions)');
