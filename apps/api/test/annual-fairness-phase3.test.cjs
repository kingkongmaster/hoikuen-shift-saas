const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { performance } = require('node:perf_hooks');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');
const { calculateAnnualFairnessProgress } = require('../dist/application/annual-fairness/annual-fairness-progress');

const month = new Date('2034-08-01T00:00:00.000Z');
const member = (id, confirmed = 0, target = 120000, overrides = {}) => ({ id, employeeNumber: id, displayName: id, assignedClass: 'AGE_0', employmentType: 'FULL_TIME', isDirector: false, canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: false, lateShiftOnly: false, canWorkSaturdays: true, monthlyWorkHourLimit: 300, monthlyTargetWorkDays: null, monthlyTargetWorkHours: null, weeklyAvailableDays: 7, regularWorkStartTime: null, regularWorkEndTime: null, annualFairness: { annualTargetMinutes: target, confirmedFairnessMinutes: confirmed, prescribedMinutesByDate: Object.fromEntries(Array.from({ length: 31 }, (_, index) => [`2034-08-${String(index + 1).padStart(2, '0')}`, 450])) }, ...overrides });
const options = { weekdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayEarlyRequired: 0, saturdayLateRequired: 0, saturdayMinimumStaff: 1, saturdayOperationEnabled: true, sundayOperationEnabled: false, maxConsecutiveWorkDays: 31, maxConsecutiveEarlyDays: 31, maxConsecutiveLateDays: 31, defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00', defaultStartLate: '11:00', defaultEndLate: '19:30', defaultBreakMinutes: 60, classRequirements: [{ classType: 'AGE_0', weekdayRequired: 1, saturdayRequired: 1, isActive: true }] };
const firstNormal = (result, date = '2034-08-05') => result.assignments.find((row) => row.shiftType === 'NORMAL' && row.workDate.toISOString().slice(0, 10) === date)?.staffId;

// A/P: equal annual rates fall through to the existing stable order.
assert.equal(firstNormal(generateRuleBasedSchedule(month, [member('A'), member('B')], [], options)), 'A');
// B/C: lower projected achievement rate wins, including differently sized contracts.
assert.equal(firstNormal(generateRuleBasedSchedule(month, [member('A', 60000), member('B', 30000)], [], options)), 'B');
assert.equal(firstNormal(generateRuleBasedSchedule(month, [member('FULL', 95000, 120000), member('SHORT', 45000, 60000)], [], options)), 'SHORT');
// D: generated paid leave is credited at 100%, so it does not look like missing work.
const leave = generateRuleBasedSchedule(month, [member('A'), member('B', 100)], [{ staffId: 'A', requestDate: new Date('2034-08-04T00:00:00.000Z'), requestType: 'PAID_LEAVE', reason: null }], { ...options, classRequirements: [{ classType: 'AGE_0', weekdayRequired: 0, saturdayRequired: 1, isActive: true }], closedDates: ['01', '02', '03'].map((day) => ({ closedDate: new Date(`2034-08-${day}T00:00:00.000Z`), name: 'fixture' })) });
assert.equal(firstNormal(leave), 'B');
// E/F/G: absent annual input represents all non-COMPLETE statuses and falls through without a sentinel.
for (const status of ['NOT_CONFIGURED', 'REVIEW_REQUIRED', 'UNAVAILABLE']) assert.equal(firstNormal(generateRuleBasedSchedule(month, [member('A', 0, 120000, { annualFairness: undefined }), member('B', 110000)], [], options)), 'A', status);
// N: EARLY/LATE do not evaluate annual fairness.
const special = generateRuleBasedSchedule(month, [member('A', 110000), member('B', 0)], [], { ...options, weekdayEarlyRequired: 1, saturdayEarlyRequired: 1, weekdayLateRequired: 1, saturdayLateRequired: 1, saturdayMinimumStaff: 0 });
assert.equal(special.assignments.find((row) => row.shiftType === 'EARLY')?.staffId, 'A');
// O: comparison remains meaningful above 100%.
assert.equal(firstNormal(generateRuleBasedSchedule(month, [member('A', 150000), member('B', 130000)], [], options)), 'B');

const source = readFileSync(require.resolve('../src/application/shifts/rule-based-shift-generator.ts'), 'utf8');
for (const [label, pattern] of [
  ['H Future Hard', /futureHard[\s\S]*compareAnnualFairness/], ['I Saturday fairness', /saturdayFairness[\s\S]*compareAnnualFairness/],
  ['J monthly target', /targetDeficit[\s\S]*compareAnnualFairness/], ['K special reserve', /specialReserve[\s\S]*compareAnnualFairness/],
  ['L preferred', /preferred[\s\S]*compareAnnualFairness/], ['M staffing SOFT', /softDifference[\s\S]*compareAnnualFairness/],
]) assert.match(source, pattern, label);
assert.match(source, /compareAnnualFairness[\s\S]*const totalWork/, 'annual fairness precedes monthly total work');

const progress = calculateAnnualFairnessProgress({ regularWorkStartTime: null, regularWorkEndTime: null, workContracts: [{ effectiveFrom: new Date('2034-04-01Z'), effectiveTo: new Date('2035-03-31Z'), annualizedTargetMinutes: 120000, prescribedDailyMinutes: 450, voidedAt: null }], assignments: [{ workDate: new Date('2034-05-01Z'), shiftType: 'PAID_LEAVE', startTime: null, endTime: null, breakMinutes: null }, { workDate: new Date('2034-05-02Z'), shiftType: 'AM_HALF', startTime: null, endTime: null, breakMinutes: null }] }, { start: new Date('2034-04-01Z'), endExclusive: new Date('2035-04-01Z') }, { defaultStartNormal: '08:30', defaultEndNormal: '17:00', defaultBreakMinutes: 60 });
assert.equal(progress.calculationStatus, 'COMPLETE'); assert.equal(progress.actual.fairnessActualMinutes, 675);

const hundred = Array.from({ length: 100 }, (_, index) => { const target = index < 50 ? 120000 : 60000; return member(`S${String(index + 1).padStart(3, '0')}`, Math.round(target * (0.5 + (index % 5) * 0.0001)), target); });
const hundredOptions = { ...options, weekdayEarlyRequired: 1, weekdayLateRequired: 1, saturdayEarlyRequired: 1, saturdayLateRequired: 1, saturdayMinimumStaff: 3, classRequirements: [{ classType: 'AGE_0', weekdayRequired: 3, saturdayRequired: 1, isActive: true }] };
const run = (enabled) => { const started = performance.now(); const result = generateRuleBasedSchedule(month, hundred, [], { ...hundredOptions, annualFairnessSoft: enabled }); return { result, durationMs: performance.now() - started }; };
const before = run(false); const after = run(true);
const metric = ({ result, durationMs }) => { const normals = new Map(hundred.map((s) => [s.id, 0])); for (const row of result.assignments) if (row.shiftType === 'NORMAL') normals.set(row.staffId, normals.get(row.staffId) + 1); const rates = hundred.map((s) => (s.annualFairness.confirmedFairnessMinutes + normals.get(s.id) * 450) / s.annualFairness.annualTargetMinutes); const counts = result.specialShiftSummary; const spread = (values) => Math.max(...values) - Math.min(...values); return { totalWorkSpread: spread(counts.map((r) => r.workCount)), normalSpread: spread([...normals.values()]), saturdayMax: Math.max(...counts.map((r) => r.saturdayCount)), saturdayDistribution: Object.fromEntries([...new Set(counts.map((r) => r.saturdayCount))].sort().map((n) => [n, counts.filter((r) => r.saturdayCount === n).length])), saturdayThreePlus: counts.filter((r) => r.saturdayCount >= 3).length, earlySpread: spread(counts.map((r) => r.earlyCount)), lateSpread: spread(counts.map((r) => r.lateCount)), annualRateSpread: spread(rates), annualDifferenceSpread: spread(hundred.map((s, i) => s.annualFairness.annualTargetMinutes * (rates[i] - 1))), contractRateSpread: { full: spread(rates.slice(0, 50)), short: spread(rates.slice(50)) }, hardShortages: result.warnings.filter((w) => w.level === 'ERROR').length, warnings: result.warnings.filter((w) => w.level === 'WARNING').length, errors: result.warnings.filter((w) => w.level === 'ERROR').length, futureHard: result.futureHardCapacitySummary, durationMs } };
const comparison = { before: metric(before), after: metric(after) };
console.log(JSON.stringify(comparison, null, 2));
assert.ok(comparison.after.annualRateSpread <= comparison.before.annualRateSpread + 1e-12);
assert.equal(comparison.after.saturdayMax, comparison.before.saturdayMax); assert.equal(comparison.after.saturdayThreePlus, comparison.before.saturdayThreePlus);
assert.ok(comparison.after.totalWorkSpread <= comparison.before.totalWorkSpread); assert.ok(comparison.after.normalSpread <= comparison.before.normalSpread); assert.ok(comparison.after.earlySpread <= comparison.before.earlySpread); assert.ok(comparison.after.lateSpread <= comparison.before.lateSpread); assert.equal(comparison.after.hardShortages, comparison.before.hardShortages); assert.equal(comparison.after.warnings, comparison.before.warnings); assert.equal(comparison.after.errors, comparison.before.errors);
assert.equal(comparison.after.futureHard.maxFlowCalls, comparison.before.futureHard.maxFlowCalls); assert.equal(comparison.after.futureHard.planBuilds, comparison.before.futureHard.planBuilds); assert.deepEqual(comparison.after.futureHard.maxFlowCallsByDate, comparison.before.futureHard.maxFlowCallsByDate); assert.ok(comparison.after.durationMs < Math.max(1000, comparison.before.durationMs * 10));
console.log('Annual fairness Phase 3 fixtures A-P and 100-staff comparison: PASS');
