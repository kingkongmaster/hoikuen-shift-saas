const crypto = require('node:crypto');
const { adaptFormalPackage, validateShape } = require('./formal-package-adapter.cjs');
const { assertEnvironment, assertDatabaseSafety } = require('./production-operation-guard.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = () => { throw new Error('SYSTEM_SAFETY_BLOCK:FORMAL_PREFLIGHT:invalid binding or package'); };
const wrapperSchema = {
  type: 'object', additionalProperties: false,
  required: ['packageType', 'purpose', 'targetEnvironment', 'targetTenantId', 'parentPackageSha256', 'parentPackageBase64', 'createdAt', 'approvalReference'],
  properties: {
    packageType: { const: 'MUSUBI_PRODUCTION_PREFLIGHT_INPUT' }, purpose: { const: 'PRODUCTION_PREFLIGHT' },
    targetEnvironment: { const: 'PRODUCTION' }, targetTenantId: { type: 'string', format: 'uuid' },
    parentPackageSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, parentPackageBase64: { type: 'string', minLength: 1 },
    createdAt: { type: 'string', minLength: 1 }, approvalReference: { type: 'string', minLength: 1 },
  },
};
// Original bytes are retained unchanged. This wrapper is never an import/apply package.
function derivePreflight(parentBytes, { targetTenantId, approvalReference, expectedParentHash }) {
  if (hash(parentBytes) !== expectedParentHash) fail();
  const input = { packageType: 'MUSUBI_PRODUCTION_PREFLIGHT_INPUT', purpose: 'PRODUCTION_PREFLIGHT', targetEnvironment: 'PRODUCTION',
    targetTenantId, parentPackageSha256: expectedParentHash, parentPackageBase64: parentBytes.toString('base64'), createdAt: new Date().toISOString(), approvalReference };
  validatePreflight(input, { targetTenantId, expectedParentHash });
  return input;
}
function validatePreflight(input, { targetTenantId, expectedParentHash }) {
  validateShape(input, wrapperSchema);
  if (input.targetTenantId !== targetTenantId || input.parentPackageSha256 !== expectedParentHash || !Number.isFinite(Date.parse(input.createdAt))) fail();
  const bytes = Buffer.from(input.parentPackageBase64, 'base64');
  if (bytes.toString('base64') !== input.parentPackageBase64 || hash(bytes) !== expectedParentHash) fail();
  let parent; try { parent = JSON.parse(bytes.toString('utf8')); } catch { fail(); }
  const data = adaptFormalPackage(parent, { purpose: 'PRODUCTION_PREFLIGHT' });
  const names = data.staff.map(row => row.displayName.replace(/\s+/gu, ''));
  if (names.some(name => !name) || new Set(names).size !== 23) fail();
  if (parent.staff.some(row => row.provenance.displayName.sourceId !== 'MUSUBI-2026-001')) fail();
  const departments = ['CHILDCARE', 'CHILDCARE_SUPPORT', 'FOOD_SERVICE'].map(code => data.staff.filter(row => row.departmentCode === code).length);
  if (JSON.stringify(departments) !== '[18,2,3]' || data.staff.filter(row => row.generatorEligible).length !== 20
    || data.staff.filter(row => row.isFoodService).length !== 3 || data.staff.some(row => row.isFoodService && row.generatorEligible)) fail();
  return { parent, summary: { purpose: input.purpose, targetTenantId, parentPackageSha256: expectedParentHash, expectedStaff: 23, departments,
    generatorEligible: 20, foodFixed: 3, foodRotation: 0, sourceCoverage: 'PASS', identityMapping: 'PASS', annualContracts: parent.individualContracts.length } };
}
async function productionPreflight(prisma, input, binding) {
  const validated = validatePreflight(input, binding);
  assertEnvironment({ tenantId: binding.targetTenantId, operation: 'formal-package-preflight', mode: 'PREFLIGHT', packageDigest: hash(JSON.stringify(input)) });
  return prisma.$transaction(async tx => {
    // PostgreSQL itself rejects DML, including accidental future writes in this path.
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await assertDatabaseSafety(tx, binding.targetTenantId);
    const tenant = await tx.tenant.findUnique({ where: { id: binding.targetTenantId }, select: { code: true } });
    if (!tenant || tenant.code !== validated.parent.tenantIdentity.tenantCode) fail();
    const staff = await tx.staff.count({ where: { tenantId: binding.targetTenantId } });
    if (staff !== 0) fail();
    return { ...validated.summary, expectedInserts: 23, writes: 0, readOnlyTransaction: true, adminRequired: false };
  });
}
module.exports = { derivePreflight, validatePreflight, productionPreflight, hash };
