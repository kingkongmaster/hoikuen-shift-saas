const assert = require('node:assert/strict');
const { randomUUID, scryptSync } = require('node:crypto');
const { AssignedClass, EmploymentType, MembershipRole, PrismaClient, StaffWorkRuleType, SubscriptionPlan, SubscriptionStatus, ShiftType } = require('@prisma/client');

const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://127.0.0.1:18080/api';
let tenantId;
let featureFailurePolicyEnabled = false;
const hash = (password) => { const salt = randomUUID().replaceAll('-', ''); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
async function call(path, init = {}, token) { const response = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } }); return { status: response.status, body: await response.json().catch(() => null) }; }
const assignmentView = (scheduleId) => prisma.shiftAssignment.findMany({ where: { monthlyShiftId: scheduleId }, select: { staffId: true, workDate: true, shiftType: true, workPatternId: true, startTime: true, endTime: true }, orderBy: [{ workDate: 'asc' }, { staffId: 'asc' }] });

async function main() {
  const run = randomUUID().slice(0, 8);
  const password = `WorkRule-${run}!`;
  const tenant = await prisma.tenant.create({ data: { name: `個別勤務ルール隔離園-${run}` } });
  tenantId = tenant.id;
  await prisma.tenantSubscription.create({ data: { tenantId, plan: SubscriptionPlan.PROFESSIONAL, status: SubscriptionStatus.ACTIVE } });
  const admin = await prisma.user.create({ data: { email: `work-rule-${run}@e2e.local`, displayName: '管理者', passwordHash: hash(password) } });
  await prisma.membership.create({ data: { tenantId, userId: admin.id, role: MembershipRole.ADMIN } });
  const first = await prisma.staff.create({ data: { tenantId, employeeNumber: 'WR-001', displayName: '候補1', assignedClass: AssignedClass.AGE_0, employmentType: EmploymentType.FULL_TIME } });
  const second = await prisma.staff.create({ data: { tenantId, employeeNumber: 'WR-002', displayName: '候補2', assignedClass: AssignedClass.AGE_0, employmentType: EmploymentType.FULL_TIME } });
  await prisma.tenantShiftSetting.create({ data: { tenantId, weekdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayEarlyRequired: 0, saturdayLateRequired: 0, saturdayMinimumStaff: 0, saturdayOperationEnabled: false, sundayOperationEnabled: false, maxConsecutiveWorkDays: 31 } });
  await prisma.classStaffingRequirement.create({ data: { tenantId, classType: AssignedClass.AGE_0, weekdayRequired: 1, saturdayRequired: 0 } });
  await prisma.tenantFeature.create({ data: { tenantId, featureCode: 'STAFF_WORK_RULES', enabled: false, source: 'PLAN_OVERRIDE' } });
  const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: admin.email, password }) });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;
  const schedule = await prisma.monthlyShift.create({ data: { tenantId, targetMonth: new Date('2035-01-01T00:00:00Z'), createdByUserId: admin.id } });

  let generated = await call(`/shifts/${schedule.id}/generate`, { method: 'POST' }, token);
  assert.equal(generated.status, 201);
  const baseline = await assignmentView(schedule.id);

  await prisma.tenantFeature.update({ where: { tenantId_featureCode: { tenantId, featureCode: 'STAFF_WORK_RULES' } }, data: { enabled: true } });
  generated = await call(`/shifts/${schedule.id}/generate`, { method: 'POST' }, token);
  assert.equal(generated.status, 201);
  assert.deepEqual(await assignmentView(schedule.id), baseline, 'Feature ON・条件0件は従来割当不変');

  const normal = await prisma.workPattern.findFirstOrThrow({ where: { tenantId, code: 'NORMAL', isSystem: true } });
  const early = await prisma.workPattern.findFirstOrThrow({ where: { tenantId, code: 'EARLY', isSystem: true } });
  const fixed = await prisma.staffWorkRule.create({ data: { tenantId, staffId: second.id, ruleType: StaffWorkRuleType.FIXED_WORK_PATTERN, workPatternId: normal.id, startDate: new Date('2035-01-01T00:00:00Z'), endDate: new Date('2035-01-01T00:00:00Z'), priority: 10 } });
  const allowed = await prisma.staffWorkRule.create({ data: { tenantId, staffId: second.id, ruleType: StaffWorkRuleType.AVAILABLE_WORK_PATTERN, workPatternId: early.id, dayOfWeek: 1, priority: 20 } });
  generated = await call(`/shifts/${schedule.id}/generate`, { method: 'POST' }, token);
  assert.equal(generated.status, 201, 'FIXEDとALLOWED不一致でも生成継続');
  let row = await prisma.shiftAssignment.findFirstOrThrow({ where: { monthlyShiftId: schedule.id, staffId: second.id, workDate: new Date('2035-01-01T00:00:00Z') } });
  assert.equal(row.shiftType, ShiftType.NORMAL, 'ALLOWEDよりFIXEDを優先');
  assert.equal(row.workPatternId, normal.id);

  const prohibited = await prisma.staffWorkRule.create({ data: { tenantId, staffId: second.id, ruleType: StaffWorkRuleType.UNAVAILABLE_WORK_PATTERN, workPatternId: normal.id, startDate: new Date('2035-01-01T00:00:00Z'), endDate: new Date('2035-01-01T00:00:00Z'), priority: 1 } });
  generated = await call(`/shifts/${schedule.id}/generate`, { method: 'POST' }, token);
  assert.equal(generated.status, 201, 'PROHIBITED競合でも生成処理は成功');
  assert.ok(generated.body.warnings.some((item) => item.code === 'STAFF_WORK_RULE_FIXED_PROHIBITED' && item.level === 'ERROR'));
  row = await prisma.shiftAssignment.findFirstOrThrow({ where: { monthlyShiftId: schedule.id, staffId: second.id, workDate: new Date('2035-01-01T00:00:00Z') } });
  assert.equal(row.shiftType, ShiftType.OFF, 'PROHIBITEDをFIXEDより優先');
  const replacement = await prisma.shiftAssignment.findFirstOrThrow({ where: { monthlyShiftId: schedule.id, staffId: first.id, workDate: new Date('2035-01-01T00:00:00Z') } });
  assert.equal(replacement.shiftType, ShiftType.NORMAL, '他候補で勤務を補完');
  let audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, action: 'SHIFT_GENERATED' }, orderBy: { createdAt: 'desc' } });
  assert.equal(audit.detail.staffWorkRuleSummary.ruleCount, 3);
  assert.equal(audit.detail.staffWorkRuleSummary.fixedBlockedCount, 1);
  assert.ok(!JSON.stringify(audit.detail).includes(second.id), 'AuditLogは件数サマリのみ');

  await prisma.staffWorkRule.updateMany({ where: { id: { in: [fixed.id, allowed.id, prohibited.id] } }, data: { isActive: false } });
  await prisma.$executeRawUnsafe(`CREATE FUNCTION pg_temp.fail_staff_work_rule_feature(value text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN IF value = 'STAFF_WORK_RULES' THEN RAISE EXCEPTION 'simulated feature lookup failure'; END IF; RETURN true; END $$`);
  await prisma.$executeRawUnsafe('ALTER TABLE "TenantFeature" ENABLE ROW LEVEL SECURITY');
  await prisma.$executeRawUnsafe('ALTER TABLE "TenantFeature" FORCE ROW LEVEL SECURITY');
  await prisma.$executeRawUnsafe('CREATE POLICY "staff_work_rule_feature_failure_test" ON "TenantFeature" USING (pg_temp.fail_staff_work_rule_feature("featureCode"))');
  featureFailurePolicyEnabled = true;
  generated = await call(`/shifts/${schedule.id}/generate`, { method: 'POST' }, token);
  await prisma.$executeRawUnsafe('DROP POLICY "staff_work_rule_feature_failure_test" ON "TenantFeature"');
  await prisma.$executeRawUnsafe('ALTER TABLE "TenantFeature" NO FORCE ROW LEVEL SECURITY');
  await prisma.$executeRawUnsafe('ALTER TABLE "TenantFeature" DISABLE ROW LEVEL SECURITY');
  featureFailurePolicyEnabled = false;
  assert.equal(generated.status, 201, 'Feature取得失敗でも生成継続');
  assert.ok(generated.body.warnings.some((item) => item.code === 'STAFF_WORK_RULE_FEATURE_LOOKUP_FAILED' && item.level === 'WARNING'), '管理者向けWARNINGを返す');
  assert.deepEqual(await assignmentView(schedule.id), baseline, 'Feature取得失敗時も勤務割当結果は従来方式と同一');
  audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, action: 'SHIFT_GENERATED' }, orderBy: { createdAt: 'desc' } });
  assert.equal(audit.detail.staffWorkRuleSummary.featureLookupFailed, true, 'AuditLogへフォールバック種別を要約');
  assert.equal(audit.detail.staffWorkRuleSummary.ruleCount, 0);

  console.log('StaffWorkRule generator API integration tests: PASS (Feature OFF/failure, fixed/allowed/prohibited priority, persistence, audit)');
}

main()
  .finally(async () => {
    if (featureFailurePolicyEnabled) {
      await prisma.$executeRawUnsafe('DROP POLICY IF EXISTS "staff_work_rule_feature_failure_test" ON "TenantFeature"').catch(() => {});
      await prisma.$executeRawUnsafe('ALTER TABLE "TenantFeature" NO FORCE ROW LEVEL SECURITY').catch(() => {});
      await prisma.$executeRawUnsafe('ALTER TABLE "TenantFeature" DISABLE ROW LEVEL SECURITY').catch(() => {});
    }
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    await prisma.$disconnect();
  })
  .catch((error) => { console.error(error); process.exitCode = 1; });
