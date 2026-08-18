const assert = require('node:assert/strict');
const { prorateAnnualTarget } = require('../dist/application/annual-fairness/annual-target-proration');

const date = (value) => new Date(`${value}T00:00:00.000Z`);
const contract = (effectiveFrom, effectiveTo, annualizedTargetMinutes = 115200, overrides = {}) => ({ effectiveFrom: date(effectiveFrom), effectiveTo: effectiveTo ? date(effectiveTo) : null, annualizedTargetMinutes, voidedAt: null, ...overrides });
const leapStart = date('2031-04-01');
const leapEnd = date('2032-04-01');
assert.equal(prorateAnnualTarget(date('2032-04-01'),date('2033-04-01'),[contract('2032-04-01','2033-03-31')]).fiscalYearDays,365);

assert.deepEqual(prorateAnnualTarget(leapStart, leapEnd, []), { annualTargetMinutes: null, coveredDays: 0, fiscalYearDays: 366, calculationStatus: 'NOT_CONFIGURED', unavailableReason: 'CONTRACT_NOT_CONFIGURED' });
assert.deepEqual(prorateAnnualTarget(leapStart, leapEnd, [contract('2031-04-01', '2032-03-31')]), { annualTargetMinutes: 115200, coveredDays: 366, fiscalYearDays: 366, calculationStatus: 'COMPLETE', unavailableReason: null });
assert.deepEqual(prorateAnnualTarget(leapStart, leapEnd, [contract('2031-04-01', '2031-09-30'), contract('2031-10-01', null, 72000)]), { annualTargetMinutes: 93600, coveredDays: 366, fiscalYearDays: 366, calculationStatus: 'COMPLETE', unavailableReason: null });
const partial = prorateAnnualTarget(leapStart, leapEnd, [contract('2031-04-01', '2031-09-30')]);
assert.equal(partial.annualTargetMinutes, 57600);
assert.equal(partial.coveredDays, 183);
assert.equal(partial.calculationStatus, 'REVIEW_REQUIRED');
assert.equal(partial.unavailableReason, 'CONTRACT_GAP');
const withGap = prorateAnnualTarget(leapStart, leapEnd, [contract('2031-04-01', '2031-06-30'), contract('2031-10-01', '2032-03-31')]);
assert.equal(withGap.coveredDays, 274);
assert.equal(withGap.calculationStatus, 'REVIEW_REQUIRED');
assert.equal(prorateAnnualTarget(leapStart, leapEnd, [contract('2031-04-01', null, 115200, { voidedAt: new Date() })]).calculationStatus, 'NOT_CONFIGURED');
assert.throws(() => prorateAnnualTarget(leapStart, leapEnd, [contract('2031-04-01', null, 0)]), RangeError);
const performanceStartedAt = performance.now();
for (let staffIndex = 0; staffIndex < 100; staffIndex += 1) {
  const result = prorateAnnualTarget(leapStart, leapEnd, [contract('2031-04-01', '2031-09-30'), contract('2031-10-01', null, 72000)]);
  assert.equal(result.calculationStatus, 'COMPLETE');
}
const performanceMs = performance.now() - performanceStartedAt;
assert.ok(performanceMs < 1000, `100 staff proration took ${performanceMs.toFixed(2)}ms`);
console.log(`Annual target proration tests: PASS (100 staff ${performanceMs.toFixed(2)}ms)`);
