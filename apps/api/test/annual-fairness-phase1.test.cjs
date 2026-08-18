const assert = require('node:assert/strict');
const { ShiftType } = require('@prisma/client');
const { fiscalYearForDate, fiscalYearRange } = require('../dist/application/annual-fairness/fiscal-year-range');
const { annualWorkSummary, prescribedMinutes } = require('../dist/application/annual-fairness/annual-work-summary-calculator');
const { resolveDailyPrescribedMinutes } = require('../dist/application/annual-fairness/daily-prescribed-minutes');
const { prorateAnnualTarget } = require('../dist/application/annual-fairness/annual-target-proration');

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

const utc=(value)=>new Date(`${value}T00:00:00.000Z`);
const contracts=[
  {effectiveFrom:utc('2032-04-01'),effectiveTo:utc('2032-09-30'),annualizedTargetMinutes:120000,prescribedDailyMinutes:480,voidedAt:null},
  {effectiveFrom:utc('2032-10-01'),effectiveTo:null,annualizedTargetMinutes:60000,prescribedDailyMinutes:360,voidedAt:null},
];
assert.deepEqual(resolveDailyPrescribedMinutes(utc('2032-09-30'),contracts,{regularWorkStartTime:'09:00',regularWorkEndTime:'17:00'},{defaultStartNormal:'08:30',defaultEndNormal:'17:00',defaultBreakMinutes:60}),{minutes:480,source:'CONTRACT'});
assert.deepEqual(resolveDailyPrescribedMinutes(utc('2032-10-01'),contracts,{regularWorkStartTime:'09:00',regularWorkEndTime:'17:00'},{defaultStartNormal:'08:30',defaultEndNormal:'17:00',defaultBreakMinutes:60}),{minutes:360,source:'CONTRACT'});
assert.deepEqual(resolveDailyPrescribedMinutes(utc('2031-01-01'),[],{regularWorkStartTime:'09:00',regularWorkEndTime:'17:00'},{defaultStartNormal:'08:30',defaultEndNormal:'17:00',defaultBreakMinutes:60}),{minutes:420,source:'STAFF'});
assert.deepEqual(resolveDailyPrescribedMinutes(utc('2031-01-01'),[],{regularWorkStartTime:null,regularWorkEndTime:null},{defaultStartNormal:'08:30',defaultEndNormal:'17:00',defaultBreakMinutes:60}),{minutes:450,source:'TENANT'});
assert.deepEqual(resolveDailyPrescribedMinutes(utc('2031-01-01'),[],{regularWorkStartTime:null,regularWorkEndTime:null},{defaultStartNormal:null,defaultEndNormal:null,defaultBreakMinutes:60}),{minutes:null,source:'UNAVAILABLE'});
assert.deepEqual(resolveDailyPrescribedMinutes(utc('2032-06-01'),[{...contracts[0],voidedAt:new Date()}],{regularWorkStartTime:'09:00',regularWorkEndTime:'17:00'},{defaultStartNormal:'08:30',defaultEndNormal:'17:00',defaultBreakMinutes:60}),{minutes:420,source:'STAFF'});
assert.equal(prorateAnnualTarget(utc('2032-04-01'),utc('2033-04-01'),contracts).calculationStatus,'COMPLETE');
const performanceStartedAt=performance.now();
for(let index=0;index<100;index+=1){
  const target=prorateAnnualTarget(utc('2032-04-01'),utc('2033-04-01'),contracts);
  const actual=annualWorkSummary([{...assignment(ShiftType.PAID_LEAVE),workDate:utc('2032-10-01')}],item=>resolveDailyPrescribedMinutes(item.workDate,contracts,{regularWorkStartTime:null,regularWorkEndTime:null},{defaultStartNormal:'08:30',defaultEndNormal:'17:00',defaultBreakMinutes:60}).minutes);
  assert.ok(target.annualTargetMinutes>0);assert.equal(actual.fairnessActualMinutes,360);
}
const annualPerformanceMs=performance.now()-performanceStartedAt;
assert.ok(annualPerformanceMs<1000);

console.log(`Annual fairness Phase 1/2B unit tests: PASS (100 staff ${annualPerformanceMs.toFixed(2)}ms)`);
