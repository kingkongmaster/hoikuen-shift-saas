const assert = require('node:assert/strict');
const { randomUUID, scryptSync } = require('node:crypto');
const { AssignedClass, EmploymentType, MembershipRole, PrismaClient, StaffingConstraintLevel, SubscriptionPlan, SubscriptionStatus, ShiftType } = require('@prisma/client');
const prisma = new PrismaClient(); const base = process.env.API_BASE_URL || 'http://127.0.0.1:18083/api';
let tenantId;
const hash = (password) => { const salt = randomUUID().replaceAll('-', ''); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
async function call(path, init = {}, token) { const response = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } }); return { status: response.status, body: await response.json().catch(() => null) }; }
async function main() {
  const run = randomUUID().slice(0, 8); const password = `Sprint6-${run}!`;
  const tenant = await prisma.tenant.create({ data: { name: `Sprint6隔離園-${run}` } }); tenantId = tenant.id;
  await prisma.tenantSubscription.create({ data: { tenantId, plan: SubscriptionPlan.PROFESSIONAL, status: SubscriptionStatus.ACTIVE } });
  const admin = await prisma.user.create({ data: { email: `sprint6-${run}@e2e.local`, displayName: 'Sprint6管理者', passwordHash: hash(password) } });
  await prisma.membership.create({ data: { tenantId, userId: admin.id, role: MembershipRole.ADMIN } });
  const plain = await prisma.staff.create({ data: { tenantId, employeeNumber: 'S6-001', displayName: '一般候補', assignedClass: AssignedClass.AGE_0, employmentType: EmploymentType.FULL_TIME } });
  const qualified = await prisma.staff.create({ data: { tenantId, employeeNumber: 'S6-002', displayName: '属性候補', assignedClass: AssignedClass.AGE_0, employmentType: EmploymentType.FULL_TIME } });
  await prisma.tenantShiftSetting.create({ data: { tenantId, weekdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayEarlyRequired: 0, saturdayLateRequired: 0, saturdayMinimumStaff: 1, saturdayOperationEnabled: true, sundayOperationEnabled: false } });
  await prisma.classStaffingRequirement.create({ data: { tenantId, classType: AssignedClass.AGE_0, weekdayRequired: 1, saturdayRequired: 1 } });
  await prisma.tenantFeature.create({ data: { tenantId, featureCode: 'ADVANCED_STAFFING_REQUIREMENTS', enabled: false, source: 'PLAN_OVERRIDE' } });
  const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: admin.email, password }) }); assert.equal(login.status, 200); const token = login.body.accessToken;
  const schedule = await prisma.monthlyShift.create({ data: { tenantId, targetMonth: new Date('2035-01-01T00:00:00.000Z'), createdByUserId: admin.id } });
  let generated = await call(`/shifts/${schedule.id}/generate`, { method: 'POST' }, token); assert.equal(generated.status, 201); assert.equal('staffingRequirementEvaluations' in generated.body, false, 'Feature OFFはoptional項目なし');
  const baseline = await prisma.shiftAssignment.findMany({ where: { monthlyShiftId: schedule.id }, select: { staffId: true, workDate: true, shiftType: true, assignedClass: true }, orderBy: [{ workDate: 'asc' }, { staffId: 'asc' }] });
  await prisma.tenantFeature.update({ where: { tenantId_featureCode: { tenantId, featureCode: 'ADVANCED_STAFFING_REQUIREMENTS' } }, data: { enabled: true } });
  generated = await call(`/shifts/${schedule.id}/generate`, { method: 'POST' }, token); assert.equal(generated.status, 201); assert.equal('staffingRequirementEvaluations' in generated.body, false, 'Feature ON・条件0件はoptional項目なし');
  const unchanged = await prisma.shiftAssignment.findMany({ where: { monthlyShiftId: schedule.id }, select: { staffId: true, workDate: true, shiftType: true, assignedClass: true }, orderBy: [{ workDate: 'asc' }, { staffId: 'asc' }] }); assert.deepEqual(unchanged, baseline, '条件0件の割当不変');
  const hardDef = await prisma.staffAttributeDefinition.create({ data: { tenantId, code: 'S6_HARD', name: '資格者', category: 'QUALIFICATION' } });
  const softDef = await prisma.staffAttributeDefinition.create({ data: { tenantId, code: 'S6_SOFT', name: '経験者', category: 'SKILL' } });
  const infoDef = await prisma.staffAttributeDefinition.create({ data: { tenantId, code: 'S6_INFO', name: '担当者', category: 'ASSIGNMENT' } });
  await prisma.staffAttributeAssignment.create({ data: { tenantId, staffId: qualified.id, attributeDefinitionId: hardDef.id, startDate: new Date('2035-01-01T00:00:00.000Z'), endDate: new Date('2035-01-31T00:00:00.000Z') } });
  await prisma.staffAttributeAssignment.create({ data: { tenantId, staffId: plain.id, attributeDefinitionId: softDef.id, isActive: false } });
  await prisma.shiftStaffingRequirement.createMany({ data: [
    { tenantId, code: 'S6-HARD', name: '資格者', attributeDefinitionId: hardDef.id, classType: AssignedClass.AGE_0, dayOfWeek: 6, startDate: new Date('2035-01-06T00:00:00.000Z'), endDate: new Date('2035-01-06T00:00:00.000Z'), requiredCount: 1, constraintLevel: StaffingConstraintLevel.HARD },
    { tenantId, code: 'S6-SOFT', name: '経験者', attributeDefinitionId: softDef.id, classType: null, dayOfWeek: 6, startDate: new Date('2035-01-13T00:00:00.000Z'), endDate: new Date('2035-01-13T00:00:00.000Z'), requiredCount: 1, constraintLevel: StaffingConstraintLevel.SOFT },
    { tenantId, code: 'S6-INFO', name: '担当者', attributeDefinitionId: infoDef.id, classType: null, dayOfWeek: 6, startDate: new Date('2035-01-13T00:00:00.000Z'), endDate: new Date('2035-01-13T00:00:00.000Z'), requiredCount: 1, constraintLevel: StaffingConstraintLevel.INFO },
  ] });
  generated = await call(`/shifts/${schedule.id}/generate`, { method: 'POST' }, token); assert.equal(generated.status, 201); assert.ok(generated.body.staffingRequirementEvaluations.length > 0);
  const hard = generated.body.staffingRequirementEvaluations.filter((item) => item.code === 'S6-HARD'); assert.ok(hard.every((item) => item.isSatisfied)); assert.ok(hard.every((item) => item.matchedStaffIds.includes(qualified.id))); assert.ok(hard.every((item) => item.classType === AssignedClass.AGE_0));
  const soft = generated.body.staffingRequirementEvaluations.filter((item) => item.code === 'S6-SOFT'); assert.ok(soft.every((item) => !item.isSatisfied && item.level === 'WARNING'));
  const info = generated.body.staffingRequirementEvaluations.filter((item) => item.code === 'S6-INFO'); assert.ok(info.every((item) => item.level === 'INFO'));
  assert.ok(generated.body.warnings.some((item) => item.code === 'STAFFING_REQUIREMENT_SOFT')); assert.ok(!generated.body.warnings.some((item) => item.code === 'STAFFING_REQUIREMENT_HARD'));
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, action: 'SHIFT_GENERATED' }, orderBy: { createdAt: 'desc' } }); assert.equal(audit.detail.staffingRequirementSummary.conditionCount, 3); assert.ok(!JSON.stringify(audit.detail).includes(qualified.id), 'AuditLogへ職員詳細を保存しない');
  assert.equal((await call(`/shifts/${schedule.id}/generate`, { method: 'POST' })).status, 401, '既存認証を維持');
  console.log('Staffing requirement generator API integration tests: PASS (Feature, priority, evaluation, isolation filters, audit)');
}
main().finally(async () => { if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined); await prisma.$disconnect(); }).catch((error) => { console.error(error); process.exitCode = 1; });
