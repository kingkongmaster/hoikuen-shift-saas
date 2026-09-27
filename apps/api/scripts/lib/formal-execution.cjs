const { adaptFormalPackage } = require('./formal-package-adapter.cjs');
const { validatePreflight, hash } = require('./formal-preflight.cjs');
const { assertEnvironment, assertDatabaseSafety } = require('./production-operation-guard.cjs');
const TYPE = 'MUSUBI_FORMAL_EXECUTION_INPUT';
function fail() { throw new Error('SYSTEM_SAFETY_BLOCK:FORMAL_EXECUTION:invalid binding or admin link mode'); }
function validateExecution(input, binding) {
  if (input.packageType !== TYPE || input.purpose !== 'FORMAL_IMPORT' || !['DEFERRED', 'LINKED'].includes(input.adminLinkMode)) fail();
  if (input.adminLinkMode === 'DEFERRED' && Object.hasOwn(input, 'adminEmployeeNumber')) fail();
  if (input.adminLinkMode === 'LINKED' && !/^S(00[1-9]|01[0-9]|02[0-3])$/.test(input.adminEmployeeNumber || '')) fail();
  const { adminLinkMode, adminEmployeeNumber, ...wrapper } = input;
  // Reuse exact-byte parent, identity, source and Matrix 039 validation. Unknown fields still fail.
  const validated = validatePreflight({ ...wrapper, packageType: 'MUSUBI_PRODUCTION_PREFLIGHT_INPUT', purpose: 'PRODUCTION_PREFLIGHT' }, binding);
  const data = adaptFormalPackage(validated.parent, { adminLinkMode, adminEmployeeNumber });
  data.tenantId = input.targetTenantId;
  data.productionUseApproved = true;
  data.isolatedValidationOnly = false;
  data.formalSourceProvenance.productionApproval = { approved: true, reference: input.approvalReference };
  data.formalSourceProvenance.execution = { adminLinkMode, parentPackageSha256: input.parentPackageSha256, approvalReference: input.approvalReference };
  return { data, parent: validated.parent, summary: { ...validated.summary, purpose: 'FORMAL_IMPORT', adminLinkMode, adminStaffLinkPending: adminLinkMode === 'DEFERRED' } };
}
function deriveExecution(parentBytes, { targetTenantId, expectedParentHash, approvalReference, adminLinkMode, adminEmployeeNumber }) {
  const input = { packageType: TYPE, purpose: 'FORMAL_IMPORT', targetEnvironment: 'PRODUCTION', targetTenantId,
    parentPackageSha256: expectedParentHash, parentPackageBase64: parentBytes.toString('base64'), createdAt: new Date().toISOString(), approvalReference,
    adminLinkMode, ...(adminEmployeeNumber !== undefined ? { adminEmployeeNumber } : {}) };
  validateExecution(input, { targetTenantId, expectedParentHash });
  return input;
}
async function executionPreflight(prisma, input, binding) {
  const validated = validateExecution(input, binding);
  assertEnvironment({ tenantId: binding.targetTenantId, operation: 'formal-execution-preflight', mode: 'PREFLIGHT', packageDigest: hash(JSON.stringify(input)), adminLinkMode: input.adminLinkMode });
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await assertDatabaseSafety(tx, binding.targetTenantId);
    const tenant = await tx.tenant.findUnique({ where: { id: binding.targetTenantId }, select: { code: true } });
    if (!tenant || tenant.code !== validated.parent.tenantIdentity.tenantCode) fail();
    const admins = await tx.membership.findMany({ where: { tenantId: binding.targetTenantId, role: 'ADMIN', isActive: true }, select: { user: { select: { isActive: true } } } });
    if (admins.length !== 1 || !admins[0].user.isActive || await tx.staff.count({ where: { tenantId: binding.targetTenantId } }) !== 0) fail();
    return { ...validated.summary, writes: 0, readOnlyTransaction: true, adminRequired: true, activeAdministrators: 1, currentStaffLinks: 0, expectedStaffLinks: input.adminLinkMode === 'DEFERRED' ? 0 : 1 };
  });
}
module.exports = { TYPE, deriveExecution, validateExecution, executionPreflight };
