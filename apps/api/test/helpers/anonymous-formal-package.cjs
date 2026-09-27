const { valueStatus, expectedStaff, canonicalSections, contract } = require('../../scripts/lib/formal-package-adapter.cjs');
const source = (sourceId = 'MUSUBI-2026-039', approvalStatus = 'DERIVED', locator = 'anonymous test fixture / Matrix 039') => ({ sourceId, approvalStatus, locator,
  approvalAuthority: ['MUSUBI-2026-036', 'MUSUBI-2026-037', 'MUSUBI-2026-038'].includes(sourceId) ? 'USER_PRODUCT_OWNER_DECISION' : 'APPROVED_ITEM_SCOPE',
  ...(approvalStatus === 'DERIVED' ? { approvedParents: ['MUSUBI-2026-036'] } : {}) });
function anonymousFormalPackage(tenantId = '11111111-1111-4111-8111-111111111111') {
  const refs = ['001','031','032','035','036','037','038','039'].map(suffix => ({ sourceId: `MUSUBI-2026-${suffix}`, notionUrl: `https://www.notion.so/anonymous-test-${suffix}`, approvalScope: 'ANONYMOUS_TEST_ONLY', ...(suffix === '039' ? { sha256: contract.sha256 } : {}) }));
  const staff = Object.keys(contract.staff).map(code => {
    const row = { ...expectedStaff(code), displayName: `Anonymous ${code}` }; const provenance = {};
    for (const key of Object.keys(row)) {
      if (key === 'displayName') { provenance[key] = source('MUSUBI-2026-039'); continue; }
      const alias = { employeeNumber: 'anonymousStaffId', isActive: 'active', departmentCode: 'department', canWorkSaturdays: 'saturdayAvailability' };
      const cell = contract.staff[code][alias[key] ?? key];
      // Optional nulls are not asserted as approved values.
      if (row[key] === null && cell.requiredClass !== 'REQUIRED_FOR_GENERATION') continue;
      provenance[key] = source(cell.sourceIds.at(-1), valueStatus(cell), cell.sourceLocator);
      if (cell.approvalStatus === 'DERIVED') provenance[key].approvedParents = cell.approvedParentSourceIds;
    }
    return { ...row, provenance };
  });
  const input = { packageVersion: 1, packageType: 'MUSUBI_FORMAL_INPUT_PACKAGE', tenantIdentity: { tenantCode: 'musubi-nursery', tenantId, environment: 'ISOLATED_DRY_RUN' },
    sourceRegistryReferences: refs, staff, productionApproval: { approved: false, reference: null } };
  for (const [section, values] of Object.entries(canonicalSections())) input[section] = values.map((value, index) => ({ value,
    provenance: section === 'provisionalValues' ? source(index === 0 ? 'MUSUBI-2026-036' : 'MUSUBI-2026-038', index === 0 ? 'PROVISIONAL_PENDING_ADMIN_CONFIRMATION' : 'PROVISIONAL_SOFT_PENDING_ADMIN_CONFIRMATION')
      : section === 'workPatterns' && value[0] === 'P09' ? source('MUSUBI-2026-036', 'PROVISIONAL_PENDING_ADMIN_CONFIRMATION') : source() }));
  return input;
}
module.exports = { anonymousFormalPackage };
