const assert = require('node:assert/strict');
const { AssignedClass, EmploymentType, PrismaClient, ShiftType } = require('@prisma/client');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');
const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://localhost:8080/api';

async function call(path, init = {}, token) {
  const response = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function login(email, password = 'ChangeMe123!') {
  const result = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(result.status, 200);
  return result.body.accessToken;
}

async function main() {
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, contactName: true } });
  const setting = await prisma.tenantShiftSetting.findUniqueOrThrow({ where: { tenantId }, select: { saturdayOperationEnabled: true } });
  const adminToken = await login('owner@demo.enshift.local');
  const staffToken = await login('staff@demo.enshift.local');
  try {
    assert.equal((await call('/subscription')).status, 401);
    const subscription = await call('/subscription', {}, adminToken);
    assert.equal(subscription.status, 200);
    for (const key of ['plan', 'status', 'trialEndsAt', 'currentPeriodStartedAt', 'staffLimit', 'activeStaffCount']) assert.ok(key in subscription.body, key);
    assert.equal((await call('/subscription', {}, staffToken)).status, 403);

    const contactName = `Sprint9C 園長 ${Date.now()}`;
    let result = await call('/setup/tenant', { method: 'PATCH', body: JSON.stringify({ name: tenant.name, contactName }) }, adminToken);
    assert.equal(result.status, 200);
    assert.equal(result.body.contactName, contactName);
    assert.equal((await call('/setup', {}, adminToken)).body.contactName, contactName);

    result = await call('/setup/work-settings', { method: 'PATCH', body: JSON.stringify({ saturdayOperationEnabled: false }) }, adminToken);
    assert.equal(result.status, 200);
    assert.equal(result.body.shiftSettings.saturdayOperationEnabled, false);
    assert.equal((await call('/settings/shifts', {}, adminToken)).body.saturdayOperationEnabled, false);
    assert.equal((await call('/setup/work-settings', { method: 'PATCH', body: JSON.stringify({ saturdayOperationEnabled: 'invalid' }) }, adminToken)).status, 400);

    const generated = generateRuleBasedSchedule(new Date('2026-08-01T00:00:00.000Z'), [{
      id: 'staff-1', employeeNumber: '001', displayName: '検証職員', assignedClass: AssignedClass.FREE, employmentType: EmploymentType.FULL_TIME,
      canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: false, lateShiftOnly: false, canWorkSaturdays: true,
      monthlyWorkHourLimit: null, weeklyAvailableDays: null,
    }], [], {
      weekdayEarlyRequired: 0, weekdayLateRequired: 0, saturdayEarlyRequired: 1, saturdayLateRequired: 0,
      saturdayOperationEnabled: false, sundayOperationEnabled: false, maxConsecutiveWorkDays: 6, maxConsecutiveEarlyDays: 1, maxConsecutiveLateDays: 1,
      defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '09:00', defaultEndNormal: '18:00',
      defaultStartLate: '10:30', defaultEndLate: '20:00', defaultBreakMinutes: 60,
    });
    assert.equal(generated.assignments.find((item) => item.workDate.toISOString().startsWith('2026-08-01')).shiftType, ShiftType.OFF);
    assert.ok(generated.warnings.some((warning) => warning.code === 'SATURDAY_CLOSED'));
    console.log('Sprint 9-C API integration tests: PASS (契約表示・権限・園長氏名・土曜保育boolean・自動生成)');
  } finally {
    await prisma.tenant.update({ where: { id: tenantId }, data: { contactName: tenant.contactName } });
    await prisma.tenantShiftSetting.update({ where: { tenantId }, data: { saturdayOperationEnabled: setting.saturdayOperationEnabled } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
