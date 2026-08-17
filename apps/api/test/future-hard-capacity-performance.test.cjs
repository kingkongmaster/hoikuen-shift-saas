const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');

const classes = ['AGE_0', 'AGE_1', 'AGE_2', 'AGE_3', 'AGE_4', 'AGE_5'];
const staff = Array.from({ length: 100 }, (_, index) => ({
  id: `P${String(index + 1).padStart(3, '0')}`,
  employeeNumber: `P${String(index + 1).padStart(3, '0')}`,
  displayName: `Anonymous ${index + 1}`,
  assignedClass: classes[index % classes.length],
  employmentType: 'FULL_TIME',
  isDirector: false,
  canWorkEarly: index % 7 !== 0,
  canWorkRegular: true,
  canWorkLate: index % 9 !== 0,
  earlyShiftOnly: false,
  lateShiftOnly: false,
  canWorkSaturdays: index % 5 !== 0,
  monthlyWorkHourLimit: 200,
  monthlyTargetWorkDays: 20,
  monthlyTargetWorkHours: 150,
  weeklyAvailableDays: 5,
  regularWorkStartTime: null,
  regularWorkEndTime: null,
}));
const options = {
  weekdayEarlyRequired: 4, weekdayLateRequired: 4,
  saturdayEarlyRequired: 2, saturdayLateRequired: 2, saturdayMinimumStaff: 12,
  saturdayOperationEnabled: true, sundayOperationEnabled: false,
  maxConsecutiveWorkDays: 6, maxConsecutiveEarlyDays: 1, maxConsecutiveLateDays: 1,
  defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00',
  defaultStartLate: '11:00', defaultEndLate: '19:30', defaultBreakMinutes: 60,
  classRequirements: classes.map((classType) => ({ classType, weekdayRequired: 5, saturdayRequired: 1, isActive: true })),
};

function measure(enabled) {
  generateRuleBasedSchedule(new Date('2031-01-01T00:00:00.000Z'), staff, [], { ...options, futureHardCapacityReservation: enabled });
  const samples = [];
  let result;
  for (let index = 0; index < 3; index += 1) {
    const started = performance.now();
    result = generateRuleBasedSchedule(new Date('2031-01-01T00:00:00.000Z'), staff, [], { ...options, futureHardCapacityReservation: enabled });
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return { durationMs: Number(samples[1].toFixed(2)), result };
}

const before = measure(false);
const after = measure(true);
const ratio = after.durationMs / Math.max(before.durationMs, 0.01);
const workingTypes = new Set(['EARLY', 'LATE', 'NORMAL']);
const fairness = (result) => {
  const counts = (predicate) => staff.map((member) => result.assignments.filter((item) => item.staffId === member.id && predicate(item)).length);
  const spread = (values) => Math.max(...values) - Math.min(...values);
  const saturday = counts((item) => item.workDate.getUTCDay() === 6 && workingTypes.has(item.shiftType));
  return {
    workSpread: spread(counts((item) => workingTypes.has(item.shiftType))),
    earlySpread: spread(counts((item) => item.shiftType === 'EARLY')),
    lateSpread: spread(counts((item) => item.shiftType === 'LATE')),
    normalSpread: spread(counts((item) => item.shiftType === 'NORMAL')),
    weekdayOffSpread: spread(counts((item) => [1, 2, 3, 4, 5].includes(item.workDate.getUTCDay()) && !workingTypes.has(item.shiftType))),
    saturdaySpread: spread(saturday),
    saturdayMax: Math.max(...saturday),
    saturdayZero: saturday.filter((value) => value === 0).length,
    saturdayOne: saturday.filter((value) => value === 1).length,
    saturdayTwo: saturday.filter((value) => value === 2).length,
    saturdayThreePlus: saturday.filter((value) => value >= 3).length,
  };
};
const beforeFairness = fairness(before.result);
const afterFairness = fairness(after.result);
const auditedStaffSaturdayCount = after.result.assignments.filter((item) => item.staffId === 'P064' && item.workDate.getUTCDay() === 6 && workingTypes.has(item.shiftType)).length;
assert.equal(before.result.assignments.length, 3100);
assert.equal(after.result.assignments.length, 3100);
assert.ok(afterFairness.saturdayMax <= 2, `Saturday NORMAL tie-break must prevent avoidable concentration: ${afterFairness.saturdayMax}`);
assert.equal(afterFairness.saturdayThreePlus, 0, 'no worker should receive 3+ Saturdays when equally safe alternatives exist');
assert.ok(auditedStaffSaturdayCount <= 2, `audited regular-only worker must not receive all Saturdays: ${auditedStaffSaturdayCount}`);
assert.equal(afterFairness.earlySpread, beforeFairness.earlySpread, 'Saturday NORMAL tie-break must not change EARLY fairness');
assert.equal(afterFairness.lateSpread, beforeFairness.lateSpread, 'Saturday NORMAL tie-break must not change LATE fairness');
assert.ok(after.durationMs < 5000, `100-person generation must remain practical: ${after.durationMs}ms`);
assert.ok(ratio < 2, `look-ahead slowdown must remain below x2: x${ratio.toFixed(2)}`);
assert.ok(after.result.futureHardCapacitySummary.evaluations > 0);
assert.ok(after.result.futureHardCapacitySummary.maxFlowCalls <= 31, 'shared future plan should require at most one max-flow rebuild per calendar day');
console.log(JSON.stringify({
  beforeMs: before.durationMs,
  afterMs: after.durationMs,
  ratio: Number(ratio.toFixed(2)),
  evaluations: after.result.futureHardCapacitySummary.evaluations,
  cacheHits: after.result.futureHardCapacitySummary.cacheHits,
  planBuilds: after.result.futureHardCapacitySummary.planBuilds,
  maxFlowCalls: after.result.futureHardCapacitySummary.maxFlowCalls,
  maxFlowCallsPerDay: Math.max(0, ...Object.values(after.result.futureHardCapacitySummary.maxFlowCallsByDate)),
  incrementalUpdates: after.result.futureHardCapacitySummary.incrementalUpdates,
  fairness: afterFairness,
  auditedStaffSaturdayCount,
}));
