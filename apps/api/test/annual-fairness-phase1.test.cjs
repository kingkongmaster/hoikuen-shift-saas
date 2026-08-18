const assert = require('node:assert/strict');
const { ShiftType } = require('@prisma/client');
const { fiscalYearForDate, fiscalYearRange } = require('../dist/application/annual-fairness/fiscal-year-range');
const { annualWorkSummary, prescribedMinutes } = require('../dist/application/annual-fairness/annual-work-summary-calculator');

for (const month of [1, 4, 12]) {
  const range = fiscalYearRange(2032, month);
  assert.equal(range.start.toISOString().slice(0, 10), `2032-${String(month).padStart(2, '0')}-01`);
  assert.equal(range.endExclusive.toISOString().slice(0, 10), `2033-${String(month).padStart(2, '0')}-01`);
}
assert.equal(fiscalYearForDate(new Date('2032-04-01T00:00:00Z'), 4), 2032);
assert.equal(fiscalYearForDate(new Date('2032-03-31T00:00:00Z'), 4), 2031);
assert.equal(fiscalYearForDate(new Date('2032-02-29T00:00:00Z'), 4), 2031, 'leap day remains inside the preceding April fiscal year');
assert.throws(() => fiscalYearRange(2032, 0), RangeError);
assert.throws(() => fiscalYearRange(2032, 13), RangeError);

const assignment = (shiftType, overrides = {}) => ({ shiftType, startTime: null, endTime: null, breakMinutes: null, ...overrides });
const result = annualWorkSummary([
  assignment(ShiftType.NORMAL, { startTime: '09:00', endTime: '18:00', breakMinutes: 60 }),
  assignment(ShiftType.PAID_LEAVE),
  assignment(ShiftType.AM_HALF),
  assignment(ShiftType.PM_HALF),
  assignment(ShiftType.OFF),
], prescribedMinutes('09:00', '18:00', 60));
assert.deepEqual(result, {
  actualWorkedMinutes: 480,
  paidLeaveEquivalentMinutes: 480,
  halfLeaveEquivalentMinutes: 480,
  fairnessActualMinutes: 1440,
  calculationStatus: 'COMPLETE',
  unavailableReason: null,
});
assert.equal(prescribedMinutes(null, null, 60), null);
assert.equal(prescribedMinutes('09:00', '09:30', 60), null);
const unavailable = annualWorkSummary([assignment(ShiftType.PAID_LEAVE)], null);
assert.equal(unavailable.calculationStatus, 'UNAVAILABLE');
assert.equal(unavailable.unavailableReason, 'PRESCRIBED_WORK_MINUTES_UNAVAILABLE');
assert.equal(unavailable.fairnessActualMinutes, null);
assert.deepEqual(annualWorkSummary([assignment(ShiftType.NORMAL)], 480), {
  actualWorkedMinutes: null,
  paidLeaveEquivalentMinutes: null,
  halfLeaveEquivalentMinutes: null,
  fairnessActualMinutes: null,
  calculationStatus: 'UNAVAILABLE',
  unavailableReason: 'WORKED_ASSIGNMENT_MINUTES_UNAVAILABLE',
});

console.log('Annual fairness Phase 1 unit tests: PASS');
