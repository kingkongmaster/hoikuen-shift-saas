const assert = require('node:assert/strict');
const test = require('node:test');
const { dateInMonth, eventFields, fixedFields, halfDayBaseFields, requestProvenanceFields, assertSameExisting } = require('../scripts/lib/monthly-input-fields.cjs');
const source = { sourceReferences: ['TEST-2026-001:J8'], manifestDigest: 'a'.repeat(64) };
const lookup = { staffCodes: new Set(['TEST1']), classCodes: new Set(['AGE_0']), patternCodes: new Set(['NORMAL']), staffIds: new Map([['TEST1', 'anonymous-staff']]), patternIds: new Map([['NORMAL', 'anonymous-pattern']]) };
const base = { ...source, date: '2026-09-24', staffCode: 'TEST1', patternCode: 'NORMAL' };
test('calendar validation rejects impossible or out-of-month dates', () => {
  for (const day of ['2026-09-31', '2026-10-01', '2026-09-1', 'invalid']) assert.throws(() => dateInMonth(day, '2026-09'));
  assert.equal(dateInMonth(base.date, '2026-09').toISOString(), '2026-09-24T00:00:00.000Z');
});
test('event targets and explicit fixed-time policy survive mapping', () => {
  const input = { ...base, targetStaffCodes: ['TEST1'], targetClasses: [], allowedWorkPatternCodes: ['NORMAL'], fixedTimeStaffAllowed: false };
  const before = JSON.stringify(input); const mapped = eventFields(input, '2026-09', lookup);
  assert.deepEqual(mapped.targetStaffCodes, ['TEST1']); assert.deepEqual(mapped.allowedWorkPatternCodes, ['NORMAL']); assert.equal(mapped.fixedTimeStaffAllowed, false);
  assert.equal(JSON.stringify(input), before);
  assert.throws(() => eventFields({ ...input, targetStaffCodes: ['OTHER_TENANT'] }, '2026-09', lookup));
  assert.throws(() => eventFields({ ...input, fixedTimeStaffAllowed: undefined }, '2026-09', lookup));
});
test('dated early departure retains pattern identity and exact times', () => {
  const mapped = fixedFields({ ...base, startTime: '08:30', endTime: '15:00' }, '2026-09', lookup);
  assert.equal(mapped.workPatternId, 'anonymous-pattern'); assert.equal(mapped.endTime, '15:00'); assert.equal(mapped.startDate.getTime(), mapped.endDate.getTime());
  for (const bad of [{ endTime: '15:00' }, { startTime: '15:00', endTime: '08:30' }, { startTime: '25:00', endTime: '26:00' }]) assert.throws(() => fixedFields({ ...base, ...bad }, '2026-09', lookup));
});
test('half-day base must be explicit and tenant-resolved', () => {
  assert.throws(() => halfDayBaseFields({ ...base, requestType: 'HALF_DAY_PM' }, '2026-09', lookup));
  const mapped = halfDayBaseFields({ ...base, requestType: 'HALF_DAY_PM', baseWorkPatternCode: 'NORMAL' }, '2026-09', lookup);
  assert.equal(mapped.workPatternId, 'anonymous-pattern');
  assert.throws(() => fixedFields({ ...base, staffCode: 'OTHER_TENANT' }, '2026-09', lookup));
});
test('provenance keeps source references and manifest identity without free text', () => {
  const comment = JSON.parse(requestProvenanceFields(source).adminComment);
  assert.deepEqual(comment.references, source.sourceReferences); assert.equal(comment.manifestDigest, source.manifestDigest);
  assert.throws(() => requestProvenanceFields({ ...source, sourceReferences: ['arbitrary private text'] }));
});
test('existing mismatch stops instead of overwriting; equal data is reusable', () => {
  const mapped = fixedFields(base, '2026-09', lookup);
  assert(assertSameExisting({ ...mapped }, mapped));
  assert.throws(() => assertSameExisting({ ...mapped, endTime: '18:00' }, mapped), /EXISTING_VALUE_CONFLICT/);
});
test('monthly preference preserves SOFT, allowed sets do not become fixed assignments', () => {
 const soft=fixedFields({...base,ruleType:'PREFERRED_WORK_PATTERN'},'2026-09',lookup);
 assert.equal(soft.isHardConstraint,false);assert.equal(soft.ruleType,'PREFERRED_WORK_PATTERN');
 assert.equal(fixedFields({...base,ruleType:'AVAILABLE_WORK_PATTERN'},'2026-09',lookup).ruleType,'AVAILABLE_WORK_PATTERN');
 assert.throws(()=>fixedFields({...base,ruleType:'DELETE_ALL'},'2026-09',lookup));
});
test('JSON property order is immaterial, effect order remains protected', () => {
 assert(assertSameExisting({configuration:{b:2,a:1}},{configuration:{a:1,b:2}}));
 assert.throws(()=>assertSameExisting({effects:[{type:'CANCEL_REQUEST'},{type:'REQUEST'}]},{effects:[{type:'REQUEST'},{type:'CANCEL_REQUEST'}]}));
});
