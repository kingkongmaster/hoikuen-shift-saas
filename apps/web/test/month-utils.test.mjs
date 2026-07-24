import assert from 'node:assert/strict';
import { formatMonthKey, monthChangeReset, moveMonthKey } from '../src/features/shifts/month-utils.js';

assert.equal(moveMonthKey('2026-07', -1), '2026-06');
assert.equal(moveMonthKey('2026-07', 1), '2026-08');
assert.equal(moveMonthKey('2026-12', 1), '2027-01');
assert.equal(moveMonthKey('2026-01', -1), '2025-12');
assert.equal(formatMonthKey(new Date(2026, 6, 17)), '2026-07');
assert.deepEqual(monthChangeReset(), { changes: {}, precheck: null, generationWarnings: [], generationResult: null, message: '' });
console.log('Web month utility tests: PASS (6 scenarios)');
