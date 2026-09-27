const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { anonymousFormalPackage } = require('./helpers/anonymous-formal-package.cjs');
const { derivePreflight, validatePreflight, hash } = require('../scripts/lib/formal-preflight.cjs');
const parent = anonymousFormalPackage();
for (const row of parent.staff) row.provenance.displayName = { sourceId: 'MUSUBI-2026-001', locator: 'anonymous identity-only fixture', approvalStatus: 'APPROVED', approvalAuthority: 'APPROVED_ITEM_SCOPE' };
const bytes = Buffer.from(JSON.stringify(parent));
const binding = { targetTenantId: randomUUID(), expectedParentHash: hash(bytes) };
const derived = derivePreflight(bytes, { ...binding, approvalReference: 'anonymous test authorization, preflight only' });
assert.deepEqual(Buffer.from(derived.parentPackageBase64, 'base64'), bytes);
assert.equal(parent.productionApproval.approved, false);
assert.equal(validatePreflight(derived, binding).summary.expectedStaff, 23);
for (const change of [x => x.targetTenantId = randomUUID(), x => x.purpose = 'APPLY', x => x.parentPackageSha256 = '0'.repeat(64), x => x.createdAt = 'invalid', x => x.approvalReference = '', x => x.extra = true, x => x.parentPackageBase64 += '\n']) {
  const bad = structuredClone(derived); change(bad); assert.throws(() => validatePreflight(bad, binding));
}
for (const change of [x => x.staff[1].displayName = x.staff[0].displayName, x => x.staff[0].provenance.displayName.sourceId = 'MUSUBI-2026-039', x => x.workPatterns.find(r => r.value[0] === 'P05').value[2] = '10:30', x => x.individualContracts.push({value:{annualHours:2080}})]) {
  const bad = structuredClone(parent); change(bad); const b = Buffer.from(JSON.stringify(bad));
  assert.throws(() => derivePreflight(b, { ...binding, expectedParentHash: hash(b), approvalReference: 'test' }));
}
console.log('Formal preflight binding/source/identity negative tests PASS');

const { deriveExecution, validateExecution } = require('../scripts/lib/formal-execution.cjs');
for (const mode of ['DEFERRED', 'LINKED']) {
  const envelope = deriveExecution(bytes, { ...binding, approvalReference: 'anonymous execution test', adminLinkMode: mode, ...(mode === 'LINKED' ? { adminEmployeeNumber: 'S001' } : {}) });
  const result = validateExecution(envelope, binding);
  assert.equal(result.data.adminLinkMode, mode);
  assert.equal(result.data.tenantId, binding.targetTenantId);
  assert.deepEqual(Buffer.from(envelope.parentPackageBase64, 'base64'), bytes);
  for (const mutate of [x => delete x.adminLinkMode, x => x.adminLinkMode = 'invalid', x => x.extra = true, x => x.parentPackageSha256 = '0'.repeat(64), x => x.targetTenantId = randomUUID(), x => mode === 'DEFERRED' ? x.adminEmployeeNumber = 'S001' : delete x.adminEmployeeNumber]) {
    const bad = structuredClone(envelope); mutate(bad); assert.throws(() => validateExecution(bad, binding));
  }
}
assert.throws(() => deriveExecution(bytes, { ...binding, approvalReference: 'test' }));
assert.deepEqual(Buffer.from(JSON.stringify(parent)), bytes);
console.log('Execution envelope explicit mode / parent immutability / binding PASS');
