const { PrismaClient } = require('@prisma/client');
const pkg = require('../tenant-packages/musubi/permanent-master.cjs');
const inputContract = require('../tenant-packages/musubi/formal-input-contract.json');
const { assertEnvironment, assertDatabaseSafety, recordDryRun, packageDigest } = require('./lib/production-operation-guard.cjs');
const prisma = new PrismaClient();
const tenantId = process.argv.find((value, index) => process.argv[index - 1] === '--tenant-id');
const mode = process.argv.includes('--apply') ? 'APPLY' : process.argv.includes('--verify') ? 'VERIFY' : 'DRY_RUN';
const source = { sourceType: 'TENANT_MASTER_PACKAGE', sourceReference: `musubi/permanent-master:v${pkg.schemaVersion};${pkg.sourceRegistry.matrixSourceId}`, confirmedAt: null, confirmedBy: null };

function stop(message) { throw new Error(message); }
function isolation() { if (process.env.DEPLOYMENT_ENV === 'production') return; if (process.env.TEST_DATABASE_ISOLATED !== 'true') stop('TEST_DATABASE_ISOLATED=true is required.'); const url = new URL(process.env.DATABASE_URL || ''); if (!['127.0.0.1', 'localhost'].includes(url.hostname)) stop('Only localhost isolated PostgreSQL is allowed.'); if (!/^[0-9a-f-]{36}$/i.test(tenantId || '')) stop('--tenant-id must be an explicit UUID.'); }
async function context(client = prisma) { const tenant = await client.tenant.findUnique({ where: { id: tenantId } }); if (!tenant) stop('Tenant not found.'); const staff = await client.staff.findMany({ where: { tenantId, isActive: true } }); const codes = new Set(staff.map((row) => row.employeeNumber)); const missing = pkg.staffCodes.filter((code) => !codes.has(code)); if (missing.length || staff.length !== 23) stop(`Git-external PII roster must provide exactly S001-S023 first. Missing: ${missing.join(',')}`); return { tenant, staffByCode: new Map(staff.map((row) => [row.employeeNumber, row])) }; }
function validate() { if (pkg.schemaVersion !== 1 || pkg.packageType !== 'TENANT_PERMANENT_MASTER') stop('Unsupported permanent package.'); if (new Set(pkg.staffCodes).size !== 23 || pkg.staffCodes.some((code) => !/^S\d{3}$/.test(code))) stop('Permanent package must contain 23 unique anonymous staff codes.'); if (JSON.stringify(pkg).includes('@')) stop('PII-like content is forbidden in the Git package.'); return { package: 'musubi/permanent-master', schemaVersion: pkg.schemaVersion, anonymousStaffCodes: 23, patterns: pkg.patterns.length, departments: pkg.departments.length, features: pkg.features.length, permanentRules: pkg.permanentRules.length, monthlyRecords: 0, pii: false }; }
async function apply() { await prisma.$transaction(async (tx) => {
  const priorFeature = await tx.tenantFeature.findUnique({ where: { tenantId_featureCode: { tenantId, featureCode: 'TENANT_CUSTOM_RULES' } } });
  const priorMatrixId = priorFeature?.configuration?.release1SourceProvenance?.matrixSourceId;
  if (priorMatrixId && priorMatrixId !== pkg.sourceRegistry.matrixSourceId) stop('SYSTEM_SAFETY_BLOCK:NEWER_SOURCE_MATRIX:explicit source revision required');
  if (priorMatrixId) {
    const currentP09 = await tx.workPattern.findUnique({ where: { tenantId_code: { tenantId, code: 'P09' } } });
    if (currentP09 && (currentP09.startTime !== '10:30' || currentP09.endTime !== '18:00')) stop('SYSTEM_SAFETY_BLOCK:NEWER_TENANT_P09:review changed tenant value before reapplying Matrix 039');
  }
  const { staffByCode } = await context(tx); const patterns = new Map(); const attributes = new Map();
  for (const [index, row] of pkg.patterns.entries()) { const [code, name, startTime, endTime, isWorking, countsTowardStaffing] = row; patterns.set(code, await tx.workPattern.upsert({ where: { tenantId_code: { tenantId, code } }, update: { name, shortName: name, startTime, endTime, breakMinutes: isWorking ? 60 : 0, isWorking, countsTowardStaffing, isActive: true }, create: { tenantId, code, name, shortName: name, displayOrder: index * 10, startTime, endTime, breakMinutes: isWorking ? 60 : 0, isWorking, countsTowardStaffing, isDefault: code === 'NORMAL', isSystem: ['EARLY', 'NORMAL', 'LATE', 'OFF'].includes(code) } })); }
  const departments = new Map(); for (const [index, [code, name]] of pkg.departments.entries()) departments.set(code, await tx.department.upsert({ where: { tenantId_code: { tenantId, code } }, update: { name, isActive: true }, create: { tenantId, code, name, displayOrder: index + 1 } }));
  for (const profile of pkg.staffProfiles) { const staff = staffByCode.get(profile.staffCode); await tx.staff.update({ where: { id: staff.id }, data: { assignedClass: profile.assignedClass, employmentType: profile.employmentType, canWorkEarly: profile.canWorkEarly, canWorkRegular: profile.canWorkRegular, canWorkLate: profile.canWorkLate, earlyShiftOnly: profile.earlyShiftOnly, lateShiftOnly: profile.lateShiftOnly, canWorkSaturdays: profile.canWorkSaturdays } }); await tx.staffDepartmentAssignment.updateMany({ where: { tenantId, staffId: staff.id, isActive: true }, data: { isActive: false } }); const existing = await tx.staffDepartmentAssignment.findFirst({ where: { tenantId, staffId: staff.id, departmentId: departments.get(profile.departmentCode).id } }); if (existing) await tx.staffDepartmentAssignment.update({ where: { id: existing.id }, data: { isActive: true, isPrimary: true } }); else await tx.staffDepartmentAssignment.create({ data: { tenantId, staffId: staff.id, departmentId: departments.get(profile.departmentCode).id, isPrimary: true } }); }
  for (const [index, [code, name, category]] of pkg.attributes.entries()) attributes.set(code, await tx.staffAttributeDefinition.upsert({ where: { tenantId_code: { tenantId, code } }, update: { name, category, isActive: true }, create: { tenantId, code, name, shortName: name, category, displayOrder: index, isSystem: false } }));
  for (const [attributeCode, staffCodes] of Object.entries(pkg.attributeAssignments)) { const attribute = attributes.get(attributeCode); await tx.staffAttributeAssignment.updateMany({ where: { tenantId, attributeDefinitionId: attribute.id, isActive: true }, data: { isActive: false } }); for (const staffCode of staffCodes) { const staff = staffByCode.get(staffCode); const existing = await tx.staffAttributeAssignment.findFirst({ where: { tenantId, staffId: staff.id, attributeDefinitionId: attribute.id }, orderBy: { createdAt: 'asc' } }); if (existing) await tx.staffAttributeAssignment.update({ where: { id: existing.id }, data: { isActive: true, notes: source.sourceReference } }); else await tx.staffAttributeAssignment.create({ data: { tenantId, staffId: staff.id, attributeDefinitionId: attribute.id, notes: source.sourceReference } }); } }
  await tx.tenantShiftSetting.upsert({ where: { tenantId }, update: pkg.settings, create: { tenantId, ...pkg.settings } });
  for (const [classType, weekdayRequired] of pkg.classRequirements) await tx.classStaffingRequirement.upsert({ where: { tenantId_classType: { tenantId, classType } }, update: { weekdayRequired, saturdayRequired: 0, isActive: true }, create: { tenantId, classType, weekdayRequired, saturdayRequired: 0 } });
  for (const featureCode of pkg.features) {
    const where = { tenantId_featureCode: { tenantId, featureCode } };
    const existing = await tx.tenantFeature.findUnique({ where });
    const configuration = featureCode === 'TENANT_CUSTOM_RULES' ? { ...pkg.customRules, release1SourceProvenance: { ...pkg.customRules.release1SourceProvenance, ...(existing?.configuration?.release1SourceProvenance ?? {}) } } : undefined;
    await tx.tenantFeature.upsert({ where, update: { enabled: true, source: 'TENANT_MASTER_PACKAGE', ...(configuration ? { configuration } : {}) }, create: { tenantId, featureCode, enabled: true, source: 'TENANT_MASTER_PACKAGE', ...(configuration ? { configuration } : {}) } });
  }
  for (const rule of pkg.permanentRules) { const staff = staffByCode.get(rule.staffCode); const pattern = rule.patternCode ? patterns.get(rule.patternCode) : null; const where = { tenantId, staffId: staff.id, ruleType: rule.ruleType, dayOfWeek: rule.dayOfWeek ?? null, startDate: null, endDate: null, workPatternId: pattern?.id ?? null, isActive: true }; const existing = await tx.staffWorkRule.findFirst({ where }); const data = { startTime: rule.startTime ?? null, endTime: rule.endTime ?? null, numericValue: rule.numericValue ?? null, priority: 1, isHardConstraint: true, reason: rule.reason, ...source }; if (existing) await tx.staffWorkRule.update({ where: { id: existing.id }, data }); else await tx.staffWorkRule.create({ data: { ...where, ...data } }); }
  // Individual times do not establish annual targets or effective contract dates.
  for (const [staffCode, [regularWorkStartTime, regularWorkEndTime]] of Object.entries(pkg.individualTimes)) {
    const staff = staffByCode.get(staffCode);
    await tx.staff.update({ where: { id: staff.id }, data: { regularWorkStartTime, regularWorkEndTime } });
    if (!pkg.attributeAssignments.FIXED_ASSIGNMENT.includes(staffCode)) continue;
    const where = { tenantId, staffId: staff.id, ruleType: 'AVAILABLE_TIME_RANGE', dayOfWeek: null, startDate: null, endDate: null, sourceType: 'FORMAL_SOURCE_PACKAGE', isActive: true };
    const timeCell = inputContract.staff[staffCode].regularWorkStartTime;
    const timeSource = { sourceId: timeCell.sourceIds.at(-1), matrixSourceId: inputContract.sourceId, locator: timeCell.sourceLocator, approvalStatus: 'APPROVED', decisionActorType: 'RECORDED_ADMIN_ANSWER', applicablePeriod: { from: null, to: null } };
    const data = { startTime: regularWorkStartTime, endTime: regularWorkEndTime, priority: 1, isHardConstraint: true, sourceReference: JSON.stringify(timeSource), confirmedAt: null, confirmedBy: null };
    const existing = await tx.staffWorkRule.findFirst({ where });
    if (existing) await tx.staffWorkRule.update({ where: { id: existing.id }, data });
    else await tx.staffWorkRule.create({ data: { ...where, ...data } });
  }
  // Retire only the previous package's conflicting Saturday rule, preserving its audit history.
  await tx.staffWorkRule.updateMany({ where: { tenantId, staffId: staffByCode.get('S020').id, ruleType: 'FIXED_WORK_PATTERN', dayOfWeek: 6, workPatternId: patterns.get('FIXED_S020_1715').id, sourceType: 'TENANT_MASTER_PACKAGE', isActive: true }, data: { isActive: false } });
  for (const [patternCode, requiredCount] of pkg.staffingRequirements.weekday) for (const dayOfWeek of [1, 2, 3, 4, 5]) { const code = `MUSUBI_WEEKDAY_${patternCode}_${dayOfWeek}`; await tx.shiftStaffingRequirement.upsert({ where: { tenantId_code: { tenantId, code } }, update: { name: `平日${patterns.get(patternCode).name}必要人数`, requiredCount, constraintLevel: 'HARD', isActive: true, ...source }, create: { tenantId, code, name: `平日${patterns.get(patternCode).name}必要人数`, attributeDefinitionId: attributes.get('MUSUBI_ROTATION').id, workPatternId: patterns.get(patternCode).id, dayOfWeek, requiredCount, constraintLevel: 'HARD', reason: 'むすびPermanent Master', ...source } }); }
  for (const [patternCode, requiredCount] of pkg.staffingRequirements.saturday) { const code = `MUSUBI_SATURDAY_${patternCode}`; await tx.shiftStaffingRequirement.upsert({ where: { tenantId_code: { tenantId, code } }, update: { name: `土曜${patterns.get(patternCode).name}必要人数`, requiredCount, constraintLevel: 'HARD', isActive: true, ...source }, create: { tenantId, code, name: `土曜${patterns.get(patternCode).name}必要人数`, attributeDefinitionId: attributes.get('MUSUBI_SATURDAY_ROTATION').id, workPatternId: patterns.get(patternCode).id, dayOfWeek: 6, requiredCount, constraintLevel: 'HARD', reason: 'むすびPermanent Master', ...source } }); }
  const conditional = pkg.conditionalRequirement; await tx.conditionalShiftStaffingRequirement.upsert({ where: { tenantId_code: { tenantId, code: conditional.code } }, update: { triggerCount: conditional.triggerCount, requiredCount: conditional.requiredCount, constraintLevel: 'HARD', isActive: true }, create: { tenantId, code: conditional.code, name: '指定職員⑥時のベテラン⑤', triggerAttributeDefinitionId: attributes.get(conditional.triggerAttribute).id, triggerWorkPatternId: patterns.get(conditional.triggerPattern).id, triggerCount: conditional.triggerCount, targetAttributeDefinitionId: attributes.get(conditional.targetAttribute).id, targetWorkPatternId: patterns.get(conditional.targetPattern).id, requiredCount: conditional.requiredCount, constraintLevel: 'HARD', reason: '匿名条件付き必要人数' } });
}); }
async function verifyValues() {
  const [staffRows, patternRows, ruleRows] = await Promise.all([
    prisma.staff.findMany({ where: { tenantId, isActive: true } }),
    prisma.workPattern.findMany({ where: { tenantId, isActive: true } }),
    prisma.staffWorkRule.findMany({ where: { tenantId, isActive: true } }),
  ]);
  const failures = [];
  for (const [code,,startTime,endTime,isWorking,countsTowardStaffing] of pkg.patterns) {
    const row = patternRows.find(item => item.code === code);
    if (!row || row.startTime !== startTime || row.endTime !== endTime || row.isWorking !== isWorking || row.countsTowardStaffing !== countsTowardStaffing) failures.push(`pattern:${code}`);
  }
  for (const profile of pkg.staffProfiles) {
    const row = staffRows.find(item => item.employeeNumber === profile.staffCode);
    if (!row || ['assignedClass','employmentType','canWorkEarly','canWorkRegular','canWorkLate','canWorkSaturdays','earlyShiftOnly','lateShiftOnly'].some(key => row[key] !== profile[key])) failures.push(`profile:${profile.staffCode}`);
  }
  for (const [code,[start,end]] of Object.entries(pkg.individualTimes)) {
    const staff = staffRows.find(row => row.employeeNumber === code);
    if (!staff || staff.regularWorkStartTime !== start || staff.regularWorkEndTime !== end) failures.push(`individualTime:${code}`);
    if (pkg.attributeAssignments.FIXED_ASSIGNMENT.includes(code) && !ruleRows.some(row => row.staffId === staff?.id && row.ruleType === 'AVAILABLE_TIME_RANGE' && row.sourceType === 'FORMAL_SOURCE_PACKAGE' && row.startTime === start && row.endTime === end && row.isHardConstraint)) failures.push(`approvedFixedTime:${code}`);
  }
  for (const expected of pkg.permanentRules) {
    const staff = staffRows.find(row => row.employeeNumber === expected.staffCode); const pattern = patternRows.find(row => row.code === expected.patternCode);
    if (!ruleRows.some(row => row.staffId === staff?.id && row.ruleType === expected.ruleType && row.dayOfWeek === (expected.dayOfWeek ?? null)
      && row.workPatternId === (pattern?.id ?? null) && row.numericValue === (expected.numericValue ?? null)
      && row.startTime === (expected.startTime ?? null) && row.endTime === (expected.endTime ?? null) && row.isHardConstraint)) failures.push(`rule:${expected.staffCode}:${expected.ruleType}`);
  }
  return { pass: failures.length === 0, failures };
}
async function verify() { const values = await verifyValues(); const [staff, patterns, departments, features, rules, contracts, requirements, conditional, events, exceptions] = await Promise.all([prisma.staff.count({ where: { tenantId, isActive: true } }), prisma.workPattern.count({ where: { tenantId, code: { in: pkg.patterns.map((row) => row[0]) }, isActive: true } }), prisma.department.count({ where: { tenantId, code: { in: pkg.departments.map((row) => row[0]) }, isActive: true } }), prisma.tenantFeature.count({ where: { tenantId, featureCode: { in: pkg.features }, enabled: true } }), prisma.staffWorkRule.count({ where: { tenantId, isActive: true, sourceType: 'TENANT_MASTER_PACKAGE' } }), prisma.staffWorkContract.count({ where: { tenantId, voidedAt: null, sourceType: 'TENANT_MASTER_PACKAGE' } }), prisma.shiftStaffingRequirement.count({ where: { tenantId, isActive: true, sourceType: 'TENANT_MASTER_PACKAGE' } }), prisma.conditionalShiftStaffingRequirement.count({ where: { tenantId, code: pkg.conditionalRequirement.code, isActive: true } }), prisma.tenantEvent.count({ where: { tenantId } }), prisma.tenantRuleException.count({ where: { tenantId } })]); const result = { values, pass: values.pass && staff === 23 && patterns === pkg.patterns.length && departments === pkg.departments.length && features === pkg.features.length && rules === pkg.permanentRules.length && contracts === 0 && requirements === 33 && conditional === 1, staff, patterns, departments, features, permanentRules: rules, fixedContracts: contracts, staffingRequirements: requirements, conditionalRequirements: conditional, monthlyRecordsUntouched: { events, exceptions } }; process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.pass) process.exitCode = 1; }
async function main() { isolation(); const operation='permanent-master'; const guard=assertEnvironment({tenantId,operation,mode,packageDigest:packageDigest(pkg)}); await assertDatabaseSafety(prisma,tenantId); const summary = validate(); await context(); process.stdout.write(`${JSON.stringify({ mode, ...summary }, null, 2)}\n`); if (mode === 'DRY_RUN') recordDryRun(operation,tenantId,guard); if (mode === 'APPLY') await apply(); if (mode !== 'DRY_RUN') await verify(); }
if (require.main === module) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }).finally(() => prisma.$disconnect());

module.exports = { validate };
