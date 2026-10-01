'use strict';

// Pure mapping for monthly imports. No database access or source-document content.
function reject() { throw new Error('MONTHLY_INPUT_FIELD_VALIDATION_FAILED'); }
function dateInMonth(value, month) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || value.slice(0, 7) !== month) reject();
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) reject();
  return date;
}
function provenance(row) {
  if (!Array.isArray(row.sourceReferences) || !row.sourceReferences.length) reject();
  if (row.sourceReferences.some(value => typeof value !== 'string' || !/^[A-Z][A-Z0-9_-]{2,60}(?::[A-Z]+[1-9][0-9]*)?$/.test(value))) reject();
  if (!/^[a-f0-9]{64}$/.test(row.manifestDigest || '')) reject();
  return { sourceType: 'MONTHLY_PACKAGE', sourceReference: JSON.stringify({ references: [...new Set(row.sourceReferences)].sort(), manifestDigest: row.manifestDigest }) };
}
function knownList(value, allowed) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !allowed.has(item))) reject();
  return [...new Set(value)].sort();
}
function eventFields(row, month, lookup) {
  return {
    eventDate: dateInMonth(row.date, month),
    targetStaffCodes: knownList(row.targetStaffCodes, lookup.staffCodes),
    targetClasses: knownList(row.targetClasses, lookup.classCodes),
    allowedWorkPatternCodes: knownList(row.allowedWorkPatternCodes, lookup.patternCodes),
    fixedTimeStaffAllowed: typeof row.fixedTimeStaffAllowed === 'boolean' ? row.fixedTimeStaffAllowed : reject(),
    ...provenance(row),
  };
}
function fixedFields(row, month, lookup) {
  const staffId = lookup.staffIds.get(row.staffCode);
  const workPatternId = lookup.patternIds.get(row.patternCode);
  if (!staffId || !workPatternId) reject();
  const date = dateInMonth(row.date, month);
  const start = row.startTime ?? null, end = row.endTime ?? null;
  if ((start === null) !== (end === null)) reject();
  if (start !== null && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end)) reject();
  return { staffId, workPatternId, ruleType: 'FIXED_WORK_PATTERN', startDate: date, endDate: date,
    startTime: start, endTime: end, priority: 0, isHardConstraint: true, ...provenance(row) };
}
function halfDayBaseFields(row, month, lookup) {
  if (!['HALF_DAY_AM', 'HALF_DAY_PM'].includes(row.requestType) || !row.baseWorkPatternCode) reject();
  return fixedFields({ ...row, patternCode: row.baseWorkPatternCode }, month, lookup);
}
function requestProvenanceFields(row) {
  // ShiftRequest has no sourceReference column; use its existing adminComment.
  return { adminComment: provenance(row).sourceReference };
}
function assertSameExisting(existing, intended) {
  const normalize = value => value instanceof Date ? value.toISOString() : Array.isArray(value) ? [...value].sort() : value ?? null;
  for (const key of Object.keys(intended)) if (JSON.stringify(normalize(existing[key])) !== JSON.stringify(normalize(intended[key]))) {
    throw new Error('MONTHLY_INPUT_EXISTING_VALUE_CONFLICT');
  }
  return true;
}
module.exports = { dateInMonth, provenance, eventFields, fixedFields, halfDayBaseFields, requestProvenanceFields, assertSameExisting };
