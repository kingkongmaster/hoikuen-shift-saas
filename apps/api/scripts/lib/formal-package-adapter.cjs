const { isDeepStrictEqual: equal } = require('node:util');
const schema = require('../../tenant-packages/musubi/formal-package.schema.json');
const master = require('../../tenant-packages/musubi/permanent-master.cjs');
const contract = require('../../tenant-packages/musubi/formal-input-contract.json');
const fail = (path, reason) => { throw new Error(`SYSTEM_SAFETY_BLOCK:FORMAL_PACKAGE:${path}:${reason}`); };
const sections = ['departmentAssignments', 'generatorEligibility', 'workPatterns', 'individualContracts', 'fixedRules', 'staffingRequirements', 'tenantFeatureSettings', 'provisionalValues', 'deferredValues'];
const aliases = { employeeNumber: 'anonymousStaffId', isActive: 'active', departmentCode: 'department', canWorkSaturdays: 'saturdayAvailability' };

// Deliberately limited to the checked-in schema vocabulary; no coercion, defaults or value logging.
function validateShape(value, rule, path = 'package') {
  const annotations = ['$schema', '$id', '$comment', 'title', 'description'];
  const supported = [...annotations, 'type', 'const', 'enum', 'required', 'properties', 'additionalProperties', 'minProperties', 'items', 'minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'pattern', 'format'];
  for (const key of Object.keys(rule)) if (!supported.includes(key)) fail(path, 'unsupported schema keyword');
  const isType = type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'object' ? !!value && typeof value === 'object' && !Array.isArray(value) : type === 'integer' ? Number.isInteger(value) : typeof value === type;
  if (rule.type && ![].concat(rule.type).some(isType)) fail(path, 'type');
  if ('const' in rule && !equal(value, rule.const)) fail(path, 'const');
  if (rule.enum && !rule.enum.some(item => equal(item, value))) fail(path, 'enum');
  if (typeof value === 'string') {
    if (rule.minLength != null && value.trim().length < rule.minLength) fail(path, 'empty');
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail(path, 'format');
    if (rule.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail(path, 'UUID');
    if (rule.format === 'uri') { try { new URL(value); } catch { fail(path, 'URI'); } }
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || (rule.minimum != null && value < rule.minimum) || (rule.maximum != null && value > rule.maximum))) fail(path, 'range');
  if (Array.isArray(value)) {
    if ((rule.minItems != null && value.length < rule.minItems) || (rule.maxItems != null && value.length > rule.maxItems)) fail(path, 'count');
    if (rule.items) value.forEach((item, index) => validateShape(item, rule.items, `${path}[${index}]`));
  } else if (value && typeof value === 'object') {
    if (rule.minProperties && Object.keys(value).length < rule.minProperties) fail(path, 'empty object');
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) fail(path, `missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (rule.properties?.[key]) validateShape(item, rule.properties[key], `${path}.${key}`);
      else if (rule.additionalProperties === false) fail(path, 'unknown field');
      else if (typeof rule.additionalProperties === 'object') validateShape(item, rule.additionalProperties, `${path}.*`);
    }
  }
}

function valueStatus(cell) { return cell.value && typeof cell.value === 'object' && cell.value.formalContractAvailability === null && cell.value.candidate === true ? 'RELEASE1_OPERATIONAL_DEFAULT' : cell.approvalStatus; }

function expectedStaff(code) {
  const fields = contract.staff[code]; const result = {};
  for (const key of schema.properties.staff.items.required.filter(key => !['displayName', 'provenance'].includes(key))) {
    const cell = fields[aliases[key] ?? key];
    result[key] = key === 'canWorkSaturdays' ? cell.value.importerCanWorkSaturdays : cell.value;
  }
  return result;
}

function canonicalSections() {
  return structuredClone({
    departmentAssignments: master.staffProfiles.map(row => ({ staffCode: row.staffCode, departmentCode: row.departmentCode })),
    generatorEligibility: master.staffCodes.map(staffCode => ({ staffCode, generatorEligible: !master.attributeAssignments.GENERATOR_EXCLUDED.includes(staffCode) })),
    workPatterns: master.patterns,
    individualContracts: [], // No annual contract is established by Matrix 039.
    fixedRules: master.permanentRules,
    staffingRequirements: [{ ...master.staffingRequirements, conditional: master.conditionalRequirement }],
    tenantFeatureSettings: [{ settings: master.settings, customRules: master.customRules, attributes: master.attributeAssignments, classRequirements: master.classRequirements }],
    provisionalValues: [{ code: 'P09', startTime: '10:30', endTime: '18:00' }, ...master.customRules.release1ProvisionalSoftRules],
    deferredValues: [{ field: 'annualTargetMinutes', value: null }, { field: 'paidLeaveBalances', value: null }, { field: 'P02UnidentifiedSoftRequest', value: null }],
  });
}

function adaptFormalPackage(input, { adminEmployeeNumber } = {}) {
  validateShape(input, schema);
  const refs = new Map(input.sourceRegistryReferences.map(row => [row.sourceId, row]));
  if (refs.size !== input.sourceRegistryReferences.length || refs.get(contract.sourceId)?.sha256 !== contract.sha256) fail('sourceRegistryReferences', 'Matrix 039 hash missing or mismatched');
  if (!input.tenantIdentity.tenantId) fail('tenantIdentity', 'explicit tenant UUID required');
  if (!master.staffCodes.includes(adminEmployeeNumber)) fail('adminEmployeeNumber', 'explicit administrator linkage required');
  if (input.tenantIdentity.environment === 'PRODUCTION' && (!input.productionApproval.approved || !input.productionApproval.reference?.trim())) fail('productionApproval', 'separate approval required');
  const provenance = (source, path) => {
    if (!refs.has(source.sourceId)) fail(path, 'unregistered source');
    if (source.approvalStatus === 'DERIVED' && (!source.approvedParents?.length || source.approvedParents.some(id => !refs.has(id)))) fail(path, 'approved parents missing');
    if (source.effectiveFrom && source.effectiveTo && source.effectiveFrom > source.effectiveTo) fail(path, 'invalid period');
    if (['MUSUBI-2026-036', 'MUSUBI-2026-037', 'MUSUBI-2026-038'].includes(source.sourceId) && source.approvalAuthority !== 'USER_PRODUCT_OWNER_DECISION') fail(path, 'user decision is not administrator approval');
    if (source.approvalStatus.includes('PROVISIONAL') || source.approvalStatus === 'RELEASE1_OPERATIONAL_DEFAULT') {
      if (source.approvalAuthority !== 'USER_PRODUCT_OWNER_DECISION') fail(path, 'provisional/default cannot claim admin approval');
    }
    return { sourceId: source.sourceId, sourceLocator: source.locator, approvalStatus: source.approvalStatus, decisionActorType: source.approvalAuthority,
      applicablePeriod: { from: source.effectiveFrom ?? null, to: source.effectiveTo ?? null }, approvedParents: source.approvedParents ?? [] };
  };
  const codes = new Set(); const fieldSources = {};
  const staff = input.staff.map((row, index) => {
    const code = row.employeeNumber; if (codes.has(code)) fail(`staff[${index}]`, 'duplicate ID'); codes.add(code);
    const expected = expectedStaff(code); fieldSources[code] = {};
    for (const [key, value] of Object.entries(expected)) {
      if (!equal(row[key], value)) fail(`staff[${index}].${key}`, 'differs from Matrix 039; explicit contract revision required');
      const cell = contract.staff[code][aliases[key] ?? key];
      // Unset optional values are intentionally preserved, never completed by AI.
      if (value === null && cell.requiredClass !== 'REQUIRED_FOR_GENERATION') continue;
      const source = row.provenance[key]; if (!source) fail(`staff[${index}].${key}`, 'source missing');
      if (source.approvalStatus !== valueStatus(cell) || !cell.sourceIds.includes(source.sourceId)) fail(`staff[${index}].${key}`, 'source scope/status mismatch');
      if (source.approvalStatus === 'DERIVED' && !equal([...(source.approvedParents ?? [])].sort(), [...cell.approvedParentSourceIds].sort())) fail(`staff[${index}].${key}`, 'approved parent scope mismatch');
      fieldSources[code][key] = provenance(source, `staff[${index}].${key}`);
    }
    if (!row.provenance.displayName) fail(`staff[${index}].displayName`, 'source missing');
    fieldSources[code].displayName = provenance(row.provenance.displayName, `staff[${index}].displayName`);
    const { provenance: _, isActive: __, ...dto } = row;
    return { ...dto, departmentName: master.departments.find(item => item[0] === row.departmentCode)[1] };
  });
  const sectionSources = {};
  for (const [section, expected] of Object.entries(canonicalSections())) {
    if (!equal(input[section].map(row => row.value), expected)) fail(section, 'differs from canonical Matrix 039 mapping');
    sectionSources[section] = input[section].map((row, index) => provenance(row.provenance, `${section}[${index}]`));
  }
  input.workPatterns.forEach(row => { if (row.value[0] === 'P09' && row.provenance.approvalStatus !== 'PROVISIONAL_PENDING_ADMIN_CONFIRMATION') fail('P09', 'provisional status required'); });
  input.provisionalValues.forEach((row, index) => {
    const expected = index === 0 ? 'PROVISIONAL_PENDING_ADMIN_CONFIRMATION' : 'PROVISIONAL_SOFT_PENDING_ADMIN_CONFIRMATION';
    if (row.provenance.approvalStatus !== expected) fail('provisionalValues', 'provisional status required');
  });
  return { schemaVersion: 1, packageType: 'MUSUBI_BETA_STAFF_IMPORT', tenantId: input.tenantIdentity.tenantId,
    productionUseApproved: input.tenantIdentity.environment === 'PRODUCTION' && input.productionApproval.approved,
    isolatedValidationOnly: input.tenantIdentity.environment === 'ISOLATED_DRY_RUN', adminEmployeeNumber,
    expectedDisplayedStaff: 23, expectedGeneratorEligible: 20, expectedFoodService: 3, staff,
    formalSourceProvenance: { matrixSourceId: contract.sourceId, matrixSha256: contract.sha256, fieldSources, sectionSources,
      matrixFields: contract.staff, globalInputs: contract.globalInputs, productionApproval: input.productionApproval } };
}

module.exports = { valueStatus, adaptFormalPackage, validateShape, expectedStaff, canonicalSections, contract, schema };
