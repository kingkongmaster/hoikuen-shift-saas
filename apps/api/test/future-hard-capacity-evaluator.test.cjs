const assert = require('node:assert/strict');
const { futureHardCapacityLoss } = require('../dist/application/shifts/future-hard-capacity-evaluator');

const slot = (id, date, required, candidateIds) => ({ id, date, required, candidateIds });
const capacity = (staffId, remainingDays) => ({ staffId, remainingDays });
const evaluate = (overrides = {}) => futureHardCapacityLoss({
  candidateId: 'scarce',
  currentCandidateCount: 2,
  slots: [slot('future-normal', '2030-01-12', 1, ['scarce'])],
  capacities: [capacity('scarce', 1), capacity('today-only', 1)],
  ...overrides,
});

assert.equal(evaluate().penalty, 1, 'A: sole future HARD candidate is preserved');
assert.equal(evaluate({
  slots: [slot('future-normal', '2030-01-12', 1, ['scarce', 'alternate'])],
  capacities: [capacity('scarce', 1), capacity('alternate', 1), capacity('today-only', 1)],
}).penalty, 0, 'B: only the minimum dynamically matched capacity is preserved; alternatives remain usable today');
assert.equal(evaluate({ currentCandidateCount: 1 }).penalty, 0, 'C: the only candidate for today is never withheld');
assert.equal(evaluate({ slots: [slot('leave-excluded', '2030-01-12', 1, [])] }).penalty, 0, 'D: leave is represented by exclusion from future candidates');
assert.equal(evaluate({ slots: [slot('prohibited-excluded', '2030-01-12', 1, [])] }).penalty, 0, 'E: prohibited work is represented by exclusion');
assert.equal(evaluate({ capacities: [capacity('scarce', 0), capacity('today-only', 1)] }).penalty, 0, 'F: weekly-limit staff is not future capacity');
assert.equal(evaluate({ slots: [slot('late-only', '2030-01-12', 1, ['late-capable'])], capacities: [capacity('scarce', 1), capacity('late-capable', 1)] }).penalty, 0, 'G: a different shift capability does not reserve the candidate');
assert.equal(evaluate({ slots: [] }).penalty, 0, 'H: dates outside the supplied week are not evaluated');
assert.equal(evaluate({ candidateUnavailableSlotIdsAfterCurrent: ['future-normal'] }).penalty, 1, 'current assignment may remove tomorrow eligibility through an existing consecutive-work HARD rule');

const multiDay = evaluate({
  slots: [
    slot('d1-early', '2030-01-11', 1, ['scarce']),
    slot('d1-normal', '2030-01-11', 1, ['scarce', 'alternate']),
    slot('d2-normal', '2030-01-12', 1, ['scarce', 'alternate']),
  ],
  capacities: [capacity('scarce', 2), capacity('alternate', 1), capacity('today-only', 1)],
});
assert.equal(multiDay.beforeMatched, 3, 'one person cannot fill two slots on the same day');
assert.equal(multiDay.penalty, 1, 'weekly capacity loss is measured across future dates');

console.log('Future HARD capacity evaluator unit test: PASS (A-H + multi-day matching)');
