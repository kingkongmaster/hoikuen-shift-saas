const assert = require('node:assert/strict');
const { randomUUID, scryptSync } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { resolveIsolatedDatabaseUrl, resolveLocalApiBaseUrl } = require('./helpers/isolated-database.cjs');

const prisma = new PrismaClient({ datasourceUrl: resolveIsolatedDatabaseUrl() });
const baseUrl = resolveLocalApiBaseUrl();
const runId = randomUUID().slice(0, 8);
const password = `Weekly-${runId}!Aa1`;
let tenantId;
let userId;

function hashPassword(value) {
  const salt = randomUUID().replaceAll('-', '');
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}
const day = (value) => new Date(`${value}T00:00:00.000Z`);

async function call(path, init = {}, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function main() {
  const tenant = await prisma.tenant.create({ data: { name: `Weekly confirm ${runId}` } });
  tenantId = tenant.id;
  await prisma.tenantSubscription.create({ data: { tenantId, plan: 'PROFESSIONAL', status: 'ACTIVE' } });
  const user = await prisma.user.create({
    data: {
      loginId: `weekly-${runId}`,
      displayName: '週上限試験管理者',
      passwordHash: hashPassword(password),
      isActive: true,
    },
  });
  userId = user.id;
  await prisma.membership.create({ data: { tenantId, userId, role: 'ADMIN' } });

  const [staff, excluded] = await Promise.all([
    prisma.staff.create({
      data: {
        tenantId,
        employeeNumber: 'S001',
        displayName: '週上限試験職員',
        canWorkEarly: true,
        canWorkRegular: true,
        canWorkLate: true,
      },
    }),
    prisma.staff.create({
      data: { tenantId, employeeNumber: 'S002', displayName: '除外試験職員' },
    }),
  ]);
  const early = await prisma.workPattern.create({
    data: {
      tenantId,
      code: 'EARLY', name: '①', shortName: '①', displayOrder: 1,
      startTime: '07:00', endTime: '15:30', breakMinutes: 60,
      isWorking: true, countsTowardStaffing: true, isSystem: true,
    },
  });
  const excludedDefinition = await prisma.staffAttributeDefinition.create({
    data: { tenantId, code: 'GENERATOR_EXCLUDED', name: '生成対象外', category: 'ROLE' },
  });
  await prisma.staffAttributeAssignment.create({
    data: { tenantId, staffId: excluded.id, attributeDefinitionId: excludedDefinition.id },
  });
  await prisma.tenantFeature.create({
    data: {
      tenantId,
      featureCode: 'TENANT_CUSTOM_RULES',
      enabled: true,
      source: 'MANUAL',
      configuration: {
        weeklyPatternGroupLimit: {
          patternCodes: ['EARLY', 'P02', 'P03', 'P04', 'P05', 'LATE'],
          maxPerWeek: 1,
          relaxation: { enabled: true, maxPerWeek: 2, activationMode: 'FORMAL' },
        },
      },
    },
  });
  await prisma.tenantShiftSetting.create({
    data: { tenantId, saturdayOperationEnabled: false, sundayOperationEnabled: false },
  });
  const schedule = await prisma.monthlyShift.create({
    data: { tenantId, targetMonth: day('2036-03-01'), createdByUserId: userId },
  });
  const assignment = (staffId, date) => ({
    tenantId,
    monthlyShiftId: schedule.id,
    staffId,
    workDate: day(date),
    shiftType: 'EARLY',
    workPatternId: early.id,
    startTime: '07:00',
    endTime: '15:30',
    breakMinutes: 60,
  });
  await prisma.shiftAssignment.createMany({
    data: [
      assignment(staff.id, '2036-03-03'), assignment(staff.id, '2036-03-05'),
      assignment(excluded.id, '2036-03-03'), assignment(excluded.id, '2036-03-04'),
      assignment(excluded.id, '2036-03-05'), assignment(excluded.id, '2036-03-06'),
    ],
  });
  const login = await call('/auth/login', {
    method: 'POST', body: JSON.stringify({ loginId: user.loginId, password }),
  });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const normal = await call(`/shifts/${schedule.id}/confirm`, { method: 'POST' }, token);
  assert.equal(
    normal.status,
    200,
    `A: normal generated-equivalent schedule confirms: ${JSON.stringify(normal.body)}`,
  );
  await call(`/shifts/${schedule.id}/reopen`, { method: 'POST' }, token);
  await prisma.shiftAssignment.create({ data: assignment(staff.id, '2036-03-07') });
  const blocked = await call(`/shifts/${schedule.id}/confirm`, { method: 'POST' }, token);
  assert.equal(blocked.status, 409, 'B: manual third assignment blocks confirm');
  const warning = blocked.body.warnings.find((row) => row.code === 'WEEKLY_ROTATION_LIMIT_UNAPPROVED');
  assert.ok(warning.message.includes('週の対象ローテーション勤務は現在3回'));
  assert.ok(warning.message.includes('許容2回'));
  assert.ok(warning.message.includes('2036-03-03'));

  await prisma.tenantRuleException.create({
    data: {
      tenantId,
      exceptionDate: day('2036-03-07'),
      exceptionType: 'WEEKLY_ROTATION_LIMIT',
      configuration: { maxWeeklyRotationCount: 3, maxAssignments: 1 },
      reason: '管理者が週3回目を日付限定承認',
      sourceType: 'ADMIN_CONFIRMED',
      confirmedAt: new Date(),
      confirmedBy: userId,
    },
  });
  const approved = await call(`/shifts/${schedule.id}/confirm`, { method: 'POST' }, token);
  assert.equal(approved.status, 200, 'C: formal dated exception permits third assignment');
  await call(`/shifts/${schedule.id}/reopen`, { method: 'POST' }, token);
  await prisma.shiftAssignment.create({ data: assignment(staff.id, '2036-03-08') });
  const fourth = await call(`/shifts/${schedule.id}/confirm`, { method: 'POST' }, token);
  assert.equal(fourth.status, 409, 'D: week4+ blocks despite exception');
  assert.ok(fourth.body.warnings.some((row) => row.code === 'WEEKLY_ROTATION_WEEK4_PLUS'));
  console.log('weekly rotation manual-edit confirm E2E: PASS (A-E)');
}

main()
  .finally(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  })
  .catch((error) => { console.error(error); process.exitCode = 1; });
